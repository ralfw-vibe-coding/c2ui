import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, migrateSettings } from './types'

describe('migrateSettings', () => {
  it('liefert Standardwerte ohne gespeicherte Einstellungen', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('übernimmt das alte Format (nur Claude) in agents.claude', () => {
    const s = migrateSettings({ model: 'haiku', claudePath: '/x/claude', defaultPermissionMode: 'plan', idleTimeoutMinutes: 3 })
    expect(s.agents.claude).toEqual({ path: '/x/claude', model: 'haiku', defaultMode: 'plan' })
    expect(s.agents.codex).toEqual(DEFAULT_SETTINGS.agents.codex)
    expect(s.idleTimeoutMinutes).toBe(3)
  })

  it('übernimmt das neue Format und ergänzt fehlende Felder', () => {
    const s = migrateSettings({ agents: { codex: { model: 'gpt-x' } } })
    expect(s.agents.codex).toEqual({ ...DEFAULT_SETTINGS.agents.codex, model: 'gpt-x' })
  })
  it('übernimmt die größte Chatbreite, 0 heißt „so breit wie die Zelle“', () => {
    expect(migrateSettings({ chatWidth: 640 }).chatWidth).toBe(640)
    expect(migrateSettings({ chatWidth: 0 }).chatWidth).toBe(0)
    // Unsinn fällt auf den Standard zurück.
    expect(migrateSettings({ chatWidth: -5 }).chatWidth).toBe(DEFAULT_SETTINGS.chatWidth)
    expect(migrateSettings({ chatWidth: 'breit' }).chatWidth).toBe(DEFAULT_SETTINGS.chatWidth)
  })
})
