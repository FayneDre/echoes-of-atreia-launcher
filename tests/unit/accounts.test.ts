import { describe, expect, it } from 'vitest'
import { databaseOf, passwordHash } from '../../src/main/accounts/accountStore'
import { levelForExp, parseExperienceTable, parseMapNames } from '../../src/main/accounts/gameData'
import { en } from '../../src/renderer/src/i18n/en'
import { fr } from '../../src/renderer/src/i18n/fr'

describe('accounts', () => {
  it('hashes a password as the login server does: SHA-1 of its UTF-8 bytes, in Base64', () => {
    // The same values Java's MessageDigest and Base64 give.
    expect(passwordHash('password')).toBe('W6ph5Mm5Pz8GgiULbPgzG37mj9g=')
    expect(passwordHash('mot de passe é')).toBe(passwordHash('mot de passe é'))
    expect(passwordHash('a')).not.toBe(passwordHash('A'))
  })

  it('reads the database of a server from its JDBC URL', () => {
    expect(databaseOf('jdbc:mysql://localhost:3306/aion_ls?serverTimezone=&characterEncoding=UTF-8')).toEqual({
      host: 'localhost',
      port: 3306,
      database: 'aion_ls'
    })
    expect(databaseOf('jdbc:mysql://db.local/aion_gs')).toEqual({ host: 'db.local', port: 3306, database: 'aion_gs' })
    expect(databaseOf(undefined)).toBeNull()
  })
})

describe('game data', () => {
  const thresholds = parseExperienceTable(
    '<player_experience_table><exp>0</exp><!-- 0 --><exp>400</exp><exp>1433</exp><exp>3820</exp></player_experience_table>'
  )

  it('reads the experience table', () => {
    expect(thresholds).toEqual([0, 400, 1433, 3820])
  })

  it('gives the level the server gives for an amount of experience', () => {
    expect(levelForExp(thresholds, 0)).toBe(1)
    expect(levelForExp(thresholds, 399)).toBe(1)
    expect(levelForExp(thresholds, 400)).toBe(2)
    expect(levelForExp(thresholds, 1500)).toBe(3)
    // Capped one under the table's length, as the server caps it.
    expect(levelForExp(thresholds, 999_999)).toBe(3)
  })

  it('reads the map names, whatever the order of the attributes', () => {
    const names = parseMapNames(
      '<world_maps><map id="110010000" cName="LC1" name="Sanctum" name_id="1"/>' +
        '<map name="Poeta" id="210010000" world_type="ELYSEA"/><map id="1"/></world_maps>'
    )
    expect(names.get(110010000)).toBe('Sanctum')
    expect(names.get(210010000)).toBe('Poeta')
    expect(names.has(1)).toBe(false)
  })

  it('names every class of the players table, in both languages', () => {
    const classes = ['WARRIOR', 'GLADIATOR', 'TEMPLAR', 'SCOUT', 'ASSASSIN', 'RANGER', 'MAGE', 'SORCERER', 'SPIRIT_MASTER', 'PRIEST']
      .concat(['CLERIC', 'CHANTER', 'ENGINEER', 'GUNNER', 'ARTIST', 'BARD', 'RIDER'])
      .map((playerClass) => `class.${playerClass}`)
    expect(classes.filter((key) => !(key in en) || !(key in fr))).toEqual([])
  })
})
