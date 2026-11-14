// Prüfung ohne Modellaufruf: Chats oben in der Seitenleiste festhalten.
// Aufruf: npm run build && node scripts/pin-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/pin'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const min = (m) => Date.UTC(2026, 0, 1) + m * 60_000
const chat = (id, title, updated, parent) => ({
  id, title, agent: 'claude', cwd: root, permissionMode: 'default', sessionId: id, sessionStarted: true,
  createdAt: min(1), updatedAt: updated, ...(parent ? { forkFrom: { chatId: parent, title: parent } } : {})
})
const chats = [
  chat('neu', 'Neueste Arbeit', min(90)),
  chat('mitte', 'Mittlere Arbeit', min(60)),
  chat('alt', 'Alte Notizen', min(10)),
  chat('zweig', 'Nebenchat von Mitte', min(20), 'mitte')
]
for (const c of chats) writeFileSync(join(userData, 'transcripts', `${c.id}.json`), JSON.stringify([{ type: 'user', id: `${c.id}-1`, ts: 1, text: c.title }]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))

const log = (...x) => console.log('[anheften]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')

const reihenfolge = () => page.locator('.chat-item .chat-title').allInnerTexts()
const zeile = (titel) => page.locator('.chat-item', { hasText: titel }).first()
const anheften = async (titel) => {
  const z = zeile(titel)
  await z.hover()
  await z.locator('.pin-btn').click()
  await page.waitForTimeout(300)
}

log('vorher:', (await reihenfolge()).join(' | '))
check((await reihenfolge())[0] === 'Neueste Arbeit', 'ohne Anheften steht die jüngste Arbeit oben')

// Alten Chat anheften: er steht oben, mit sichtbarer Nadel
await anheften('Alte Notizen')
log('nach dem Anheften:', (await reihenfolge()).join(' | '))
check((await reihenfolge())[0] === 'Alte Notizen', 'der angeheftete Chat steht oben')
check((await zeile('Alte Notizen').locator('.pin-btn.on').count()) === 1, 'die Nadel ist auch ohne Mauszeiger zu sehen')
check((await page.locator('.chat-item .pin-btn.on').count()) === 1, 'nur dieser Chat ist angeheftet')
await page.screenshot({ path: join(out, '1-angeheftet.png') })

// Zuletzt angeheftet steht zuoberst
await anheften('Neueste Arbeit')
check((await reihenfolge()).slice(0, 2).join(' | ') === 'Neueste Arbeit | Alte Notizen', 'zuletzt angeheftet steht zuoberst')

// Ein angehefteter Nebenchat zieht seinen Baum nach oben, bleibt aber an seinem Platz darin
await anheften('Nebenchat von Mitte')
const mitZweig = await reihenfolge()
log('mit angeheftetem Nebenchat:', mitZweig.join(' | '))
check(mitZweig[0] === 'Mittlere Arbeit' && mitZweig[1] === 'Nebenchat von Mitte', 'der Baum des Nebenchats steht oben, er selbst an seinem Platz')

// Und er bleibt sichtbar, auch wenn sein Ursprung zugeklappt wird
await zeile('Mittlere Arbeit').locator('.tree-toggle').click()
await page.waitForTimeout(300)
const zugeklappt = await reihenfolge()
log('Ursprung zugeklappt:', zugeklappt.join(' | '))
check(zugeklappt[1] === 'Nebenchat von Mitte', 'der angeheftete Nebenchat bleibt sichtbar')
await zeile('Mittlere Arbeit').locator('.tree-toggle').click()
await page.waitForTimeout(300)

// Losmachen: wieder nach letzter Aktivität
for (const t of ['Nebenchat von Mitte', 'Neueste Arbeit', 'Alte Notizen']) await anheften(t)
log('wieder los:', (await reihenfolge()).join(' | '))
check((await page.locator('.chat-item .pin-btn.on').count()) === 0, 'nichts mehr angeheftet')
check((await reihenfolge())[0] === 'Neueste Arbeit', 'wieder nach letzter Aktivität')

// Übersteht den Neustart
await anheften('Alte Notizen')
await page.waitForTimeout(400)
await page.reload()
await page.waitForSelector('.chat-item')
await page.waitForTimeout(400)
check((await reihenfolge())[0] === 'Alte Notizen', 'das Anheften übersteht den Neustart')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
