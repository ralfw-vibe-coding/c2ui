import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import type { AgentEvent, AgentKind, Chat, LayoutState, PermissionMode, Settings, Transcript } from '@shared/types'

export interface InitState {
  settings: Settings
  chats: Chat[]
  layout: LayoutState | null
  busy: string[]
  home: string
}

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const h = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const api = {
  init: (): Promise<InitState> => ipcRenderer.invoke('state:init'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  setLayout: (l: LayoutState): Promise<void> => ipcRenderer.invoke('layout:set', l),
  createChat: (cwd: string, agent: AgentKind, mode?: PermissionMode): Promise<Chat> =>
    ipcRenderer.invoke('chats:create', cwd, agent, mode),
  updateChat: (id: string, patch: Partial<Pick<Chat, 'title' | 'permissionMode'>>): Promise<Chat> =>
    ipcRenderer.invoke('chats:update', id, patch),
  deleteChat: (id: string): Promise<void> => ipcRenderer.invoke('chats:delete', id),
  transcript: (id: string): Promise<Transcript> => ipcRenderer.invoke('transcript:get', id),
  send: (id: string, text: string): Promise<void> => ipcRenderer.invoke('agent:send', id, text),
  interrupt: (id: string): Promise<void> => ipcRenderer.invoke('agent:interrupt', id),
  pickDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:pickDirectory', defaultPath),
  reveal: (path: string): Promise<string> => ipcRenderer.invoke('shell:reveal', path),
  confirmBusy: (title: string, action: string): Promise<'background' | 'stop' | 'cancel'> =>
    ipcRenderer.invoke('dialog:confirmBusy', title, action),
  confirm: (message: string, detail: string, ok: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message, detail, ok),
  onAgentEvent: (cb: (chatId: string, e: AgentEvent) => void) => on('agent:event', cb),
  onBusy: (cb: (chatId: string, busy: boolean) => void) => on('agent:busy', cb),
  onChatsChanged: (cb: (chats: Chat[]) => void) => on('chats:changed', cb)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

// Die macOS-Fensterknöpfe werden nicht mitgezoomt. Die Titelzeile rechnet deshalb mit
// --zoom zurück, damit sie bei jedem Zoomfaktor auf Höhe der Knöpfe bleibt.
function applyZoom(): void {
  document.documentElement.style.setProperty('--zoom', String(webFrame.getZoomFactor()))
}
window.addEventListener('DOMContentLoaded', applyZoom)
window.addEventListener('resize', applyZoom)
