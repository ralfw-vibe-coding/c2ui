import { describe, expect, it } from 'vitest'
import { compareVersions, newest, parseCodexVersion } from './codexBinary'

describe('Codex-Version', () => {
  it('liest die Version aus --version', () => {
    expect(parseCodexVersion('codex-cli 0.144.1\n')).toBe('0.144.1')
    expect(parseCodexVersion('codex-cli 0.167.0-alpha.3.2')).toBe('0.167.0-alpha.3.2')
    expect(parseCodexVersion('kaputt')).toBeNull()
  })

  it('vergleicht numerisch, Vorabversionen verlieren bei Gleichstand', () => {
    expect(compareVersions('0.167.0-alpha.3.2', '0.144.1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('0.167.0', '0.167.0-alpha.3')).toBeGreaterThan(0)
    expect(compareVersions('0.167.0-alpha.10', '0.167.0-alpha.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('wählt die neueste', () => {
    expect(newest([])).toBeNull()
    expect(
      newest([
        { path: '/usr/local/bin/codex', version: '0.144.1' },
        { path: '/Applications/ChatGPT.app/…/codex', version: '0.167.0-alpha.3.2' }
      ])?.path
    ).toBe('/Applications/ChatGPT.app/…/codex')
  })
})
