import { useEffect } from 'react'
import { Grid } from './components/Grid'
import { AdoptDialog } from './components/AdoptDialog'
import { MergeDialog } from './components/MergeDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar, SidebarToggle } from './components/Sidebar'
import { useStore } from './store'

export function App() {
  const ready = useStore((s) => s.ready)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const collapsed = useStore((s) => s.sidebarCollapsed)

  useEffect(() => {
    void useStore.getState().init()
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useStore.getState().toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    // Dateien, die neben einen Chat fallen, sollen das Fenster nicht zu der Datei navigieren.
    const stopFileDrop = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', stopFileDrop)
    window.addEventListener('drop', stopFileDrop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', stopFileDrop)
      window.removeEventListener('drop', stopFileDrop)
    }
  }, [])

  if (!ready) return <div className="boot muted">Lade …</div>
  return (
    <div className={`app${collapsed ? ' sidebar-collapsed' : ''}`}>
      {!collapsed && <Sidebar />}
      <main className="main">
        {collapsed && <div className="titlebar drag-region" />}
        <div className="grid-wrap">
          <Grid />
        </div>
      </main>
      {/* Fest positioniert, damit der Knopf beim Ein-/Ausklappen nicht springt. */}
      <div className="window-controls">
        <SidebarToggle />
      </div>
      {settingsOpen && <SettingsDialog />}
      <MergeDialog />
      <AdoptDialog />
    </div>
  )
}
