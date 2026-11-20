import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkMove, mergeInto, moveWorkdirFiles, normPath, targetPath } from './movedir'
import { sessionsDir } from './sessions'

describe('Pfade beim Umzug', () => {
  it('vergleicht Pfade ohne abschließende Schrägstriche', () => {
    expect(normPath('/a/b/')).toBe('/a/b')
    expect(normPath('/a/b//')).toBe(normPath('/a/b'))
    expect(normPath('/')).toBe('/')
  })

  it('verschiebt in den gewählten Ordner hinein, zieht sonst nur den Pfad nach', () => {
    expect(targetPath('/tmp/abc', '/repos', true)).toBe('/repos/abc')
    expect(targetPath('/tmp/abc/', '/repos/', true)).toBe('/repos/abc')
    expect(targetPath('/tmp/abc', '/repos/abc', false)).toBe('/repos/abc')
  })
})

describe('Umzug auf der Platte', () => {
  let dir = ''
  const p = (...x: string[]): string => join(dir, ...x)
  const datei = (pfad: string, text: string): void => {
    mkdirSync(join(pfad, '..'), { recursive: true })
    writeFileSync(pfad, text)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'c2ui-umzug-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('sagt vorher, was nicht geht', () => {
    mkdirSync(p('tmp/abc'), { recursive: true })
    expect(checkMove(p('tmp/abc'), p('tmp/abc'), true)).toMatch(/schon das Arbeitsverzeichnis/)
    expect(checkMove(p('weg'), p('repos/weg'), true)).toMatch(/gibt es nicht mehr/)
    mkdirSync(p('repos/abc'), { recursive: true })
    expect(checkMove(p('tmp/abc'), p('repos/abc'), true)).toMatch(/gibt es schon/)
    // Ohne Verschieben muss das Ziel dagegen existieren.
    expect(checkMove(p('tmp/abc'), p('repos/abc'), false)).toBeNull()
    expect(checkMove(p('tmp/abc'), p('repos/fehlt'), false)).toMatch(/gibt es nicht/)
  })

  it('nimmt Artefakte, Verlauf und Gedächtnis mit', () => {
    const home = p('home')
    const from = p('tmp/abc')
    datei(join(from, 'ergebnis.md'), 'Artefakt')
    const alt = sessionsDir(home, from)
    datei(join(alt, 'sitzung.jsonl'), '{"a":1}')
    datei(join(alt, 'memory', 'MEMORY.md'), '- etwas gemerkt')
    const to = targetPath(from, p('repos'), true)

    expect(moveWorkdirFiles(from, to, true, home)).toEqual([])

    expect(readFileSync(join(to, 'ergebnis.md'), 'utf8')).toBe('Artefakt')
    const neu = sessionsDir(home, to)
    expect(readFileSync(join(neu, 'sitzung.jsonl'), 'utf8')).toBe('{"a":1}')
    expect(readFileSync(join(neu, 'memory', 'MEMORY.md'), 'utf8')).toBe('- etwas gemerkt')
    expect(readdirSync(p('tmp'))).toEqual([])
  })

  it('führt zusammen, wenn am Ziel schon ein Projektordner liegt – ohne etwas zu überschreiben', () => {
    const home = p('home')
    const from = p('tmp/abc')
    mkdirSync(from, { recursive: true })
    const alt = sessionsDir(home, from)
    datei(join(alt, 'neu.jsonl'), 'neu')
    datei(join(alt, 'memory', 'MEMORY.md'), 'neues Gedächtnis')
    datei(join(alt, 'memory', 'extra.md'), 'kommt mit')
    const to = p('repos/abc')
    const ziel = sessionsDir(home, to)
    datei(join(ziel, 'alt.jsonl'), 'alt')
    datei(join(ziel, 'memory', 'MEMORY.md'), 'altes Gedächtnis')

    const skipped = moveWorkdirFiles(from, to, true, home)

    expect(skipped).toEqual(['memory/MEMORY.md'])
    expect(readFileSync(join(ziel, 'alt.jsonl'), 'utf8')).toBe('alt')
    expect(readFileSync(join(ziel, 'neu.jsonl'), 'utf8')).toBe('neu')
    expect(readFileSync(join(ziel, 'memory', 'extra.md'), 'utf8')).toBe('kommt mit')
    // Die vorhandene Datei bleibt, die mitgebrachte liegt noch im alten Ordner.
    expect(readFileSync(join(ziel, 'memory', 'MEMORY.md'), 'utf8')).toBe('altes Gedächtnis')
    expect(readFileSync(join(alt, 'memory', 'MEMORY.md'), 'utf8')).toBe('neues Gedächtnis')
  })

  it('zieht auch ohne Verschieben den Projektordner nach', () => {
    const home = p('home')
    const from = p('tmp/abc')
    const to = p('repos/abc')
    mkdirSync(to, { recursive: true })
    datei(join(sessionsDir(home, from), 'sitzung.jsonl'), '{"a":1}')

    expect(moveWorkdirFiles(from, to, false, home)).toEqual([])
    expect(readFileSync(join(sessionsDir(home, to), 'sitzung.jsonl'), 'utf8')).toBe('{"a":1}')
  })

  it('kommt ohne Projektordner aus (Chat ohne Claude-Verlauf)', () => {
    const home = p('home')
    const from = p('tmp/abc')
    mkdirSync(from, { recursive: true })
    expect(moveWorkdirFiles(from, p('repos/abc'), true, home)).toEqual([])
    expect(readdirSync(p('repos'))).toEqual(['abc'])
  })

  it('führt einzelne Ordner zusammen, ohne Vorhandenes anzufassen', () => {
    datei(p('a/eins.txt'), 'eins')
    datei(p('a/tief/zwei.txt'), 'zwei')
    datei(p('b/tief/zwei.txt'), 'schon da')
    expect(mergeInto(p('a'), p('b'))).toEqual(['tief/zwei.txt'])
    expect(readFileSync(p('b/eins.txt'), 'utf8')).toBe('eins')
    expect(readFileSync(p('b/tief/zwei.txt'), 'utf8')).toBe('schon da')
  })
})
