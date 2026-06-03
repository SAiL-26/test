import { useEffect, useRef, useState } from 'react'
// Plotly is heavy (~4.4 MB minified / ~1.4 MB gzipped). Even with
// React.lazy() on every chart-using route, a top-level `import Plotly`
// here forces Rollup to pull the plotly chunk into the route's import
// graph — so /scans/:id waits ~1-2 s for the bundle to download + parse
// before WaveWorkspace can render *any* skeleton at all.
//
// Instead we dynamic-import Plotly inside the first effect. The module
// resolves once and is cached on `plotlyPromise`, so subsequent chart
// mounts within the same session share the single in-flight (or already
// resolved) chunk. Each chart shows a lightweight skeleton until Plotly
// is ready, giving the user perceived progress while the chunk streams.
// The `plotly.js-dist-min` package's TS types are partial — they don't
// expose `react`, `purge`, or `relayout` on the default export shape.
// We narrow to the runtime functions we actually call.
interface PlotlyNS {
  react: (el: Element, data: unknown, layout: unknown, config: unknown) => Promise<unknown>
  purge: (el: Element) => void
  relayout: (el: Element, update: Record<string, unknown>) => void
}
let plotlyPromise: Promise<PlotlyNS> | null = null
function loadPlotly(): Promise<PlotlyNS> {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min').then((m) => {
      // The package exposes the API on `default` in ESM and on the module
      // root in CJS — accept either shape.
      const ns = (m as { default?: unknown }).default ?? m
      return ns as PlotlyNS
    })
  }
  return plotlyPromise
}

type PlotlyData = unknown
type PlotlyLayout = Record<string, unknown>
type PlotlyConfig = Record<string, unknown>
type PlotlySelectionEvent = unknown

interface Props {
  data: PlotlyData[]
  layout?: Partial<PlotlyLayout>
  config?: Partial<PlotlyConfig>
  className?: string
  onSelected?: (e: PlotlySelectionEvent) => void
  onDeselect?: () => void
}

const DEFAULT_CONFIG: Partial<PlotlyConfig> = {
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
  const [plotly, setPlotly] = useState<PlotlyNS | null>(null)
  useEffect(() => { onSelRef.current = onSelected }, [onSelected])
  useEffect(() => { onDesRef.current = onDeselect }, [onDeselect])

  // Kick off the Plotly chunk download once on first mount of any chart.
  // Subsequent mounts in the same session share the cached promise so each
  // pane resolves nearly instantly after the first one.
  useEffect(() => {
    let cancelled = false
    loadPlotly().then((mod) => {
      if (cancelled) return
      setPlotly(mod)
    }).catch((err) => {
      console.error('Plotly module load failed:', err)
    })
    return () => { cancelled = true }
  }, [])

  // Render the chart. `Plotly.react` returns a Promise — wait for it before
  // attaching event handlers, since the event-emitter methods (`.on`,
  // `.removeAllListeners`) are added to the div only after the chart is laid
  // out. Skipping the await caused "el.on is not a function" on cold renders,
  // which ErrorBoundary surfaced as "화면 렌더링 오류".
  useEffect(() => {
    if (!ref.current || !plotly) return
    const Plotly = plotly
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
              el.on('plotly_selected', (e) => onSelRef.current?.(e as PlotlySelectionEvent))
              el.on('plotly_deselect', () => onDesRef.current?.())
            }
          } catch (err) {
            console.warn('Plotly event-handler attach failed:', err)
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return
          console.error('Plotly.react failed:', err)
        })
    } catch (err) {
      console.error('Plotly.react sync throw:', err)
    }
    return () => { cancelled = true }
  }, [data, layout, config, plotly])

  // Force the chart to match container dimensions exactly. `Plotly.Plots.resize`
  // alone doesn't always re-fit 3D scenes or panels that grew significantly
  // after the initial layout pass — Plotly caches the original autosize result.
  // Calling `Plotly.relayout(el, {width, height})` with explicit pixels from
  // getBoundingClientRect overrides that cache reliably.
  useEffect(() => {
    if (!ref.current || !plotly) return
    const Plotly = plotly
    const tryResize = () => {
      const el = ref.current as PlotlyEl | null
      if (!el || !el._fullLayout) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      try {
        Plotly.relayout(el, { width: rect.width, height: rect.height, autosize: true })
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
  }, [plotly])

  // Clean up the Plotly instance when the component unmounts so the next
  // mount on the same div doesn't inherit a stale chart.
  useEffect(() => {
    const el = ref.current
    return () => {
      if (el && plotly) {
        try { plotly.purge(el) } catch { /* noop */ }
      }
    }
  }, [plotly])

  return (
    <div ref={ref} className={className ?? 'h-full w-full'}>
      {!plotly && (
        <div className="skeleton h-full w-full rounded-md" aria-label="차트 로딩 중" />
      )}
    </div>
  )
}
