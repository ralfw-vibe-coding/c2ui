import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Knopf mit Rückfrage ohne Dialog: Der erste Klick macht aus dem Symbol ein „?“, der zweite führt
 * die Aktion aus. Nach `timeoutMs` oder einem Klick woanders wird wieder das Symbol angezeigt.
 */
export function ConfirmButton({
  icon,
  title,
  confirmTitle,
  onConfirm,
  className = '',
  size = 14,
  timeoutMs = 5000
}: {
  icon: string
  title: string
  confirmTitle: string
  onConfirm: () => void
  className?: string
  size?: number
  timeoutMs?: number
}) {
  const [armed, setArmed] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), timeoutMs)
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setArmed(false)
    }
    // capture: auch Klicks, die andere Elemente abfangen, setzen zurück
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [armed, timeoutMs])

  return (
    <button
      ref={ref}
      className={`icon-btn confirm-btn${armed ? ' armed' : ''} ${className}`}
      title={armed ? confirmTitle : title}
      aria-label={armed ? confirmTitle : title}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? <span className="confirm-q">?</span> : <Icon name={icon} size={size} />}
    </button>
  )
}
