import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, GitBranch, Pause, Play, RotateCcw } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { McmcBackground, McmcTrace } from '../../../api/wave'
import McmcParticleField from './McmcParticleField'

const FRAME_MS = 80
const BASE_ITERS_PER_FRAME = 5
const SPEEDS = [1, 2, 5, 10] as const

function computeMetrics(d: McmcTrace, n: number) {
  const xyz: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const k = `${d.x[i]},${d.y[i]},${d.z[i]}`
    xyz[k] = (xyz[k] || 0) + 1
  }
  let modeKey: string | null = null
  let modeCount = 0
  for (const [k, c] of Object.entries(xyz)) {
    if (c > modeCount) { modeCount = c; modeKey = k }
  }
  const [mx, my, mz] = modeKey ? modeKey.split(',').map(Number) : [0, 0, 0]
  let modeR: number | null = null
  if (modeKey) {
    const rC: Record<number, number> = {}
    for (let i = 0; i < n; i++) {
      if (d.x[i] === mx && d.y[i] === my && d.z[i] === mz) {
        rC[d.r[i]] = (rC[d.r[i]] || 0) + 1
      }
    }
    let maxC = 0
    for (const [r, c] of Object.entries(rC)) {
      if (c > maxC) { maxC = c; modeR = Number(r) }
    }
  }
  let bestI = 0; let bestM = d.misfit[0]
  for (let i = 1; i < n; i++) {
    if (d.misfit[i] < bestM) { bestM = d.misfit[i]; bestI = i }
  }
  return {
    mode: { x: mx, y: my, z: mz, r: modeR },
    bestMisfit: { x: d.x[bestI], y: d.y[bestI], z: d.z[bestI], r: d.r[bestI], misfit: bestM, iter: d.iterations[bestI] },
  }
}

interface Props {
  trace: McmcTrace | undefined
  background: McmcBackground | undefined
}

export default function InversionPane({ trace, background }: Props) {
  const [iter, setIter] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(1)
  // Default all overlay markers ON — the mode / MAP / chain-walk markers are
  // the headline insights from MCMC inversion; hiding them by default just
  // means the demo audience misses them. Users can still toggle individual
  // markers off.
  const [showMode, setShowMode] = useState(true)
  const [showBest, setShowBest] = useState(true)
  const [showWalk, setShowWalk] = useState(true)
  const lastRef = useRef(0)

  const total = trace?.total ?? 0
  const complete = total > 0 && iter >= total - 1
  const n = Math.min(iter + 1, total)
  const pct = total > 0 ? ((iter + 1) / total) * 100 : 0

  const reset = useCallback(() => {
    setPlaying(false); setIter(0); lastRef.current = 0
  }, [])

  useEffect(() => {
    if (!playing || !trace) return
    const step = BASE_ITERS_PER_FRAME * speed
    const id = setInterval(() => {
      setIter((p) => {
        const next = p + step
        if (next >= total - 1) { setPlaying(false); return total - 1 }
        return next
      })
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [playing, speed, trace, total])

  // Throttle the particle-field re-builds — the R3F canvas already animates
  // smoothly, so we don't need to recompute scene data on every iter tick.
  useEffect(() => {
    if (!trace) return
    lastRef.current = Date.now()
  }, [n, total, trace])

  // Acceptance rate — proportion of iterations where the chain moved.
  const acceptance = useMemo(() => {
    if (!trace || trace.x.length < 2) return null
    let moves = 0
    for (let i = 1; i < trace.x.length; i++) {
      if (trace.x[i] !== trace.x[i - 1] || trace.y[i] !== trace.y[i - 1] || trace.z[i] !== trace.z[i - 1]) moves++
    }
    return (moves / (trace.x.length - 1)) * 100
  }, [trace])

  const misfitLayout = useMemo(() => {
    // Only set explicit log-range when we have at least 2 strictly-positive
    // finite misfit values with non-degenerate spread — otherwise let Plotly
    // autorange. This avoids "Something went wrong with axis scaling" when the
    // trace has empty / all-zero / single-valued misfits.
    let yr: [number, number] | undefined
    if (trace) {
      const pos = trace.misfit.filter((v) => v > 0 && isFinite(v))
      if (pos.length >= 2) {
        const lo = Math.log10(Math.min(...pos))
        const hi = Math.log10(Math.max(...pos))
        if (isFinite(lo) && isFinite(hi) && hi > lo) {
          yr = [lo - 0.03, hi + 0.03]
        }
      }
    }
    const base = basePlotlyLayout()
    const safeTotal = total > 1 ? total : 2
    return {
      ...base,
      margin: { l: 64, r: 14, t: 28, b: 44 },
      xaxis: { ...base.xaxis, title: { text: 'iter', font: { size: 11 } }, range: [0, safeTotal - 1], autorange: false },
      yaxis: { ...base.yaxis, title: { text: 'misfit', font: { size: 11 } }, type: 'log' as const, tickformat: '.1e', ...(yr ? { range: yr, autorange: false } : { autorange: true }) },
    }
  }, [total, trace])

  const misfitTraces = useMemo(() => {
    if (!trace || n === 0) return []
    const its = trace.iterations.slice(0, n)
    const ms = trace.misfit.slice(0, n)
    let bestI = 0, bestV = ms[0]
    for (let i = 1; i < n; i++) if (ms[i] < bestV) { bestV = ms[i]; bestI = i }
    return [
      { type: 'scatter', mode: 'lines', x: its, y: ms, line: { color: WAVE_COLORS.warn, width: 1.8 }, hovertemplate: 'iter %{x}<br>misfit %{y:.3e}<extra></extra>' },
      { type: 'scatter', mode: 'markers', x: [its[bestI]], y: [bestV], marker: { color: WAVE_COLORS.good, size: 10, line: { color: '#fff', width: 1.5 } }, hovertemplate: 'best iter %{x}<br>%{y:.3e}<extra></extra>' },
    ] as any[]
  }, [trace, n])

  const metrics = useMemo(() => (trace ? computeMetrics(trace, n) : null), [trace, n])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <GitBranch size={13} className="text-accent" /> <span className="font-semibold">Stochastic inversion · MCMC</span>
        </div>
        {trace && (
          <span className="font-mono text-[10px] text-muted">iter {n.toLocaleString()} / {total.toLocaleString()}</span>
        )}
      </header>
      {!trace ? (
        <div className="flex h-full items-center justify-center text-xs text-muted">MCMC 데이터 로딩 중…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={complete && !playing}
              className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 hover:border-accent disabled:opacity-50"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? 'Pause' : complete ? 'Done' : 'Play'}
            </button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 hover:border-accent">
              <RotateCcw size={11} /> Reset
            </button>
            <div className="ml-1 flex items-center gap-1 text-muted">
              <span className="text-[10px]">배속</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${speed === s ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel-2 hover:border-accent/40'}`}
                >{s}×</button>
              ))}
            </div>
            <div className="ml-1 flex items-center gap-1 text-muted">
              <span className="text-[10px]">마커</span>
              <button onClick={() => setShowMode((v) => !v)} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${showMode ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel-2'}`}>
                {showMode ? <Eye size={10} /> : <EyeOff size={10} />} mode
              </button>
              <button onClick={() => setShowBest((v) => !v)} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${showBest ? 'border-good bg-good/15 text-good' : 'border-line bg-panel-2'}`}>
                {showBest ? <Eye size={10} /> : <EyeOff size={10} />} best
              </button>
              <button onClick={() => setShowWalk((v) => !v)} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${showWalk ? 'border-warn bg-warn/15 text-warn' : 'border-line bg-panel-2'}`}>
                {showWalk ? <Eye size={10} /> : <EyeOff size={10} />} walk
              </button>
            </div>
            {acceptance != null && (
              <div className="ml-auto flex items-center gap-1 text-[10px] text-muted">
                <span>accept</span>
                <span className={`font-mono ${acceptance >= 20 && acceptance <= 60 ? 'text-good' : 'text-warn'}`}>{acceptance.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <input
            type="range" min={0} max={Math.max(0, total - 1)} value={iter}
            onChange={(e) => { setPlaying(false); setIter(Number(e.target.value)) }}
            className="w-full accent-accent"
          />
          <div className="h-1 w-full overflow-hidden rounded bg-panel-2">
            <div className={`h-full ${complete ? 'bg-good' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <div className="overflow-hidden rounded-md">
              <McmcParticleField
                trace={trace}
                background={background}
                n={n}
                showMode={showMode}
                showBest={showBest}
                showWalk={showWalk}
              />
            </div>
            <PlotlyChart data={misfitTraces} layout={misfitLayout} className="h-full w-full" />
          </div>
          {complete && metrics && (
            <div className="rounded border border-line bg-panel-2 p-2 text-[11px]">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-text">정량 지표</span>
                <span className="text-muted">best iter <span className="text-good">{metrics.bestMisfit.iter}</span>, misfit <span className="text-good">{metrics.bestMisfit.misfit.toExponential(2)}</span></span>
              </div>
              <table className="w-full font-mono text-[10px]">
                <thead className="text-muted">
                  <tr><th className="text-left">param</th><th>true</th><th>mode</th><th>best</th><th>|Δmode|</th><th>|Δbest|</th></tr>
                </thead>
                <tbody>
                  {[
                    { p: 'x', t: trace.true_values.x, m: metrics.mode.x, b: metrics.bestMisfit.x },
                    { p: 'y', t: trace.true_values.y, m: metrics.mode.y, b: metrics.bestMisfit.y },
                    { p: 'z', t: trace.true_values.z, m: metrics.mode.z, b: metrics.bestMisfit.z },
                    { p: 'r', t: trace.true_values.r, m: metrics.mode.r, b: metrics.bestMisfit.r },
                  ].map((row) => {
                    const dm = row.m != null ? Math.abs(row.m - row.t) : null
                    const db = Math.abs(row.b - row.t)
                    return (
                      <tr key={row.p} className="border-t border-line/60">
                        <td className="text-muted">{row.p}</td>
                        <td className="text-right">{row.t}</td>
                        <td className="text-right">{row.m ?? '—'}</td>
                        <td className="text-right">{row.b}</td>
                        <td className={`text-right ${dm != null && dm <= 2 ? 'text-good' : 'text-warn'}`}>{dm ?? '—'}</td>
                        <td className={`text-right ${db <= 2 ? 'text-good' : 'text-warn'}`}>{db}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
