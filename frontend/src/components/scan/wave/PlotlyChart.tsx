import { useEffect, useRef } from 'react'
// Plotly is heavy (~1.4 MB gzipped) — vite.config.ts manualChunks pins it
// to its own `plotly` chunk so a top-level import here doesn't bloat the
// initial bundle. Combined with React.lazy() on every chart-using route
// (see App.tsx), the chunk only downloads when the user opens a chart.
import Plotly from 'plotly.js-dist-min'

interface Props {
  data: Plotly.Data[]
  layout?: Partial<Plotly.Layout>
  config?: Partial<Plotly.Config>
  className?: string
  onSelected?: (e: Plotly.PlotSelectionEvent) => void
  onDeselect?: () => void
}

const DEFAULT_CONFIG: Partial<Plotly.Config> = {
  // Plotly's built-in modebar covers Phase 4.3 PNG/SVG export at zero code cost.
  displayModeBar: 'hover',
  modeBarButtonsToRemove: [
    'autoScale2d', 'select2d', 'lasso2d', 'zoom2d', 'pan2d',
    'zoomIn2d', 'zoomOut2d', 'resetScale2d',
    'hoverClosestCartesian', 'hoverCompareCartesian',
  ],
  displaylogo: false,
  toImageButtonOptions: { format: 'png', filename: 'dental-wave', scale: 2 },
  responsive: true,
}

type PlotlyEl = HTMLDivElement & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeAllListeners?: (event: string) => void
  _fullLayout?: unknown
}

export default function PlotlyChart({
  data, layout, config, className, onSelected, onDeselect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const onSelRef = useRef(onSelected)
  const onDesRef = useRef(onDeselect)
  useEffect(() => { onSelRef.current = onSelected }, [onSelected])
  useEffect(() => { onDesRef.current = onDeselect }, [onDeselect])

  // Render the chart. `Plotly.react` returns a Promise — wait for it before
  // attaching event handlers, since the event-emitter methods (`.on`,
  // `.removeAllListeners`) are added to the div only after the chart is laid
  // out. Skipping the await caused "el.on is not a function" on cold renders,
  // which ErrorBoundary surfaced as "화면 렌더링 오류".
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current as PlotlyEl
    let cancelled = false
    // Wrap the sync portion of Plotly.react in try/catch — invalid layout
    // (NaN ranges, type:'log' with non-positive data, etc) can throw
    // synchronously before returning a promise. Without this guard the
    // exception would surface inside an effect tick which React 19 may
    // route to the nearest ErrorBoundary, leaving the user with a
    // "Something went wrong with axis scaling" banner instead of a chart.
    try {
      Plotly.react(el, data, layout ?? {}, { ...DEFAULT_CONFIG, ...config })
        .then(() => {
          if (cancelled) return
          try {
            el.removeAllListeners?.('plotly_selected')
            el.removeAllListeners?.('plotly_deselect')
            if (typeof el.on === 'function') {
              el.on('plotly_selected', (e) => onSelRef.current?.(e as Plotly.PlotSelectionEvent))
              el.on('plotly_deselect', () => onDesRef.current?.())
            }
          } catch (err) {
            console.warn('Plotly event-handler attach failed:', err)
          }
        })
        .catch((err) => {
          if (cancelled) return
          console.error('Plotly.react failed:', err)
        })
    } catch (err) {
      console.error('Plotly.react sync throw:', err)
    }
    return () => { cancelled = true }
  }, [data, layout, config])

  // Force the chart to match container dimensions exactly. `Plotly.Plots.resize`
  // alone doesn't always re-fit 3D scenes or panels that grew significantly
  // after the initial layout pass — Plotly caches the original autosize result.
  // Calling `Plotly.relayout(el, {width, height})` with explicit pixels from
  // getBoundingClientRect overrides that cache reliably.
  useEffect(() => {
    if (!ref.current) return
    const tryResize = () => {
      const el = ref.current as PlotlyEl | null
      if (!el || !el._fullLayout) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      try {
        (Plotly as unknown as { relayout: (el: Element, update: Record<string, unknown>) => void })
          .relayout(el, { width: rect.width, height: rect.height, autosize: true })
      } catch (err) {
        console.warn('Plotly relayout failed:', err)
      }
    }
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(tryResize)
      observer.observe(ref.current)
    }
    window.addEventListener('resize', tryResize)
    // Kick a resize after the chart has had time to lay out — covers
    // ResizeObserver not firing on initial mount, and gives flex/grid layout
    // a chance to settle before we pin a pixel size.
    const kicks = [40, 120, 320, 800].map((ms) => setTimeout(tryResize, ms))
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', tryResize)
      kicks.forEach(clearTimeout)
    }
  }, [])

  // Clean up the Plotly instance when the component unmounts so the next
  // mount on the same div doesn't inherit a stale chart.
  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) {
        try { Plotly.purge(el) } catch { /* noop */ }
      }
    }
  }, [])

  return <div ref={ref} className={className ?? 'h-full w-full'} />
}
