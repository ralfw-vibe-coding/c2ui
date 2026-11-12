import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { A2uiSurface, MarkdownComponentContext } from '@a2ui/react/v0_9'
import { A2UI_ACTION_PREFIX } from '@shared/a2ui'
import type { Block } from '@shared/types'
import { useStore } from '../store'
import { Icon } from '../components/Icon'
import { chatSurfaces } from './chatSurfaces'
import { A2uiChatContext } from './components'

const A2uiMarkdown = ({ markdown }: { markdown: string }) => (
  <div className="md a2ui-md">
    <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
  </div>
)

/** Darstellung eines render_ui-Aufrufs im Chat. */
export function A2uiBlock({ chatId, block }: { chatId: string; block: Block & { type: 'tool_use' } }) {
  const busy = useStore((s) => !!s.busy[chatId])
  const gen = useStore((s) => s.componentsVersion)
  if (!block.result) {
    return (
      <div className="a2ui-pending">
        <span className="spinner" /> Screen wird erstellt …
      </div>
    )
  }
  if (block.result.isError) {
    return (
      <details className="tool tool-error a2ui-rejected">
        <summary>
          <Icon name="alert" size={14} />
          <span className="tool-name">Screen abgelehnt</span>
          <span className="tool-summary">Validierung – das Modell korrigiert in der Regel selbst</span>
        </summary>
        <pre className="tool-result">{block.result.content}</pre>
      </details>
    )
  }
  const eff = chatSurfaces(chatId).effect(block.id)
  if (!eff) return null
  return (
    <>
      {eff.created.map((sid) => (
        <SurfaceView key={`${sid}:${gen}`} chatId={chatId} surfaceId={sid} locked={busy} />
      ))}
      {eff.updated.map((sid) => (
        <button key={sid} className="a2ui-update" onClick={() => scrollToSurface(chatId, sid)}>
          <Icon name="refresh" size={13} /> Screen „{sid}“ aktualisiert
        </button>
      ))}
      {eff.deleted.map((sid) => (
        <div key={sid} className="a2ui-update muted">
          Screen „{sid}“ entfernt
        </div>
      ))}
      {eff.error && <div className="msg-error">A2UI: {eff.error}</div>}
    </>
  )
}

function SurfaceView({ chatId, surfaceId, locked }: { chatId: string; surfaceId: string; locked: boolean }) {
  const surface = chatSurfaces(chatId).surface(surfaceId)
  const cwd = useStore((s) => s.chats.find((c) => c.id === chatId)?.cwd ?? '')
  const home = useStore((s) => s.home)
  if (!surface) return <div className="a2ui-update muted">Screen „{surfaceId}“ wurde entfernt</div>
  return (
    <div
      className={`a2ui-frame${locked ? ' a2ui-locked' : ''}`}
      data-surface-id={surfaceId}
      title={locked ? 'Gesperrt, solange der Chat arbeitet' : undefined}
    >
      <A2uiChatContext.Provider value={{ cwd, home }}>
        <MarkdownComponentContext.Provider value={A2uiMarkdown}>
          <A2uiSurface surface={surface as never} />
        </MarkdownComponentContext.Provider>
      </A2uiChatContext.Provider>
    </div>
  )
}

/** Scrollt im Chat-Panel zum Screen und hebt ihn kurz hervor. */
export function scrollToSurface(chatId: string, surfaceId: string): void {
  const panel = document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"]`)
  const el = panel?.querySelector<HTMLElement>(`[data-surface-id="${CSS.escape(surfaceId)}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  el.classList.remove('a2ui-flash')
  void el.offsetWidth
  el.classList.add('a2ui-flash')
}

/** Nutzernachricht, die eine Button-Aktion an den Agenten trägt, kompakt anzeigen. */
export function ActionMessage({ text }: { text: string }) {
  let name = 'Aktion'
  let surface = ''
  try {
    const a = JSON.parse(text.slice(A2UI_ACTION_PREFIX.length))
    name = a.name ?? name
    surface = a.surfaceId ?? ''
  } catch {
    /* Rohtext anzeigen */
  }
  return (
    <div className="msg msg-user">
      <details className="a2ui-action">
        <summary>
          <Icon name="send" size={13} /> Aktion „{name}“{surface && <span className="muted"> · Screen „{surface}“</span>}
        </summary>
        <pre>{text.slice(A2UI_ACTION_PREFIX.length)}</pre>
      </details>
    </div>
  )
}
