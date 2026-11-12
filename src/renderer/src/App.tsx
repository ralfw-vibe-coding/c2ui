import { useEffect } from 'react'
import { Grid } from './components/Grid'
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
    return () => window.removeEventListener('keydown', onKey)
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
    </div>
  )
}
