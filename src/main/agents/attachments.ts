import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { Attachment } from '@shared/types'

/** Größte Bilddatei, die als Bild direkt an das Modell geht (sonst nur als Pfad). */
const MAX_INLINE_IMAGE = 5 * 1024 * 1024
const MEDIA: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Text der Nachricht plus Liste der angehängten Dateien (damit das Modell sie lesen kann). */
export function textWithAttachments(text: string, attachments: Attachment[] = []): string {
  if (!attachments.length) return text
  const list = attachments.map((a) => `- ${a.path}${a.image ? ' (Bild)' : ''}`).join('\n')
  return `${text}\n\nAngehängte Dateien (vom Nutzer, unter diesen Pfaden lesbar):\n${list}`
}

/** Bilder, die direkt als Bild übergeben werden können. */
export function inlineImages(attachments: Attachment[] = []): { path: string; mediaType: string }[] {
  return attachments
    .filter((a) => a.image && MEDIA[extname(a.path).toLowerCase()])
    .filter((a) => {
      try {
        return statSync(a.path).size <= MAX_INLINE_IMAGE
      } catch {
        return false
      }
    })
    .map((a) => ({ path: a.path, mediaType: MEDIA[extname(a.path).toLowerCase()] }))
}

/** Claude-Bildblöcke (base64). */
export function claudeImageBlocks(attachments: Attachment[] = []): unknown[] {
  return inlineImages(attachments).map((i) => ({
    type: 'image',
    source: { type: 'base64', media_type: i.mediaType, data: readFileSync(i.path).toString('base64') }
  }))
}
