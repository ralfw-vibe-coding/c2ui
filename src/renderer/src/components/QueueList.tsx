import { queuedMeta, type ChatQueue } from '@shared/queue'
import { useStore } from '../store'
import { Icon } from './Icon'

/** Eingereihte Nachrichten über dem Eingabefeld: bearbeiten, entfernen, nach Abbruch fortsetzen. */
export function QueueList({
  chatId,
  queue,
  busy,
  onEdit
}: {
  chatId: string
  queue: ChatQueue
  busy: boolean
  onEdit: (id: string) => void
}) {
  const st = useStore.getState()
  return (
    <div className={`queue${queue.paused ? ' paused' : ''}`}>
      <div className="queue-head">
        <Icon name="queue" size={13} />
        <span>
          {queue.paused
            ? `Warteschlange angehalten${queue.reason ? ` – ${queue.reason}` : ''}`
            : busy
              ? 'Wird nach der aktuellen Antwort gesendet'
              : 'Wird gesendet …'}
        </span>
        {queue.paused && queue.items.length > 0 && (
          <button className="queue-resume" onClick={() => st.resumeQueue(chatId)} title="Eingereihte Nachrichten weiter senden">
            <Icon name="play" size={11} /> Fortsetzen
          </button>
        )}
      </div>
      {queue.items.map((m, i) => {
        const meta = queuedMeta(m)
        return (
          <div key={m.id} className="queue-item" title={m.text}>
            <span className="queue-nr">{i + 1}</span>
            <span className="queue-text">{m.text || <em>(nur Bezüge/Anhänge)</em>}</span>
            {meta && <span className="queue-meta">{meta}</span>}
            <button className="icon-btn" title="Zurück ins Eingabefeld" onClick={() => onEdit(m.id)}>
              <Icon name="pencil" size={12} />
            </button>
            <button className="icon-btn" title="Aus der Warteschlange entfernen" onClick={() => st.removeQueued(chatId, m.id)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
