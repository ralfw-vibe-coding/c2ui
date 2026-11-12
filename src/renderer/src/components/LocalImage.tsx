import { useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveImageUrl } from '../a2ui/components'
import { useChat, useStore } from '../store'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const isLocal = (p: string): boolean => !/^(https?:|data:|blob:|mailto:|#)/i.test(p)

/** Lokales Bild im Chat; Klick öffnet es in der Standard-App (z. B. Vorschau). */
export function LocalImage({ chatId, path, alt }: { chatId: string; path: string; alt?: string }) {
  const cwd = useChat(chatId)?.cwd ?? ''
  const home = useStore((s) => s.home)
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="c2-image-missing">Bild nicht gefunden: {path}</div>
  const abs = absolute(path, cwd, home)
  return (
    <button className="msg-image" title={`${abs}\nKlick: in Vorschau öffnen`} onClick={() => window.api.reveal(abs)}>
      <img src={resolveImageUrl(path, cwd, home)} alt={alt ?? path} onError={() => setFailed(true)} draggable={false} />
    </button>
  )
}

function absolute(p: string, cwd: string, home: string): string {
  if (p.startsWith('file://')) return decodeURIComponent(p.slice(7))
  if (p === '~' || p.startsWith('~/')) return home + p.slice(1)
  if (p.startsWith('/')) return p
  return cwd.replace(/\/+$/, '') + '/' + p.replace(/^\.\//, '')
}

/**
 * Markdown einer Antwort; Links und Bilder auf lokale Bilddateien werden zusätzlich als Bild
 * gezeigt (z. B. „[kreis.png](/pfad/kreis.png)“ nach einer Bildgenerierung).
 */
export function ChatMarkdown({ chatId, text }: { chatId: string; text: string }) {
  const components: Components = {
    img: ({ src, alt }) =>
      typeof src === 'string' && isLocal(src) ? <LocalImage chatId={chatId} path={src} alt={alt} /> : <img src={src as string} alt={alt} />,
    a: ({ href, children }) => {
      const link: ReactNode = <a href={href}>{children}</a>
      if (href && isLocal(href) && IMAGE_EXT.test(href.split(/[?#]/)[0])) {
        return (
          <>
            {link}
            <LocalImage chatId={chatId} path={decodeURI(href)} />
          </>
        )
      }
      return link
    }
  }
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </Markdown>
  )
}
