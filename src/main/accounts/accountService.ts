import { safeStorage } from 'electron'
import type { AccountsState, CharacterSummary, Problem } from '../../shared/types'
import type { ServerLayout } from '../server/installation'
import type { SavedAccount, SettingsStore } from '../settings'
import { accountStoreFor, passwordHash, type AccountRecord } from './accountStore'
import { loadGameData } from './gameData'

type Verification = { account: AccountRecord } | { problem: Problem }

/**
 * The accounts of the person using the launcher: signed in with their name and password, checked against the login server's database the way
 * the login server checks them, and kept on this computer with the password encrypted by the operating system. One of them is active, and on
 * it one character is the one played with: the launcher's actions on a character will be on that one.
 */
export class AccountService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly layout: () => ServerLayout | null
  ) {}

  private saved(): SavedAccount[] {
    return this.settings.current.accounts ?? []
  }

  private async verify(name: string, password: string): Promise<Verification> {
    const layout = this.layout()
    if (!layout) {
      return { problem: { code: 'server-missing' } }
    }
    let account: AccountRecord | null
    try {
      account = await accountStoreFor(layout).findAccount(name)
    } catch (error) {
      return { problem: { code: 'database-unreachable', detail: (error as Error).message } }
    }
    if (!account) {
      return { problem: { code: 'account-unknown' } }
    }
    if (account.passwordHash !== passwordHash(password)) {
      return { problem: { code: 'password-wrong' } }
    }
    return { account }
  }

  private async characters(account: AccountRecord): Promise<CharacterSummary[] | Problem> {
    const layout = this.layout()!
    try {
      const [records, data] = await Promise.all([accountStoreFor(layout).listCharacters(account.id), loadGameData(layout.servers.game.dir)])
      return records.map((record) => ({
        id: record.id,
        name: record.name,
        level: data.levelFor(record.exp),
        playerClass: record.playerClass,
        race: record.race,
        gender: record.gender,
        mapName: data.mapName(record.worldId),
        online: record.online,
        deleting: record.deleting
      }))
    } catch (error) {
      return { code: 'database-unreachable', detail: (error as Error).message }
    }
  }

  /**
   * The saved accounts and the active one's characters. The stored password is checked again each time: a password changed on the server
   * since asks for the new one rather than showing what the old one opened.
   */
  async getState(): Promise<AccountsState> {
    const saved = this.saved()
    // An account kept without one being active (a settings file edited by hand) makes the first one active rather than show nothing.
    const active = this.settings.current.activeAccount ?? saved[0]?.name ?? null
    const base: AccountsState = { accounts: saved.map((entry) => entry.name), active, characters: [], selectedCharacterId: null }
    const entry = saved.find((candidate) => candidate.name === active)
    if (!entry) {
      return { ...base, active: null }
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ...base, problem: { code: 'encryption-unavailable' } }
    }
    let password: string
    try {
      password = safeStorage.decryptString(Buffer.from(entry.password, 'base64'))
    } catch {
      // Encrypted for another Windows user or another computer (a copied profile): it has to be typed again.
      return { ...base, problem: { code: 'password-needed' } }
    }
    const verified = await this.verify(entry.name, password)
    if ('problem' in verified) {
      return { ...base, problem: verified.problem.code === 'password-wrong' ? { code: 'password-needed' } : verified.problem }
    }
    const characters = await this.characters(verified.account)
    if (!Array.isArray(characters)) {
      return { ...base, problem: characters }
    }
    const selected = this.settings.current.selectedCharacters?.[entry.name] ?? null
    return {
      ...base,
      characters,
      selectedCharacterId: characters.some((character) => character.id === selected) ? selected : null
    }
  }

  /** Signs in, then saves the account (or its new password) and makes it the active one. Resolves to the problem when it did not work. */
  async signIn(name: string, password: string): Promise<Problem | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      return { code: 'encryption-unavailable' }
    }
    const verified = await this.verify(name, password)
    if ('problem' in verified) {
      return verified.problem
    }
    // The name as the database spells it, so one account is never saved twice under two spellings.
    const accountName = verified.account.name
    const encrypted = safeStorage.encryptString(password).toString('base64')
    await this.settings.update((settings) => ({
      ...settings,
      accounts: [...(settings.accounts ?? []).filter((saved) => saved.name !== accountName), { name: accountName, password: encrypted }],
      activeAccount: accountName
    }))
    return null
  }

  async switchTo(name: string): Promise<void> {
    if (this.saved().some((entry) => entry.name === name)) {
      await this.settings.update((settings) => ({ ...settings, activeAccount: name }))
    }
  }

  /** Forgets an account on this computer: its saved password and chosen character. Nothing changes on the server. */
  async forget(name: string): Promise<void> {
    await this.settings.update((settings) => {
      const accounts = (settings.accounts ?? []).filter((entry) => entry.name !== name)
      const selectedCharacters = { ...settings.selectedCharacters }
      delete selectedCharacters[name]
      return {
        ...settings,
        accounts,
        selectedCharacters,
        activeAccount: settings.activeAccount === name ? accounts[0]?.name : settings.activeAccount
      }
    })
  }

  async selectCharacter(characterId: number): Promise<void> {
    const active = this.settings.current.activeAccount
    if (active) {
      await this.settings.update((settings) => ({
        ...settings,
        selectedCharacters: { ...settings.selectedCharacters, [active]: characterId }
      }))
    }
  }
}
