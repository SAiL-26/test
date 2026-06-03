import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource-variable/newsreader/index.css'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/500.css'
import '@fontsource/noto-sans-kr/700.css'
import './index.css'
import App from './App.tsx'
import { applyTheme } from './components/ThemeToggle'

// Clinical Light is the new default (per design handoff §6). Dark is reserved
// for imaging surfaces (auto-applied by useRouteTheme on /scans/:id, /compare).
const stored = localStorage.getItem('wave-screen-theme')
applyTheme(stored === 'dark' ? 'dark' : 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
