import { useEffect, useState } from 'react'
import type { AgentKind, ModelList } from '@shared/types'

// Modelllisten werden einmal pro Agent vom Main-Prozess geholt und dann geteilt.
const cache = new Map<AgentKind, Promise<ModelList>>()

function load(agent: AgentKind): Promise<ModelList> {
  let p = cache.get(agent)
  if (!p) {
    p = window.api.listModels(agent)
    p.then((l) => l.error && cache.delete(agent))
    cache.set(agent, p)
  }
  return p
}

export function useModelList(agent: AgentKind): ModelList | null {
  const [list, setList] = useState<ModelList | null>(null)
  useEffect(() => {
    let alive = true
    void load(agent).then((l) => alive && setList(l))
    return () => {
      alive = false
    }
  }, [agent])
  return list
}

/** Kurzer Anzeigename für ein Modell ('' = Standard der CLI). */
export function modelDisplay(model: string, list: ModelList | null): string {
  if (!model) return list?.cliDefault ? `Standard (${list.cliDefault})` : 'Standard'
  return list?.options.find((o) => o.value === model)?.label ?? model
}
