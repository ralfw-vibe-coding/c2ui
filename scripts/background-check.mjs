// Prüfung ohne Modellaufruf: Arbeit, die nach dem Turn weiterläuft.
// Eine CLI-Attrappe startet einen Befehl im Hintergrund, beendet den Turn und meldet später
// „fertig“ – wie die echte Claude-CLI. C2UI muss beides anzeigen: dass etwas läuft, und dass
// der Chat danach von selbst weiterarbeitet.
// Aufruf: npm run build && node scripts/background-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/background'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'bilder', title: 'Bilder', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'bilder', sessionStarted: false, createdAt: 1, updatedAt: 2 }
]))
writeFileSync(join(userData, 'transcripts', 'bilder.json'), JSON.stringify([]))

// Attrappe der Claude-CLI: Werkzeugaufruf im Hintergrund, Turn-Ende, zwei Sekunden später die
// Fertigmeldung und eine Antwort – genau der Ablauf der echten CLI (Wortlaut übernommen).
const fake = join(out, 'fake-claude.mjs')
writeFileSync(fake, `#!/usr/bin/env node
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
const ergebnis = (ms) => say({ type: 'result', subtype: 'success', duration_ms: ms, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 }, modelUsage: { 'claude-test': { contextWindow: 200000 } } })
say({ type: 'system', subtype: 'init', session_id: 'sitzung-1' })
let ersterTurn = true
process.stdin.on('data', () => {
  if (!ersterTurn) return
  ersterTurn = false
  setTimeout(() => {
    say({ type: 'assistant', message: { id: 'msg_1', model: 'claude-test', content: [
      { type: 'text', text: 'Ich starte die Bilder im Hintergrund.' },
      { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'sleep 600', description: 'Sechs Bilder erzeugen', run_in_background: true } }
    ] } })
    say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Command running in background with ID: bg7x. Output is being written to: /tmp/bg7x.output. You will be notified when it completes.' }] } })
    ergebnis(300)
    // ... und nach einer Weile die Meldung der CLI, woraufhin der Agent weiterarbeitet.
    setTimeout(() => {
      // Wie die echte CLI: Text am Stück, und weil C2UI mit --replay-user-messages startet,
      // kommt auch diese eingeschobene Nachricht als Wiedergabe zurück.
      say({ type: 'user', isReplay: true, message: { content: 'Systemmeldung.\\n\\n<task-notification>\\n<task-id>bg7x</task-id>\\n<tool-use-id>toolu_1</tool-use-id>\\n<status>completed</status>\\n<summary>Background command "Sechs Bilder erzeugen" completed (exit code 0)</summary>\\n</task-notification>' } })
      // Der Agent braucht danach noch einen Moment – wie im echten Leben.
      setTimeout(() => {
        say({ type: 'assistant', message: { id: 'msg_2', model: 'claude-test', content: [{ type: 'text', text: 'Die sechs Bilder sind fertig.' }] } })
        ergebnis(200)
      }, 2000)
    }, 2500)
  }, 200)
})
`, { mode: 0o755 })

const log = (...x) => console.log('[hintergrund]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData, PATH: process.env.PATH } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.evaluate(async (cli) => {
  const s = (await window.api.init()).settings
  await window.api.setSettings({ agents: { ...s.agents, claude: { ...s.agents.claude, path: cli } } })
}, fake)
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

const ta = page.locator('.cell .composer textarea').first()
await ta.fill('Mach die sechs Bilder.')
await ta.press('Enter')

// Der Turn endet, der Hintergrundbefehl läuft weiter
await page.locator('.working.background').waitFor({ timeout: 15_000 })
check((await page.locator('.cell .working:not(.background)').count()) === 0, 'der Turn ist zu Ende')
check((await page.locator('.working.background .spinner').count()) === 1, 'die Hintergrundzeile dreht sich sichtbar weiter')
const hinweis = await page.locator('.working.background').innerText()
log('Hinweis:', hinweis.replace(/\s+/g, ' '))
check(/Sechs Bilder erzeugen/.test(hinweis), 'der Chat sagt, was im Hintergrund läuft')
check(/arbeitet der Chat weiter/.test(hinweis), 'und dass es danach weitergeht')
check((await page.locator('.chat-item .chat-background').count()) === 1, 'die Seitenleiste zeigt es auch')
// Der Punkt am offenen Chat pulst nur, solange wirklich etwas läuft.
const punkt = await page.evaluate(() => {
  const d = document.querySelector('.chat-item .dot')
  return d ? { live: d.classList.contains('live'), animation: getComputedStyle(d).animationName } : null
})
log('Punkt:', JSON.stringify(punkt))
check(punkt?.live === true && punkt.animation === 'rec', 'der Punkt am Chat pulst, solange etwas läuft')
await page.screenshot({ path: join(out, '1-laeuft.png') })

// Die CLI meldet „fertig“: der Chat arbeitet sichtbar weiter
await page.locator('.cell .working:not(.background)').waitFor({ timeout: 15_000 })
check(true, 'nach der Fertigmeldung arbeitet der Chat sichtbar weiter')
check((await page.locator('.working.background').count()) === 0, 'der Hinweis auf den Hintergrund ist weg')
check((await page.locator('.chat-item .chat-background').count()) === 0, 'in der Seitenleiste ebenso')
check((await page.locator('.chat-item .dot.live').count()) === 0, 'und der Punkt steht wieder still')

// Und am Ende steht die Antwort samt Hinweis im Verlauf
await page.locator('.transcript', { hasText: 'Die sechs Bilder sind fertig.' }).waitFor({ timeout: 15_000 })
await page.waitForTimeout(600)
const verlauf = (await page.locator('.transcript-inner').innerText()).replace(/\s+/g, ' ')
log('Verlauf:', verlauf.slice(0, 220))
check(/Im Hintergrund fertig: „Sechs Bilder erzeugen“/.test(verlauf), 'der Verlauf hält fest, dass der Befehl fertig wurde')
check(/Die sechs Bilder sind fertig\./.test(verlauf), 'die Antwort danach steht im Verlauf')
check((await page.locator('.cell .working').count()) === 0, 'danach ist der Chat wieder ruhig')
await page.screenshot({ path: join(out, '2-fertig.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
