import { describe, expect, it } from 'vitest'
import { displayDir, RECENT_DIRS, recentDirs, tildify, withRecentDir } from './paths'

const home = '/Users/ralf'

describe('paths', () => {
  it('ersetzt nur echte Home-Präfixe', () => {
    expect(tildify('/Users/ralf/x', home)).toBe('~/x')
    expect(tildify('/Users/ralfine/x', home)).toBe('/Users/ralfine/x')
  })

  it('kurze Pfade ganz, mit / am Ende', () => {
    expect(displayDir('/Users/ralf/temp', home)).toBe('~/temp/')
    expect(displayDir('/tmp/', home)).toBe('/tmp/')
  })

  it('lange Pfade vorne an Ordnergrenzen gekürzt', () => {
    const d = displayDir('/Users/ralf/Repositories/08 Vibe Coding/Claude2UI', home)
    expect(d).toBe('…/08 Vibe Coding/Claude2UI/')
    expect(d.length).toBeLessThanOrEqual(28)
    expect(displayDir('/Users/ralf/Repositories/08 Vibe Coding/Claude2UI', home, 15)).toBe('…/Claude2UI/')
  })

  it('überlanger letzter Ordner wird von vorne gekürzt', () => {
    const d = displayDir('/a/ein-sehr-sehr-langer-ordnername-ohne-ende', home, 20)
    expect(d.length).toBe(20)
    expect(d.endsWith('ohne-ende/')).toBe(true)
  })
})

describe('zuletzt benutzte Verzeichnisse', () => {
  it('wirft Dubletten, Leeres und abschließende Schrägstriche weg, Reihenfolge bleibt', () => {
    expect(recentDirs(['/a', '/b/', '/a/', '', '/c'])).toEqual(['/a', '/b', '/c'])
  })

  it('merkt sich höchstens `max` Verzeichnisse', () => {
    expect(recentDirs(['/a', '/b', '/c'], 2)).toEqual(['/a', '/b'])
    expect(recentDirs(Array.from({ length: 30 }, (_, i) => `/d${i}`)).length).toBe(RECENT_DIRS)
  })

  it('schiebt das benutzte Verzeichnis nach vorn, ohne es zu verdoppeln', () => {
    expect(withRecentDir(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b'])
    expect(withRecentDir(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
    expect(withRecentDir(['/a'], '/a/')).toEqual(['/a'])
  })

  it('drängt das älteste heraus, wenn die Liste voll ist', () => {
    const voll = Array.from({ length: RECENT_DIRS }, (_, i) => `/d${i}`)
    const neu = withRecentDir(voll, '/neu')
    expect(neu.length).toBe(RECENT_DIRS)
    expect(neu[0]).toBe('/neu')
    expect(neu).not.toContain(`/d${RECENT_DIRS - 1}`)
  })
})
