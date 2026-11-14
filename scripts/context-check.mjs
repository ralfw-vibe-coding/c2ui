// Prüfung ohne Modellaufruf: Kontextfüllstand. Eine CLI-Attrappe liefert die Zahlen so, wie die
// echte Claude-CLI sie meldet: je Assistant-Nachricht den Füllstand, am Turn-Ende die über den
// ganzen Turn aufsummierte Nutzung. Gezeigt werden muss der Füllstand, nicht die Summe.
// Aufruf: npm run build && node scripts/context-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/context'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'transcripts', 'lang.json'), JSON.stringify([]))
// Ein Chat mit einem Füllstand aus der früheren Fehlrechnung (mehr als das Fenster).
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'lang', title: 'Langer Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'lang', sessionStarted: false, createdAt: 1, updatedAt: 2,
    context: { used: 5000706, max: 1000000, at: 1 } }
]))

// Attrappe: drei Anfragen in einem Turn, jede liest den Cache neu. Der Füllstand wächst auf
// 400.000; die Summe am Turn-Ende wäre mit 1.200.000 weit über dem Fenster.
const fake = join(out, 'fake-claude.mjs')
writeFileSync(fake, `#!/usr/bin/env node
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
const nachricht = (id, cacheRead, text) => say({ type: 'assistant', message: { id, model: 'claude-test',
  usage: { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: cacheRead, output_tokens: 500 },
  content: [{ type: 'text', text }] } })
say({ type: 'system', subtype: 'init', session_id: 'sitzung-1' })
let erster = true
process.stdin.on('data', () => {
  if (!erster) return
  erster = false
  setTimeout(() => {
    nachricht('msg_1', 98490, 'Erster Schritt.')
    nachricht('msg_2', 198490, 'Zweiter Schritt.')
    nachricht('msg_3', 398490, 'Fertig.')
    say({ type: 'result', subtype: 'success', duration_ms: 300, total_cost_usd: 0.02,
      usage: { input_tokens: 30, cache_creation_input_tokens: 3000, cache_read_input_tokens: 695470, output_tokens: 1500 },
      modelUsage: { 'claude-test': { contextWindow: 1000000 } } })
  }, 200)
})
`, { mode: 0o755 })

const log = (...x) => console.log('[kontext]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

// Der unmögliche Wert aus der Ablage wird gar nicht erst gezeigt.
check((await page.locator('.context-gauge').count()) === 0, 'ein Füllstand über der Fenstergröße wird verworfen')

await page.evaluate(async (cli) => {
  const s = (await window.api.init()).settings
  await window.api.setSettings({ agents: { ...s.agents, claude: { ...s.agents.claude, path: cli } } })
}, fake)
const ta = page.locator('.cell .composer textarea').first()
await ta.fill('Leg los.')
await ta.press('Enter')
await page.locator('.context-gauge').waitFor({ timeout: 15_000 })
await page.waitForTimeout(600)

const stand = await page.evaluate(() => {
  const g = document.querySelector('.context-gauge')
  return { text: g?.innerText.trim(), titel: g?.getAttribute('title') }
})
log('Anzeige:', JSON.stringify(stand))
const gespeichert = await page.evaluate(async () => (await window.api.init()).chats.find((c) => c.id === 'lang')?.context)
log('gespeichert:', JSON.stringify(gespeichert))
check(gespeichert?.used === 400000, 'gezeigt wird der Füllstand der letzten Anfrage (400.000)')
check(gespeichert?.max === 1000000, 'die Fenstergröße kommt aus modelUsage')
check(/40\s*%/.test(stand.text ?? ''), 'das sind 40 % – nicht 100 %')
await page.screenshot({ path: join(out, '1-fuellstand.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
