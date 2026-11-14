import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listClaudeSessions, projectSlug, sessionsDir, titleFromLog } from './sessions'

const line = (o: unknown): string => JSON.stringify(o) + '\n'
const user = (text: string, extra = {}) => line({ type: 'user', isSidechain: false, message: { role: 'user', content: text }, ...extra })

describe('Bestehende CLI-Sessions', () => {
  it('bildet den Ordnernamen wie Claude', () => {
    expect(projectSlug('/Users/ralfw/Repositories/08 Vibe Coding/Claude2UI')).toBe('-Users-ralfw-Repositories-08-Vibe-Coding-Claude2UI')
    expect(projectSlug('/a/Bücher - x')).toBe('-a-B-cher---x')
    expect(sessionsDir('/h', '/a b', undefined)).toBe('/h/.claude/projects/-a-b')
    expect(sessionsDir('/h', '/a b', '/anderswo')).toBe('/anderswo/projects/-a-b')
  })

  it('nimmt als Titel die erste echte Nutzernachricht', () => {
    const log =
      line({ type: 'queue-operation', content: 'egal' }) +
      user('Werkzeugergebnis', { isSidechain: true }) +
      line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }) +
      user('  Hallo\n  Welt  ') +
      user('zweite')
    expect(titleFromLog(log)).toBe('Hallo Welt')
    expect(titleFromLog(user('x'.repeat(200)), 10)).toBe('xxxxxxxxx…')
    expect(titleFromLog('kaputt{')).toBe('')
  })

  it('listet Sessions eines Verzeichnisses, neueste zuerst; leere und fremde Dateien nicht', async () => {
    const home = mkdtempSync(join(tmpdir(), 'c2ui-sessions-'))
    const cwd = '/Users/x/Mein Projekt'
    const dir = sessionsDir(home, cwd, undefined)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'alt.jsonl'), user('Älterer Chat'))
    writeFileSync(join(dir, 'leer.jsonl'), '')
    writeFileSync(join(dir, 'notizen.txt'), 'kein Log')
    await new Promise((r) => setTimeout(r, 12))
    writeFileSync(join(dir, 'neu.jsonl'), user('Neuester Chat'))

    const list = await listClaudeSessions(home, cwd, join(home, '.claude'))
    expect(list.map((s) => s.sessionId)).toEqual(['neu', 'alt'])
    expect(list[0]).toMatchObject({ title: 'Neuester Chat' })
    expect(list[0].bytes).toBeGreaterThan(0)
    expect(await listClaudeSessions(home, '/gibt/es/nicht', join(home, '.claude'))).toEqual([])
  })
})
