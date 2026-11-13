import { create } from 'zustand'
import { disposeChatSurfaces, resetAllChatSurfaces, setA2uiActionHandler } from './a2ui/chatSurfaces'
import { setComposites, type CompositeDef } from '@shared/a2ui-composites'
import { setDraft } from './drafts'
import * as L from '@shared/layout'
import { composeMessage, forkTitle, type QuoteRef } from '@shared/quotes'
import { rootOf } from '@shared/board'
import { parseUpdateState, type UpdateState } from '@shared/update'
import * as Q from '@shared/queue'
import { applyEvent } from '@shared/transcript'
import type { AgentEvent, AgentKind, Attachment, Chat, LayoutState, Settings, Transcript } from '@shared/types'

export const CHAT_MIME = 'application/x-claude2ui-chat'

interface State {
  ready: boolean
  home: string
  settings: Settings | null
  chats: Chat[]
  layout: LayoutState
  transcripts: Record<string, Transcript | undefined>
  busy: Record<string, boolean>
  /** Chat, der gerade gezogen wird (für Drop-Overlays). */
  dragging: string | null
  settingsOpen: boolean
  sidebarCollapsed: boolean
  /** Eigene A2UI-Komponenten aus dem Komponenten-Ordner. */
  components: { defs: CompositeDef[]; errors: string[]; dir: string }
  /** Zählt Änderungen an eigenen Komponenten; Screens werden dann neu aufgebaut. */
  componentsVersion: number
  /** Noch nicht gesendete Anhänge je Chat. */
  pendingAttachments: Record<string, Attachment[] | undefined>
  /** Gesammelte Bezüge (Zitat + Anmerkung) je Chat, noch nicht gesendet. */
  pendingRefs: Record<string, QuoteRef[] | undefined>
  /** Selbst-Aktualisierung aus einem Ordner (Einstellungen → Aktualisierung). */
  update: UpdateState
  /** Eingereihte Nachrichten je Chat (während er arbeitet geschrieben). */
  queues: Record<string, Q.ChatQueue | undefined>
  /** Zwischenrufe, die an den Agenten gingen, aber noch nicht aufgenommen wurden. */
  steering: Record<string, Q.QueuedMessage[] | undefined>
  /** Ausstehender Sprung an eine Stelle im Verlauf (z. B. Abzweigpunkt eines Nebenchats). */
  jump: JumpTarget | null
  /** Zuletzt markierter Chat (bleibt, wenn eine Zelle ohne Chat – z. B. ein Board – markiert wird). */
  activeChatId: string | null
  /** Je Chat die Nutzernachricht, deren Turn gerade oben im sichtbaren Bereich steht (fürs Board). */
  viewTurn: Record<string, string | undefined>
}

/** Ziel eines Sprungs: Markierung eines Nebenchats im Ursprung, sonst ein Transkript-Eintrag. */
export interface JumpTarget {
  chatId: string
  forkChild?: string
  itemId?: string
  n: number
}

interface Actions {
  init(): Promise<void>
  setLayout(l: LayoutState, persist?: boolean): void
  selectCell(cellId: string): void
  openChat(chatId: string, cellId?: string): Promise<void>
  newChat(agent: AgentKind, cellId?: string): Promise<void>
  /** Werkstatt-Chat zum Bauen/Bearbeiten eigener Komponenten in einer neuen Zelle öffnen. */
  openWorkshop(component?: string): Promise<void>
  closeChat(cellId: string): Promise<void>
  removeCell(cellId: string): Promise<void>
  splitCell(cellId: string, direction: 'row' | 'column'): void
  drop(chatId: string, cellId: string, zone: L.DropZone): Promise<void>
  deleteChat(chatId: string): Promise<void>
  renameChat(chatId: string, title: string): Promise<void>
  send(chatId: string, text: string, attachments?: Attachment[]): Promise<void>
  /** Dateien (Einfügen, Drag&Drop) als Anhänge des Chats übernehmen. */
  addFiles(chatId: string, files: File[]): Promise<string[]>
  removeAttachment(chatId: string, path: string): void
  clearAttachments(chatId: string): void
  addRef(chatId: string, quote: string, note: string): void
  removeRef(chatId: string, id: string): void
  /** Bezüge leeren; liefert die bisherigen (zum Wiederherstellen bei Fehlern). */
  takeRefs(chatId: string): QuoteRef[]
  restoreRefs(chatId: string, refs: QuoteRef[]): void
  /** Neuer Chat mit dem Kontext dieses Chats, rechts daneben geöffnet; fragt dort sofort nach. */
  askInNewChat(sourceChatId: string, quote: string, note: string, itemId?: string): Promise<void>
  /** Nachricht einreihen; wird gesendet, sobald der Chat frei ist. */
  enqueue(chatId: string, msg: Omit<Q.QueuedMessage, 'id'>): void
  removeQueued(chatId: string, id: string): void
  /** Eingereihte Nachricht zum Bearbeiten herausnehmen. */
  takeQueued(chatId: string, id: string): Q.QueuedMessage | undefined
  resumeQueue(chatId: string): void
  /** Eingereihte Nachricht als Zwischenruf in die laufende Antwort geben (Steer). */
  steerQueued(chatId: string, id: string): Promise<void>
  /** Chat neben einem anderen öffnen (oder markieren, falls schon offen). */
  openBeside(chatId: string, anchorChatId: string, side: 'before' | 'after'): Promise<void>
  /** Diskursboard des Baums öffnen, zu dem der Chat gehört (links neben der markierten Zelle). */
  openBoard(chatId: string): void
  /** Board aus der Zelle entfernen (Zelle bleibt). */
  closeBoard(cellId: string): void
  /** Vom Board aus einen Chat an einer Nachricht öffnen – in der Zelle neben dem Board. */
  openFromBoard(boardCellId: string, chatId: string, itemId: string): Promise<void>
  /** Transkripte laden (z. B. alle Chats eines Boards). */
  ensureTranscripts(chatIds: string[]): void
  /** Im Verlauf eines Chats an eine Stelle springen (nachdem er geöffnet ist). */
  jumpTo(target: Omit<JumpTarget, 'n'>): void
  clearJump(n: number): void
  setDragging(chatId: string | null): void
  setSettingsOpen(open: boolean): void
  toggleSidebar(): void
  saveSettings(patch: Partial<Settings>): Promise<void>
}

const loading = new Set<string>()
/** Board-Zelle → Zelle, in die es zuletzt einen Chat geöffnet hat. */
const boardTargets = new Map<string, string>()

// Reine Ansichtseinstellungen (pro Rechner) liegen im localStorage.
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function writeFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* egal */
  }
}

export const useStore = create<State & Actions>((set, get) => {
  const chat = (id: string | null | undefined): Chat | undefined => get().chats.find((c) => c.id === id)

  /** Fragt nach, falls der Chat gerade arbeitet. Liefert false, wenn abgebrochen wurde. */
  async function releaseChat(chatId: string | null, action: string): Promise<boolean> {
    if (!chatId || !get().busy[chatId]) return true
    const choice = await window.api.confirmBusy(chat(chatId)?.title ?? 'Chat', action)
    if (choice === 'cancel') return false
    if (choice === 'stop') await window.api.interrupt(chatId)
    return true
  }

  async function loadTranscript(chatId: string): Promise<void> {
    if (get().transcripts[chatId] || loading.has(chatId)) return
    loading.add(chatId)
    try {
      const t = await window.api.transcript(chatId)
      set((s) => ({ transcripts: { ...s.transcripts, [chatId]: t } }))
    } finally {
      loading.delete(chatId)
    }
  }

  const queueOf = (chatId: string): Q.ChatQueue => get().queues[chatId] ?? Q.EMPTY_QUEUE
  const setQueue = (chatId: string, q: Q.ChatQueue): void => set((s) => ({ queues: { ...s.queues, [chatId]: q } }))

  /** Sendet die nächste eingereihte Nachricht, falls der Chat frei ist. */
  async function drainQueue(chatId: string): Promise<void> {
    const { queue, next } = Q.takeNext(queueOf(chatId), !!get().busy[chatId])
    if (!next) return
    setQueue(chatId, queue)
    // Sofort als beschäftigt markieren, damit eine Eingabe in der Lücke eingereiht statt parallel gesendet wird.
    set((s) => ({ busy: { ...s.busy, [chatId]: true } }))
    try {
      await get().send(chatId, composeMessage(next.refs, next.text), next.attachments)
    } catch (e) {
      set((s) => ({ busy: { ...s.busy, [chatId]: false } }))
      setQueue(chatId, Q.sendFailed(queueOf(chatId), next, ipcError(e)))
    }
  }

  function onAgentEvent(chatId: string, e: AgentEvent): void {
    if (e.kind === 'turn-end') setQueue(chatId, Q.afterTurn(queueOf(chatId), e.isError, e.errorText))
    if (e.kind === 'user' && e.steer) set((s) => ({ steering: { ...s.steering, [chatId]: (s.steering[chatId] ?? []).slice(1) } }))
    // Ereignisse für nicht geladene Transkripte ignorieren: der Main-Prozess hat den
    // vollständigen Stand und liefert ihn beim Laden (IPC ist geordnet).
    const t = get().transcripts[chatId]
    if (!t) return
    set((s) => ({ transcripts: { ...s.transcripts, [chatId]: applyEvent(t, e) } }))
  }

  return {
    ready: false,
    home: '',
    settings: null,
    chats: [],
    layout: L.emptyLayout(),
    transcripts: {},
    busy: {},
    dragging: null,
    settingsOpen: false,
    sidebarCollapsed: readFlag('sidebarCollapsed'),
    components: { defs: [], errors: [], dir: '' },
    componentsVersion: 0,
    pendingAttachments: {},
    pendingRefs: {},
    update: { state: 'unavailable' },
    queues: {},
    steering: {},
    jump: null,
    activeChatId: null,
    viewTurn: {},

    async init() {
      // Eigene Komponenten zuerst – sie werden beim Anzeigen der Screens aufgelöst.
      const components = await window.api.listComponents()
      setComposites(components.defs)
      set({ components })
      window.api.onComponentsChanged((r) => {
        setComposites(r.defs)
        // Bestehende Screens mit den neuen Definitionen neu aufbauen (Live-Vorschau).
        resetAllChatSurfaces()
        set((st) => ({ components: { ...st.components, ...r }, componentsVersion: st.componentsVersion + 1 }))
      })
      const s = await window.api.init()
      const layout = L.sanitize(s.layout, new Set(s.chats.map((c) => c.id)))
      set({
        ready: true,
        home: s.home,
        settings: s.settings,
        chats: s.chats,
        layout,
        activeChatId: L.findLeaf(layout.root, layout.selectedCellId)?.chatId ?? null,
        busy: Object.fromEntries(s.busy.map((id) => [id, true]))
      })
      window.api.onAgentEvent(onAgentEvent)
      window.api.onBusy((id, b) => {
        set((st) => ({ busy: { ...st.busy, [id]: b } }))
        if (!b) {
          // Was bis zum Ende nicht aufgenommen wurde, meldet der Hauptprozess als Hinweis.
          set((st) => ({ steering: { ...st.steering, [id]: [] } }))
          void drainQueue(id)
        }
      })
      window.api.onChatsChanged((chats) => set({ chats }))
      window.api.onUpdate((u) => set({ update: parseUpdateState(u) }))
      void window.api.updateState().then((u) => set({ update: parseUpdateState(u) }))
      // openUrl aus A2UI-Screens (auch mailto:/tel:) über das System öffnen.
      // Button-Aktionen aus A2UI-Screens gehen als Nutzernachricht an den Chat (gesperrt, solange er arbeitet).
      setA2uiActionHandler((chatId, text) => {
        if (get().busy[chatId]) return
        void get().send(chatId, text)
      })
      for (const l of L.leaves(layout.root)) if (l.chatId) void loadTranscript(l.chatId)
    },

    setLayout(l, persist = true) {
      const active = L.findLeaf(l.root, l.selectedCellId)?.chatId
      set(active ? { layout: l, activeChatId: active } : { layout: l })
      if (persist) void window.api.setLayout(l)
    },

    selectCell(cellId) {
      if (get().layout.selectedCellId === cellId) return
      get().setLayout({ ...get().layout, selectedCellId: cellId })
    },

    async openChat(chatId, cellId) {
      const { layout } = get()
      const existing = L.findCellOfChat(layout.root, chatId)
      if (existing) {
        get().selectCell(existing.id)
        return
      }
      const target = cellId ?? layout.selectedCellId
      const cell = L.findLeaf(layout.root, target)
      if (!(await releaseChat(cell?.chatId ?? null, 'ersetzen'))) return
      void loadTranscript(chatId)
      get().setLayout({ root: L.setChat(get().layout.root, target, chatId), selectedCellId: target })
    },

    async newChat(agent, cellId) {
      const dir = await window.api.pickDirectory(get().settings?.lastDirectory || undefined)
      if (!dir) return
      const c = await window.api.createChat(dir, agent)
      set((s) => ({
        chats: s.chats.some((x) => x.id === c.id) ? s.chats : [c, ...s.chats],
        transcripts: { ...s.transcripts, [c.id]: [] },
        settings: s.settings ? { ...s.settings, lastDirectory: dir } : s.settings
      }))
      await get().openChat(c.id, cellId)
    },

    async openWorkshop(component) {
      const c = await window.api.createWorkshopChat(component)
      setDraft(
        c.id,
        component
          ? `Ich möchte die Komponente ${component} ändern: `
          : 'Bau mir eine neue A2UI-Komponente: '
      )
      set((s) => ({
        chats: s.chats.some((x) => x.id === c.id) ? s.chats : [c, ...s.chats],
        transcripts: { ...s.transcripts, [c.id]: [] },
        settingsOpen: false
      }))
      // In eine neue Zelle rechts neben der markierten – die Vorschau soll neben dem Bisherigen stehen.
      const { layout } = get()
      const sel = L.findLeaf(layout.root, layout.selectedCellId)
      let cellId = layout.selectedCellId
      if (sel?.chatId) {
        const nl = L.leaf()
        get().setLayout({ root: L.splitCell(layout.root, layout.selectedCellId, 'row', 'after', nl), selectedCellId: nl.id })
        cellId = nl.id
      }
      await get().openChat(c.id, cellId)
    },

    async closeChat(cellId) {
      const cell = L.findLeaf(get().layout.root, cellId)
      if (!cell?.chatId) return
      if (!(await releaseChat(cell.chatId, 'schließen'))) return
      get().setLayout({ ...get().layout, root: L.setChat(get().layout.root, cellId, null) })
    },

    async removeCell(cellId) {
      const cell = L.findLeaf(get().layout.root, cellId)
      if (!cell) return
      if (!(await releaseChat(cell.chatId, 'schließen'))) return
      const root = L.removeCell(get().layout.root, cellId)
      const ls = L.leaves(root)
      const sel = ls.some((l) => l.id === get().layout.selectedCellId) ? get().layout.selectedCellId : ls[0].id
      get().setLayout({ root, selectedCellId: sel })
    },

    splitCell(cellId, direction) {
      const nl = L.leaf()
      const root = L.splitCell(get().layout.root, cellId, direction, 'after', nl)
      get().setLayout({ root, selectedCellId: nl.id })
    },

    async drop(chatId, cellId, zone) {
      const { layout } = get()
      const target = L.findLeaf(layout.root, cellId)
      const source = L.findCellOfChat(layout.root, chatId)
      // Ein Chat aus der Sidebar verdrängt den Chat der Zielzelle.
      if (zone === 'center' && !source && target?.chatId) {
        if (!(await releaseChat(target.chatId, 'ersetzen'))) return
      }
      void loadTranscript(chatId)
      const r = L.dropChat(get().layout.root, chatId, cellId, zone)
      get().setLayout({ root: r.root, selectedCellId: r.cellId })
    },

    async deleteChat(chatId) {
      // Die Rückfrage passiert im Knopf selbst (ConfirmButton). Die CLI-Session bleibt erhalten.
      if (get().busy[chatId]) await window.api.interrupt(chatId)
      const cell = L.findCellOfChat(get().layout.root, chatId)
      if (cell) get().setLayout({ ...get().layout, root: L.setChat(get().layout.root, cell.id, null) })
      await window.api.deleteChat(chatId)
      disposeChatSurfaces(chatId)
      set((s) => {
        const transcripts = { ...s.transcripts }
        delete transcripts[chatId]
        const queues = { ...s.queues }
        delete queues[chatId]
        return { transcripts, queues, chats: s.chats.filter((x) => x.id !== chatId) }
      })
    },

    async renameChat(chatId, title) {
      const t = title.trim()
      if (t) await window.api.updateChat(chatId, { title: t })
    },

    async send(chatId, text, attachments) {
      await loadTranscript(chatId)
      await window.api.send(chatId, text, attachments)
    },

    async addFiles(chatId, files) {
      const errors: string[] = []
      for (const f of files) {
        try {
          const path = window.api.pathForFile(f)
          const a = path
            ? await window.api.importAttachment(chatId, path)
            : await window.api.saveAttachment(chatId, f.name && f.name !== 'image.png' ? f.name : `bild-${stamp()}.${ext(f.type)}`, new Uint8Array(await f.arrayBuffer()))
          set((s) => ({ pendingAttachments: { ...s.pendingAttachments, [chatId]: [...(s.pendingAttachments[chatId] ?? []), a] } }))
        } catch (e) {
          errors.push(ipcError(e))
        }
      }
      return errors
    },

    removeAttachment(chatId, path) {
      set((s) => ({ pendingAttachments: { ...s.pendingAttachments, [chatId]: (s.pendingAttachments[chatId] ?? []).filter((a) => a.path !== path) } }))
    },

    clearAttachments(chatId) {
      set((s) => ({ pendingAttachments: { ...s.pendingAttachments, [chatId]: [] } }))
    },

    addRef(chatId, quote, note) {
      const ref: QuoteRef = { id: crypto.randomUUID(), quote, note: note.trim() }
      set((s) => ({ pendingRefs: { ...s.pendingRefs, [chatId]: [...(s.pendingRefs[chatId] ?? []), ref] } }))
    },

    removeRef(chatId, id) {
      set((s) => ({ pendingRefs: { ...s.pendingRefs, [chatId]: (s.pendingRefs[chatId] ?? []).filter((r) => r.id !== id) } }))
    },

    takeRefs(chatId) {
      const refs = get().pendingRefs[chatId] ?? []
      set((s) => ({ pendingRefs: { ...s.pendingRefs, [chatId]: [] } }))
      return refs
    },

    restoreRefs(chatId, refs) {
      set((s) => ({ pendingRefs: { ...s.pendingRefs, [chatId]: [...refs, ...(s.pendingRefs[chatId] ?? [])] } }))
    },

    async askInNewChat(sourceChatId, quote, note, itemId) {
      const c = await window.api.forkChat(sourceChatId, forkTitle({ quote, note }), { itemId, quote })
      set((s) => ({ chats: s.chats.some((x) => x.id === c.id) ? s.chats : [c, ...s.chats] }))
      // In eine neue Zelle rechts neben dem Ausgangs-Chat.
      const { layout } = get()
      const src = L.findCellOfChat(layout.root, sourceChatId)
      const nl = L.leaf()
      const root = src ? L.splitCell(layout.root, src.id, 'row', 'after', nl) : L.splitCell(layout.root, layout.selectedCellId, 'row', 'after', nl)
      get().setLayout({ root, selectedCellId: nl.id })
      await get().openChat(c.id, nl.id)
      await get().send(c.id, composeMessage([{ id: '', quote, note }], ''))
    },

    enqueue(chatId, msg) {
      setQueue(chatId, Q.enqueue(queueOf(chatId), { ...msg, id: crypto.randomUUID() }))
      void drainQueue(chatId)
    },

    removeQueued(chatId, id) {
      setQueue(chatId, Q.removeQueued(queueOf(chatId), id))
    },

    takeQueued(chatId, id) {
      const m = queueOf(chatId).items.find((x) => x.id === id)
      if (m) setQueue(chatId, Q.removeQueued(queueOf(chatId), id))
      return m
    },

    resumeQueue(chatId) {
      setQueue(chatId, Q.resume(queueOf(chatId)))
      void drainQueue(chatId)
    },

    async openBeside(chatId, anchorChatId, side) {
      const { layout } = get()
      if (L.findCellOfChat(layout.root, chatId)) return get().openChat(chatId)
      const anchor = L.findCellOfChat(layout.root, anchorChatId)
      if (!anchor) return get().openChat(chatId)
      const nl = L.leaf()
      get().setLayout({ root: L.splitCell(layout.root, anchor.id, 'row', side, nl), selectedCellId: nl.id })
      await get().openChat(chatId, nl.id)
    },

    openBoard(chatId) {
      const root = rootOf(get().chats, chatId)
      const { layout } = get()
      const existing = L.findCellOfBoard(layout.root, root)
      if (existing) return get().selectCell(existing.id)
      const sel = L.findLeaf(layout.root, layout.selectedCellId)
      if (sel && !sel.chatId && !sel.board) {
        get().setLayout({ root: L.setBoard(layout.root, sel.id, root), selectedCellId: sel.id })
        return
      }
      const nl = L.leaf()
      const split = L.splitCell(layout.root, layout.selectedCellId, 'row', 'before', nl)
      get().setLayout({ root: L.setBoard(split, nl.id, root), selectedCellId: nl.id })
    },

    closeBoard(cellId) {
      get().setLayout({ ...get().layout, root: L.setChat(get().layout.root, cellId, null) })
    },

    async openFromBoard(boardCellId, chatId, itemId) {
      const { layout } = get()
      if (!L.findCellOfChat(layout.root, chatId)) {
        // Bevorzugt die Zelle, in die das Board zuletzt geöffnet hat (sonst neue Zelle rechts daneben).
        const prev = boardTargets.get(boardCellId)
        const target = prev ? L.findLeaf(layout.root, prev) : undefined
        if (target && !target.board) {
          await get().openChat(chatId, target.id)
        } else {
          const nl = L.leaf()
          get().setLayout({ root: L.splitCell(layout.root, boardCellId, 'row', 'after', nl), selectedCellId: nl.id })
          boardTargets.set(boardCellId, nl.id)
          await get().openChat(chatId, nl.id)
        }
      } else await get().openChat(chatId)
      get().jumpTo({ chatId, itemId })
    },

    ensureTranscripts(chatIds) {
      for (const id of chatIds) void loadTranscript(id)
    },

    jumpTo(target) {
      set((s) => ({ jump: { ...target, n: (s.jump?.n ?? 0) + 1 } }))
    },

    clearJump(n) {
      if (get().jump?.n === n) set({ jump: null })
    },

    async steerQueued(chatId, id) {
      const m = queueOf(chatId).items.find((x) => x.id === id)
      if (!m) return
      setQueue(chatId, { ...Q.removeQueued(queueOf(chatId), id), error: undefined })
      set((s) => ({ steering: { ...s.steering, [chatId]: [...(s.steering[chatId] ?? []), m] } }))
      try {
        await window.api.steer(chatId, composeMessage(m.refs, m.text), m.attachments)
      } catch (e) {
        set((s) => ({ steering: { ...s.steering, [chatId]: (s.steering[chatId] ?? []).filter((x) => x.id !== m.id) } }))
        setQueue(chatId, Q.putBack(queueOf(chatId), m, ipcError(e)))
      }
    },

    setDragging(chatId) {
      set({ dragging: chatId })
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open })
    },

    toggleSidebar() {
      const v = !get().sidebarCollapsed
      writeFlag('sidebarCollapsed', v)
      set({ sidebarCollapsed: v })
    },

    async saveSettings(patch) {
      const settings = await window.api.setSettings(patch)
      set({ settings })
    }
  }
})

/** Fehlermeldung aus einem IPC-Aufruf ohne Electron-Vorspann. */
export function ipcError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function ext(mime: string): string {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/tiff': 'tiff' } as Record<string, string>)[mime] ?? 'bin'
}

export function useChat(id: string | null | undefined): Chat | undefined {
  return useStore((s) => s.chats.find((c) => c.id === id))
}

export function shortPath(p: string, home: string): string {
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

export function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}
