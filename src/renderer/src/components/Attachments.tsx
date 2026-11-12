import type { Attachment } from '@shared/types'
import { resolveImageUrl } from '../a2ui/components'
import { useStore } from '../store'
import { Icon } from './Icon'

/** Anhänge über dem Eingabefeld (noch nicht gesendet), mit Entfernen-Knopf. */
export function AttachmentChips({ chatId, attachments }: { chatId: string; attachments: Attachment[] }) {
  return (
    <div className="attach-row">
      {attachments.map((a) => (
        <div key={a.path} className="attach-chip" title={a.path}>
          {a.image ? <img src={resolveImageUrl(a.path, '', '')} alt="" /> : <Icon name="file" size={16} />}
          <span className="attach-name">{a.name}</span>
          <button className="icon-btn" title="Anhang entfernen" onClick={() => useStore.getState().removeAttachment(chatId, a.path)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Anhänge einer gesendeten Nachricht: Bilder als Vorschau, Dateien als Kärtchen. Klick öffnet. */
export function SentAttachments({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="sent-attachments">
      {attachments.map((a) =>
        a.image ? (
          <button key={a.path} className="sent-image" title={`${a.name}\nKlick: öffnen`} onClick={() => window.api.reveal(a.path)}>
            <img src={resolveImageUrl(a.path, '', '')} alt={a.name} />
          </button>
        ) : (
          <button key={a.path} className="attach-chip sent" title={`${a.path}\nKlick: öffnen`} onClick={() => window.api.reveal(a.path)}>
            <Icon name="file" size={16} />
            <span className="attach-name">{a.name}</span>
          </button>
        )
      )}
    </div>
  )
}
