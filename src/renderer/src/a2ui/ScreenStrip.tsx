import { useEffect, useState } from 'react'
import { A2uiSurface, MarkdownComponentContext } from '@a2ui/react/v0_9'
import { useStore } from '../store'
import { Icon } from '../components/Icon'
import { scrollToSurface } from './A2uiBlock'
import { chatSurfaces } from './chatSurfaces'
import { A2uiChatContext } from './components'

/** Breite, in der eine Miniatur gerendert und dann verkleinert wird. */
const RENDER_WIDTH = 560
const THUMB_WIDTH = 112
const SCALE = THUMB_WIDTH / RENDER_WIDTH

const collapsedChats = new Set<string>()
const PlainMarkdown = ({ markdown }: { markdown: string }) => <span>{markdown.replace(/[#*_`>]/g, '')}</span>

/**
 * Übersicht der aktiven A2UI-Screens eines Chats als Leiste mit Live-Miniaturen.
 * Klick springt zum Screen; Screens im sichtbaren Bereich sind markiert.
 */
export function ScreenStrip({ chatId, surfaceIds }: { chatId: string; surfaceIds: string[] }) {
  const [collapsed, setCollapsed] = useState(() => collapsedChats.has(chatId))
  const visible = useVisibleSurfaces(chatId, surfaceIds)
  if (surfaceIds.length === 0) return null

  const toggle = (): void => {
    if (collapsed) collapsedChats.delete(chatId)
    else collapsedChats.add(chatId)
    setCollapsed(!collapsed)
  }

  return (
    <div className={`screen-strip${collapsed ? ' collapsed' : ''}`}>
      <button className="screen-strip-toggle" onClick={toggle} title={collapsed ? 'Screens zeigen' : 'Screens ausblenden'}>
        <Icon name="grid" size={13} />
        <span>
          {surfaceIds.length} {surfaceIds.length === 1 ? 'Screen' : 'Screens'}
        </span>
        <span className="screen-strip-chevron">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="screen-strip-items">
          {surfaceIds.map((sid) => (
            <Thumbnail key={sid} chatId={chatId} surfaceId={sid} active={visible.has(sid)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Thumbnail({ chatId, surfaceId, active }: { chatId: string; surfaceId: string; active: boolean }) {
  const surface = chatSurfaces(chatId).surface(surfaceId)
  const cwd = useStore((s) => s.chats.find((c) => c.id === chatId)?.cwd ?? '')
  const home = useStore((s) => s.home)
  if (!surface) return null
  return (
    <button
      className={`screen-thumb${active ? ' active' : ''}`}
      onClick={() => scrollToSurface(chatId, surfaceId)}
      title={`Zu „${surfaceId}“ springen`}
    >
      <div className="screen-thumb-view" aria-hidden inert>
        <div className="screen-thumb-scale" style={{ width: RENDER_WIDTH, transform: `scale(${SCALE})` }}>
          <A2uiChatContext.Provider value={{ cwd, home }}>
            <MarkdownComponentContext.Provider value={PlainMarkdown}>
              <A2uiSurface surface={surface as never} />
            </MarkdownComponentContext.Provider>
          </A2uiChatContext.Provider>
        </div>
      </div>
      <span className="screen-thumb-label">{prettyId(surfaceId)}</span>
    </button>
  )
}

function prettyId(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Welche Screens liegen gerade (teilweise) im sichtbaren Bereich des Chats? */
function useVisibleSurfaces(chatId: string, surfaceIds: string[]): Set<string> {
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const key = surfaceIds.join('|')
  useEffect(() => {
    const panel = document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"]`)
    const root = panel?.querySelector('.transcript')
    if (!root) return
    const current = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const sid = (e.target as HTMLElement).dataset.surfaceId
          if (!sid) continue
          if (e.isIntersecting) current.add(sid)
          else current.delete(sid)
        }
        setVisible(new Set(current))
      },
      { root, threshold: 0.15 }
    )
    // Frames können erst nach dem Rendern existieren.
    const raf = requestAnimationFrame(() => {
      root.querySelectorAll<HTMLElement>('.a2ui-frame[data-surface-id]').forEach((el) => io.observe(el))
    })
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [chatId, key])
  return visible
}
