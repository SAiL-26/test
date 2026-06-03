import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applyTheme } from '../components/ThemeToggle'

/**
 * Route-driven theme switching (per design handoff):
 *   • Clinical Light (warm porcelain)  — admin / triage / story / wizard / lab / mobile
 *   • Clinical Dark  (imaging surface) — /scans/:id (console) · /compare
 * The manual ThemeToggle sets `wave-screen-theme-manual=1`; while set, auto-switch is skipped.
 */
const IMAGING_PATTERNS: RegExp[] = [
  /^\/scans\/\d+($|\/)/,
  /^\/patients\/\d+\/compare/,
  /^\/compare/,
]

const LIGHT_PATTERNS: RegExp[] = [
  /^\/login/,
  /^\/intro/,
  /^\/$/,
  /^\/patients\/?$/,
  /^\/patients\/\d+\/?$/,
  /^\/patients\/\d+\/timeline/,
  /^\/scans\/new/,
  /^\/scans\/\d+\/story/,
  /^\/runs/,
  /^\/eval/,
  /^\/lab/,
  /^\/m($|\/)/,
]

const STORE_KEY = 'wave-screen-theme'
const OVERRIDE_KEY = 'wave-screen-theme-manual'

export function setManualThemeFlag(on: boolean) {
  if (on) localStorage.setItem(OVERRIDE_KEY, '1')
  else localStorage.removeItem(OVERRIDE_KEY)
}

export default function useRouteTheme() {
  const location = useLocation()
  useEffect(() => {
    if (localStorage.getItem(OVERRIDE_KEY) === '1') return
    const path = location.pathname
    if (LIGHT_PATTERNS.some((p) => p.test(path))) {
      applyTheme('light')
      localStorage.setItem(STORE_KEY, 'light')
    } else if (IMAGING_PATTERNS.some((p) => p.test(path))) {
      applyTheme('dark')
      localStorage.setItem(STORE_KEY, 'dark')
    }
  }, [location.pathname])
}
