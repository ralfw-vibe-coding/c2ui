// Prüfung ohne Modellaufruf: Während eine lange Antwort hereinläuft, muss man hochscrollen können.
// Eine CLI-Attrappe schreibt eine Antwort, die immer länger wird; C2UI hält den Chat dabei am Ende.
// Sobald der Mensch nach oben scrollt, gehört ihm die Ansicht – auch wenn weiter Text nachkommt.
// Aufruf: npm run build && node scripts/scroll-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/scroll'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'c', title: 'Langer Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'c', sessionStarted: false, createdAt: 1, updatedAt: 2 }
]))
writeFileSync(join(userData, 'transcripts', 'c.json'), JSON.stringify([]))

// Attrappe: eine Antwort, die in vielen Schritten wächst – wie echtes Streaming.
const fake = join(out, 'fake-claude.mjs')
writeFileSync(fake, `#!/usr/bin/env node
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
say({ type: 'system', subtype: 'init', session_id: 'sitzung-1' })
let erster = true
process.stdin.on('data', () => {
  if (!erster) return
  erster = false
  let text = ''
  let i = 0
  const timer = setInterval(() => {
    i++
    text += 'Absatz ' + i + ': ' + 'Dies ist ein längerer Satz über die Sache. '.repeat(6) + '\\n\\n'
    say({ type: 'assistant', message: { id: 'msg_1', model: 'claude-test', content: [{ type: 'text', text }] } })
    if (i >= 60) {
      clearInterval(timer)
      say({ type: 'result', subtype: 'success', duration_ms: 6000, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } })
    }
  }, 100)
})
`, { mode: 0o755 })

const log = (...x) => console.log('[scrollen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.evaluate(async (cli) => {
  const s = (await window.api.init()).settings
  await window.api.setSettings({ agents: { ...s.agents, claude: { ...s.agents.claude, path: cli } } })
}, fake)
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

const stand = () => page.locator('.transcript').evaluate((e) => ({
  top: Math.round(e.scrollTop),
  rest: Math.round(e.scrollHeight - e.scrollTop - e.clientHeight)
}))

const ta = page.locator('.cell .composer textarea').first()
await ta.fill('Erklär mir alles.')
await ta.press('Enter')
await page.waitForTimeout(1500)
const amEnde = await stand()
log('während der Antwort:', JSON.stringify(amEnde))
check(amEnde.rest < 60, 'solange niemand scrollt, bleibt der Chat am Ende')

// Jetzt scrollt der Mensch nach oben, während weiter Text kommt.
const box = await page.locator('.transcript').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, -250)
  await page.waitForTimeout(100)
}
const gleichDanach = await stand()
log('gleich nach dem Scrollen:', JSON.stringify(gleichDanach))
check(gleichDanach.rest > 300, 'das Hochscrollen kommt an – der Chat springt nicht zurück')

// Und es bleibt so, auch wenn die Antwort weiterläuft.
await page.waitForTimeout(1200)
const spaeter = await stand()
log('eine Sekunde später:', JSON.stringify(spaeter))
check(spaeter.top <= gleichDanach.top + 5, 'der Chat scrollt nicht von selbst wieder nach unten')
check(spaeter.rest > 300, 'die Stelle bleibt stehen, während die Antwort weiterwächst')
check((await page.locator('.to-bottom').count()) === 1, 'der Knopf „Zum Ende“ steht bereit')
await page.screenshot({ path: join(out, '1-oben.png') })

// Zurück ans Ende: dann klebt der Chat wieder von selbst.
await page.locator('.to-bottom').click()
await page.waitForTimeout(1200)
const zurueck = await stand()
log('nach „Zum Ende“:', JSON.stringify(zurueck))
check(zurueck.rest < 60, 'nach dem Klick klebt der Chat wieder am Ende')

// Nach dem Ende der Antwort steht der Verlauf vollständig da.
await page.locator('.cell .working').waitFor({ state: 'detached', timeout: 20_000 })
await page.waitForTimeout(400)
check(/Absatz 60/.test(await page.locator('.transcript-inner').innerText()), 'die ganze Antwort ist angekommen')
await page.screenshot({ path: join(out, '2-fertig.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
