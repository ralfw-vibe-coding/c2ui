// Prüfung ohne Modellaufruf: Die Einstellungen stehen auf vier Reitern, jeder zeigt seinen Teil,
// der zuletzt gewählte bleibt beim nächsten Öffnen, und Änderungen speichern sich weiterhin selbst.
// Aufruf: npm run build && node scripts/settings-tabs-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/settings-tabs'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'c', title: 'Ein Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'c', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))
writeFileSync(join(userData, 'transcripts', 'c.json'), JSON.stringify([]))

const log = (...x) => console.log('[einstellungen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.sidebar-bottom button[title="Einstellungen"]').click()
await page.locator('.settings-dialog').waitFor()

const reiter = page.locator('.modal-tab')
const namen = await reiter.allInnerTexts()
log('Reiter:', JSON.stringify(namen))
check(namen.join('|') === 'Allgemein|KI|A2UI|Aktualisieren', 'vier Reiter in dieser Reihenfolge')
const inhalt = () => page.locator('.settings-dialog').innerText().then((t) => t.replace(/\s+/g, ' '))

// Allgemein steht zuerst und zeigt nur seinen Teil
let t = await inhalt()
check(/Größte Breite des Chats/.test(t), 'Allgemein: Chatbreite')
check(/Anhang/.test(t) && /Arbeitsschritte/.test(t), 'Allgemein: Einfügen und Arbeitsschritte')
check(/Benachrichtigungen/.test(t) && /Zusammenführen/.test(t), 'Allgemein: Benachrichtigungen und Zusammenführen')
check(!/Pfad zur Binary/.test(t), 'und nichts aus den anderen Reitern')
await page.screenshot({ path: join(out, '1-allgemein.png') })

await reiter.nth(1).click()
t = await inhalt()
check(/Claude/.test(t) && /Codex/.test(t), 'KI: beide Agenten')
check(/Pfad zur Binary/.test(t) && /Standardmodus/.test(t), 'mit Pfad und Standardmodus')
check(/Leerlauf/.test(t), 'und dem Leerlauf der CLI-Prozesse')
check(!/Größte Breite des Chats/.test(t), 'ohne die allgemeinen Felder')
await page.screenshot({ path: join(out, '2-ki.png') })

await reiter.nth(2).click()
t = await inhalt()
check(/A2UI-Komponenten/.test(t), 'A2UI: eigene Komponenten')
await reiter.nth(3).click()
t = await inhalt()
// Aus dem Repo gestartet gibt es keine Build-Nummer; dann steht dort der Hinweis statt der Ordner.
check(/Aktualisierung/.test(t), 'Aktualisieren: der Abschnitt ist da')
check(/Ordner wählen/.test(t) || /aktualisiert sich nicht selbst/.test(t), 'mit Update-Ordner – oder dem Hinweis, dass die Repo-App das nicht kann')
await page.screenshot({ path: join(out, '3-aktualisieren.png') })

// Eine Änderung auf einem Reiter wird weiterhin von selbst gespeichert
await reiter.nth(0).click()
const breite = page.locator('.settings-dialog input[type="number"]').first()
await breite.fill('640')
await page.waitForTimeout(900)
const gespeichert = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
log('gespeicherte Breite:', gespeichert.chatWidth)
check(gespeichert.chatWidth === 640, 'die Änderung speichert sich wie gehabt')

// Der zuletzt gewählte Reiter steht beim nächsten Öffnen wieder da
await reiter.nth(1).click()
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check((await page.locator('.settings-dialog').count()) === 0, 'Escape schließt den Dialog')
await page.locator('.sidebar-bottom button[title="Einstellungen"]').click()
await page.locator('.settings-dialog').waitFor()
check(await page.locator('.modal-tab.active').innerText().then((x) => x === 'KI'), 'beim nächsten Öffnen steht der zuletzt gewählte Reiter da')

// Der Dialog bleibt handlich: keine Seite länger als das Fenster
const masse = await page.evaluate(() => {
  const m = document.querySelector('.settings-dialog')
  return { h: Math.round(m.getBoundingClientRect().height), scroll: Math.round(m.scrollHeight), fenster: window.innerHeight }
})
log('Dialog:', JSON.stringify(masse))
check(masse.scroll <= masse.fenster, 'die Seite passt ohne Scrollen ins Fenster')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
