import { useEffect, useState, useMemo } from 'react'

function readVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export interface PlotlyTheme {
  paper: string
  plot: string
  text: string
  muted: string
  grid: string
  zero: string
}

export function usePlotlyTheme(): PlotlyTheme {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') {
          setVersion((v) => v + 1)
          break
        }
      }
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return useMemo<PlotlyTheme>(() => ({
    paper: readVar('--color-panel'),
    plot:  readVar('--color-bg'),
    text:  readVar('--color-text'),
    muted: readVar('--color-muted'),
    grid:  readVar('--color-line').startsWith('rgba')
      ? readVar('--color-line')
      : readVar('--color-line'),
    zero:  readVar('--color-divider'),
  }), [version])
}
