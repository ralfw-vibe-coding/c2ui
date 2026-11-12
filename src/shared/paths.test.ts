import { describe, expect, it } from 'vitest'
import { displayDir, tildify } from './paths'

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
