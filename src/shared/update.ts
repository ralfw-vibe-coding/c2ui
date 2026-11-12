// Selbst-Aktualisierung aus einem Ordner: Zustände, die Main-Prozess und Oberfläche teilen.

export type UpdateOffer = { version: string; build: number; commit?: string; file: string }

export type UpdateState =
  | { state: 'unavailable' } // App aus dem Repo (ohne Build-Nummer)
  | { state: 'off' } // kein Ordner gewählt
  | { state: 'current'; folder: string; checked: string } // nichts Neueres
  | { state: 'available'; folder: string; checked: string; offer: UpdateOffer }
  | { state: 'installing'; folder: string; offer: UpdateOffer }
  | { state: 'failed'; folder: string; message: string } // welcher Schritt, warum

const str = (v: unknown): v is string => typeof v === 'string'

function parseOffer(o: unknown): UpdateOffer | null {
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  if (!str(x.version) || typeof x.build !== 'number' || !Number.isFinite(x.build) || !str(x.file)) return null
  if (x.commit !== undefined && !str(x.commit)) return null
  return { version: x.version, build: x.build, file: x.file, ...(x.commit ? { commit: x.commit } : {}) }
}

/** Prüft eine Antwort des Main-Prozesses; alles, was nicht passt, gilt als 'unavailable'. */
export function parseUpdateState(v: unknown): UpdateState {
  const no: UpdateState = { state: 'unavailable' }
  if (!v || typeof v !== 'object') return no
  const x = v as Record<string, unknown>
  switch (x.state) {
    case 'unavailable':
    case 'off':
      return { state: x.state }
    case 'current':
      return str(x.folder) && str(x.checked) ? { state: 'current', folder: x.folder, checked: x.checked } : no
    case 'available': {
      const offer = parseOffer(x.offer)
      return str(x.folder) && str(x.checked) && offer ? { state: 'available', folder: x.folder, checked: x.checked, offer } : no
    }
    case 'installing': {
      const offer = parseOffer(x.offer)
      return str(x.folder) && offer ? { state: 'installing', folder: x.folder, offer } : no
    }
    case 'failed':
      return str(x.folder) && str(x.message) ? { state: 'failed', folder: x.folder, message: x.message } : no
    default:
      return no
  }
}
