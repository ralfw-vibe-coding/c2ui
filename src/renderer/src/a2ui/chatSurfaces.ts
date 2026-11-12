import { basicCatalog, injectBasicCatalogStyles, MessageProcessor } from '@a2ui/web_core/v1_0'
import { A2UI_ACTION_PREFIX, callMessages, isA2uiCall, surfaceIdOf } from '@shared/a2ui'
import { buildClaude2uiCatalog } from '@shared/a2ui-catalog'
import { COMPONENT_IMPLS } from './components'

// Ein Katalog für alle Chats: Claude2UI (mit React-Komponenten) und der Basic Catalog (ältere Screens).
let catalogs: unknown[] | null = null
const getCatalogs = (): unknown[] => (catalogs ??= [buildClaude2uiCatalog(COMPONENT_IMPLS as never), basicCatalog])
import type { Transcript } from '@shared/types'

/** Was ein render_ui-Aufruf bewirkt hat. */
export interface CallEffect {
  created: string[]
  updated: string[]
  deleted: string[]
  /** Fehler beim Anwenden in der App (sollte nach der Prüfung im MCP-Server nicht vorkommen). */
  error?: string
}

type ActionHandler = (chatId: string, text: string) => void
let actionHandler: ActionHandler = () => {}
export function setA2uiActionHandler(h: ActionHandler): void {
  actionHandler = h
}

let stylesInjected = false

/**
 * A2UI-Zustand eines Chats: ein MessageProcessor, dem alle angenommenen render_ui-Aufrufe des
 * Transkripts der Reihe nach zugeführt werden. Jeder Aufruf wird genau einmal angewendet.
 */
export class ChatSurfaces {
  readonly processor: MessageProcessor
  private effects = new Map<string, CallEffect>()

  constructor(private readonly chatId: string) {
    if (!stylesInjected) {
      injectBasicCatalogStyles()
      stylesInjected = true
    }
    this.processor = new MessageProcessor(getCatalogs() as never, (action: unknown) =>
      actionHandler(this.chatId, A2UI_ACTION_PREFIX + JSON.stringify(action))
    )
  }

  effect(blockId: string): CallEffect | undefined {
    return this.effects.get(blockId)
  }

  surface(id: string): unknown {
    return this.processor.model.surfacesMap.get(id)
  }

  /** Aktive (angelegte, nicht entfernte) Screens in der Reihenfolge ihrer Entstehung. */
  activeSurfaces(): string[] {
    const ids: string[] = []
    for (const eff of this.effects.values()) {
      for (const sid of eff.created) if (!ids.includes(sid)) ids.push(sid)
      for (const sid of eff.deleted) {
        const i = ids.indexOf(sid)
        if (i >= 0) ids.splice(i, 1)
      }
    }
    return ids.filter((id) => this.processor.model.surfacesMap.has(id))
  }

  /** Wendet neue, erfolgreiche Aufrufe an. Liefert die IDs der dabei neu angewendeten Blöcke. */
  sync(t: Transcript): string[] {
    const fresh: string[] = []
    for (const item of t) {
      if (item.type !== 'assistant') continue
      for (const b of item.blocks) {
        if (b.type !== 'tool_use' || !isA2uiCall(b) || !b.result || b.result.isError || this.effects.has(b.id)) continue
        const eff: CallEffect = { created: [], updated: [], deleted: [] }
        for (const m of callMessages(b.input)) {
          const sid = surfaceIdOf(m)
          try {
            this.processor.processMessages([m] as never)
          } catch (e) {
            eff.error = (e as Error).message
            continue
          }
          if (!sid) continue
          if (m.createSurface) eff.created.push(sid)
          else if (m.deleteSurface) eff.deleted.push(sid)
          else if (!eff.created.includes(sid) && !eff.updated.includes(sid)) eff.updated.push(sid)
        }
        this.effects.set(b.id, eff)
        fresh.push(b.id)
      }
    }
    return fresh
  }

  dispose(): void {
    this.processor.dispose()
  }
}

const registry = new Map<string, ChatSurfaces>()

export function chatSurfaces(chatId: string): ChatSurfaces {
  let cs = registry.get(chatId)
  if (!cs) {
    cs = new ChatSurfaces(chatId)
    registry.set(chatId, cs)
  }
  return cs
}

export function disposeChatSurfaces(chatId: string): void {
  registry.get(chatId)?.dispose()
  registry.delete(chatId)
}
