import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { setManualThemeFlag } from '../lib/useRouteTheme'

type Theme = 'dark' | 'light'
const KEY = 'wave-screen-theme'

function getInitial(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(KEY) as Theme | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.documentElement.style.colorScheme = t
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  return (
    <button
      onClick={() => {
        setManualThemeFlag(true)
        setTheme(theme === 'dark' ? 'light' : 'dark')
      }}
      title={`${theme === 'dark' ? '라이트' : '다크'} 테마로 전환 (라우트 자동전환 끄기)`}
      className="btn-ghost btn"
    >
      {theme === 'dark' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
    </button>
  )
}
