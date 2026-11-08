// Every server setting the launcher offers, with what kind of value it is. The labels live in the interface's dictionaries, under
// `setting.<id>` and `group.<id>` (a unit test checks that every entry has one in each language).

/**
 * `multiplier`: a rate, 1 is the official one. `percent`: a chance of success, in percent. `points`: a number of points. `toggle`: on or off,
 * written 1 or 0. `flag`: on or off, written true or false (the bot options). `count`: a whole number within the definition's bounds.
 * `choice`: one of the definition's options, held as its index.
 * Rates hold one value per membership level on the server ("regular, premium"). The login server makes every player account premium, so the
 * launcher sets the premium value, the players', and keeps the regular one, the bots' (they have no account), as the server has it. The
 * regular accounts' official values are still read: the page offers them as a set of rates the players can choose.
 */
export type SettingKind = 'multiplier' | 'percent' | 'points' | 'toggle' | 'flag' | 'count' | 'choice'

/** What a count is counted in, shown after its field: a percent sign, or a word under `unit.<id>`. */
export type SettingUnit = 'percent' | 'levels' | 'listings' | 'kinah'

/** The account level a rate applies to. */
export type Membership = 'premium' | 'regular'

/** Where a membership's value sits in a rate's comma separated list; the server takes the last one when the list is shorter. */
export const MEMBERSHIP_LEVEL: Record<Membership, number> = { regular: 0, premium: 1 }

export interface SettingDefinition {
  /** Short and stable: the label's key, and the setting's identity between the interface and the main process. */
  id: string
  /** The key in the server's configuration. */
  key: string
  kind: SettingKind
  /** A count's bounds, in place of its kind's. */
  min?: number
  max?: number
  unit?: SettingUnit
  /** A choice's values as the server writes them. */
  options?: string[]
  /** Read when the game server starts only: a change waits for the next start, whatever the server can read again while it runs. */
  startOnly?: boolean
  /** A rate's account level: its value is that level's in the key's list. */
  membership?: Membership
}

/** Where a group is set: the server settings page, or the bots page. */
export type SettingPage = 'server' | 'bots'

export interface SettingGroup {
  id: string
  page?: SettingPage
  /** How the group's own field changes its settings: all to one value, all to a share of their official values, or no group field. */
  globalField: 'same-value' | 'percent-of-official' | 'none'
  settings: SettingDefinition[]
}

const bot = (id: string, kind: SettingKind, extra: Partial<SettingDefinition> = {}): SettingDefinition => ({
  id: `bots.${id}`,
  key: `gameserver.playerbot.${id}`,
  kind,
  ...extra
})

/** A rate, as the premium accounts have it: every player account is premium. */
const rate = (id: string, kind: SettingKind = 'multiplier'): SettingDefinition => ({ id, key: `gameserver.rates.${id}`, kind, membership: 'premium' })

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
  { id: 'skillXp', globalField: 'same-value', settings: ['skill_xp.gathering', 'skill_xp.crafting'].map((id) => rate(id)) },
  { id: 'ap', globalField: 'same-value', settings: ['ap.pve', 'ap.pvp.gain', 'ap.quest', 'ap.dredgion'].map((id) => rate(id)) },
  // A penalty, not a reward: in the gains' group, raising every gain at once would raise it too.
  { id: 'apLoss', globalField: 'none', settings: [rate('ap.pvp.loss')] },
  { id: 'gp', globalField: 'same-value', settings: [rate('gp.gain')] },
  {
    id: 'gpLoss',
    globalField: 'percent-of-official',
    settings: GP_LOSS_RANKS.map((rank) => ({ id: `gp_loss.${rank}`, key: `gameserver.topranking.gp_loss.${rank}`, kind: 'points' }))
  },
  { id: 'dp', globalField: 'same-value', settings: ['dp.pve', 'dp.pvp'].map((id) => rate(id)) },
  { id: 'loot', globalField: 'same-value', settings: ['drop', 'kinah.quest', 'gathering.count', 'sell_limit'].map((id) => rate(id)) },
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
  },
  // How many bots the world holds, read at each review of the population (30 s): a reload applies it within half a minute. The server's
  // population guard stops the arrivals where the machine runs short, whatever is set here.
  {
    id: 'botDensity',
    page: 'bots',
    globalField: 'none',
    settings: [
      bot('density.mode', 'choice', { options: ['AUTO', 'FIXED', 'FLOOR'] }),
      bot('density.percent', 'count', { min: 0, max: 100, unit: 'percent' })
    ]
  },
  // The bot options (the server's config/main/playerbot.properties). A world bot's experience is a percent of the official rate: the players'
  // rates never apply to it, so that raising them does not empty the regions of their bots. One percent is the floor, zero being no experience.
  {
    id: 'botXp',
    page: 'bots',
    globalField: 'none',
    settings: [
      bot('xp.solo', 'count', { min: 1, max: 1000, unit: 'percent' }),
      bot('xp.group', 'count', { min: 1, max: 1000, unit: 'percent' }),
      bot('xp.pvp', 'count', { min: 0, max: 1000, unit: 'percent' })
    ]
  },
  {
    id: 'botPvp',
    page: 'bots',
    globalField: 'none',
    settings: [
      bot('pvp.enable', 'flag'),
      bot('pvp.share.fighter', 'count', { min: 0, max: 100 }),
      bot('pvp.share.opportunist', 'count', { min: 0, max: 100 }),
      bot('pvp.share.peaceful', 'count', { min: 0, max: 100 }),
      bot('pvp.level_above', 'count', { min: 0, max: 65, unit: 'levels' }),
      bot('pvp.level_below', 'count', { min: 0, max: 65, unit: 'levels' })
    ]
  },
  {
    id: 'botChat',
    page: 'bots',
    globalField: 'none',
    settings: [bot('chat.enable', 'flag'), bot('chat.language', 'choice', { options: ['FR', 'EN'] })]
  },
  {
    id: 'broker',
    page: 'bots',
    globalField: 'none',
    settings: [
      bot('broker.enable', 'flag', { startOnly: true }),
      bot('broker.size', 'count', { min: 6000, max: 12000, unit: 'listings' }),
      bot('broker.buyer.enable', 'flag', { startOnly: true }),
      bot('broker.buyer.tolerance', 'count', { min: 0, max: 100, unit: 'percent' }),
      bot('broker.buyer.daily_kinah', 'count', { min: 0, max: 2_000_000_000, unit: 'kinah', startOnly: true })
    ]
  }
]

export const ALL_SETTINGS: SettingDefinition[] = SETTING_GROUPS.flatMap((group) => group.settings)

export const pageOf = (group: SettingGroup): SettingPage => group.page ?? 'server'

/** What a value may be, by kind; a count's own bounds come first. A rate of 0 is allowed: no AP lost on a PvP death is a choice. */
export const LIMITS: Record<SettingKind, { min: number; max: number; integer: boolean }> = {
  multiplier: { min: 0, max: 100, integer: false },
  percent: { min: 0, max: 100, integer: false },
  points: { min: 0, max: 100_000, integer: true },
  toggle: { min: 0, max: 1, integer: true },
  flag: { min: 0, max: 1, integer: true },
  count: { min: 0, max: 100_000, integer: true },
  choice: { min: 0, max: 0, integer: true }
}

export function limitsOf(definition: SettingDefinition): { min: number; max: number; integer: boolean } {
  const base = LIMITS[definition.kind]
  if (definition.kind === 'choice') {
    return { ...base, max: (definition.options?.length ?? 1) - 1 }
  }
  return { ...base, min: definition.min ?? base.min, max: definition.max ?? base.max }
}

export function isAllowed(definition: SettingDefinition, value: unknown): value is number {
  const limits = limitsOf(definition)
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max &&
    (!limits.integer || Number.isInteger(value))
  )
}

/**
 * The settings of a server, by setting id: what it uses now, and its official values (a rate's for premium accounts). Settings its files do not
 * have are left out. `regular` holds each rate's official value for regular accounts, which the page offers as a whole set.
 */
export interface ServerSettings {
  values: Record<string, number>
  official: Record<string, number>
  regular: Record<string, number>
}
