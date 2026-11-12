import { createRoot } from 'react-dom/client'
import { App } from './App'
import { A2uiHarness } from './a2ui/A2uiHarness'
import './styles.css'

createRoot(document.getElementById('root')!).render(location.hash === '#a2ui-test' ? <A2uiHarness /> : <App />)
