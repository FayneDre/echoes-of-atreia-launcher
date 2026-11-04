// Every server setting the launcher offers, with what kind of value it is. The labels live in the interface's dictionaries, under
// `setting.<id>` and `group.<id>` (a unit test checks that every entry has one in each language).

/**
 * `multiplier`: a rate, 1 is the official one. `percent`: a chance of success, in percent. `points`: a number of points. `toggle`: on or off.
 * Rates hold one value per membership level on the server; the launcher sets the regular accounts' only, and writes it alone, which the server
 * then applies to every level.
 */
export type SettingKind = 'multiplier' | 'percent' | 'points' | 'toggle'

export interface SettingDefinition {
  /** Short and stable: the label's key, and the setting's identity between the interface and the main process. */
  id: string
  /** The key in the server's configuration. */
  key: string
  kind: SettingKind
}

export interface SettingGroup {
  id: string
  /** How the group's own field changes its settings: all to one value, all to a share of their official values, or no group field. */
  globalField: 'same-value' | 'percent-of-official' | 'none'
  settings: SettingDefinition[]
}

const rate = (id: string, kind: SettingKind = 'multiplier'): SettingDefinition => ({ id, key: `gameserver.rates.${id}`, kind })

// The Abyss officer ranks, from the lowest: each loses Glory Points every day at noon.
const GP_LOSS_RANKS = [
  'STAR1_OFFICER',
  'STAR2_OFFICER',
  'STAR3_OFFICER',
  'STAR4_OFFICER',
  'STAR5_OFFICER',
  'GENERAL',
  'GREAT_GENERAL',
  'COMMANDER',
  'SUPREME_COMMANDER'
]

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'xp',
    globalField: 'same-value',
    settings: ['xp.solo', 'xp.group', 'xp.quest', 'xp.gathering', 'xp.crafting', 'xp.pvp'].map((id) => rate(id))
  },
  { id: 'skillXp', globalField: 'same-value', settings: [rate('skill_xp.gathering'), rate('skill_xp.crafting')] },
  { id: 'ap', globalField: 'same-value', settings: [rate('ap.pve'), rate('ap.pvp.gain'), rate('ap.quest'), rate('ap.dredgion')] },
  // A penalty, not a reward: in the gains' group, raising every gain at once would raise it too.
  { id: 'apLoss', globalField: 'none', settings: [rate('ap.pvp.loss')] },
  { id: 'gp', globalField: 'same-value', settings: [rate('gp.gain')] },
  {
    id: 'gpLoss',
    globalField: 'percent-of-official',
    settings: GP_LOSS_RANKS.map((rank) => ({ id: `gp_loss.${rank}`, key: `gameserver.topranking.gp_loss.${rank}`, kind: 'points' }))
  },
  { id: 'dp', globalField: 'same-value', settings: [rate('dp.pve'), rate('dp.pvp')] },
  { id: 'loot', globalField: 'same-value', settings: [rate('drop'), rate('kinah.quest'), rate('gathering.count'), rate('sell_limit')] },
  {
    id: 'arena',
    globalField: 'same-value',
    settings: ['pvparena.discipline', 'pvparena.chaos', 'pvparena.harmony', 'pvparena.glory'].map((id) => rate(id))
  },
  {
    id: 'chances',
    globalField: 'none',
    settings: [
      'crafting.crit_chances',
      'crafting.combo_crit_chances',
      'manastone_chances',
      'enchantment_stone.base_chances',
      'enchantment_stone.amplified_chances',
      'tampering_chances'
    ].map((id) => rate(id, 'percent'))
  },
  {
    id: 'account',
    globalField: 'none',
    settings: [{ id: 'bothFactions', key: 'gameserver.character.creation.mode', kind: 'toggle' }]
  }
]

export const ALL_SETTINGS: SettingDefinition[] = SETTING_GROUPS.flatMap((group) => group.settings)

/** What a value may be, by kind. A rate of 0 is allowed: no AP lost on a PvP death is a choice. */
export const LIMITS: Record<SettingKind, { min: number; max: number; integer: boolean }> = {
  multiplier: { min: 0, max: 100, integer: false },
  percent: { min: 0, max: 100, integer: false },
  points: { min: 0, max: 100_000, integer: true },
  toggle: { min: 0, max: 1, integer: true }
}

export function isAllowed(definition: SettingDefinition, value: unknown): value is number {
  const limits = LIMITS[definition.kind]
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max &&
    (!limits.integer || Number.isInteger(value))
  )
}

/** The settings of a server, by setting id: what it uses now, and its official values. Settings its files do not have are left out. */
export interface ServerSettings {
  values: Record<string, number>
  official: Record<string, number>
}
