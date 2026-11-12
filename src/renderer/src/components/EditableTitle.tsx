import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/**
 * Chat-Titel, der sich inline umbenennen lässt (Doppelklick oder `editing` von außen).
 * Enter speichert, Escape bricht ab, Klick daneben speichert.
 */
export function EditableTitle({
  chatId,
  title,
  className,
  editing,
  onEditingChange
}: {
  chatId: string
  title: string
  className?: string
  editing: boolean
  onEditingChange: (editing: boolean) => void
}) {
  const [draft, setDraft] = useState(title)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(title)
      requestAnimationFrame(() => ref.current?.select())
    }
  }, [editing, title])

  function commit(): void {
    onEditingChange(false)
    const t = draft.trim()
    if (t && t !== title) void useStore.getState().renameChat(chatId, t)
  }

  if (!editing) {
    return (
      <span
        className={className}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onEditingChange(true)
        }}
      >
        {title}
      </span>
    )
  }

  return (
    <input
      ref={ref}
      className="rename"
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onEditingChange(false)
      }}
    />
  )
}
