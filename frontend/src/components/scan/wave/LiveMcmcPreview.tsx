import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { fetchMcmcBackground, fetchMcmcTrace } from '../../../api/wave'
import type { WaveCaseId } from '../../../api/wave'
import { MCMC_DENSITY_COLORSCALE, WAVE_COLORS } from '../../../lib/wavePalette'

interface Props {
  caseId: WaveCaseId
  // Fraction of total iterations to reveal — used by parent (PipelineRunModal)
  // to grow the scatter cloud while the inversion stage advances.
  progress: number  // 0..1
  targetIters: number
}

// Lightweight 3D MCMC scatter that grows with `progress`. Reuses the cached
// mcmc/trace and mcmc/background endpoints — same data the InversionPane
// shows, just rendered minimally for the modal's live preview slot.
export default function LiveMcmcPreview({ caseId, progress, targetIters }: Props) {
  const trace = useQuery({ queryKey: ['wave', 'mcmc', caseId], queryFn: () => fetchMcmcTrace(caseId), staleTime: Infinity })
  const bg = useQuery({ queryKey: ['wave', 'mcmc-bg'], queryFn: fetchMcmcBackground, staleTime: Infinity })

  // throttle the 3D scene update — Plotly's WebGL scene re-render is the
  // most expensive thing in the modal, so cap it at ~3 fps regardless of
  // how often `progress` changes.
  const [throttledProgress, setThrottledProgress] = useState(progress)
  useEffect(() => {
    const id = setTimeout(() => setThrottledProgress(progress), 60)
    return () => clearTimeout(id)
  }, [progress])

  const traces = useMemo(() => {
    if (!trace.data) return []
    const available = trace.data.total
    const n = Math.max(1, Math.min(available, Math.round(throttledProgress * targetIters)))
    const out: any[] = []

    if (bg.data?.tissues) {
      for (const [name, t] of Object.entries(bg.data.tissues)) {
        if (!t.i?.length) continue
        out.push({
          type: 'mesh3d', x: t.x, y: t.y, z: t.z, i: t.i, j: t.j, k: t.k,
          color: t.color, opacity: 0.06, name, hoverinfo: 'skip', showlegend: false,
          flatshading: true,
          lighting: { ambient: 0.9, diffuse: 0.5, specular: 0.05, roughness: 1.0 },
        })
      }
    }

    // Aggregate visit counts per unique (x,y,z) — same as InversionPane but
    // with the modal's throttled `n`.
    const counts: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const k = `${trace.data.x[i]},${trace.data.y[i]},${trace.data.z[i]}`
      counts[k] = (counts[k] || 0) + 1
    }
    const pts = Object.entries(counts).map(([k, c]) => {
      const [px, py, pz] = k.split(',').map(Number)
      return { px, py, pz, cnt: c }
    })
    const maxC = Math.max(...pts.map((p) => p.cnt), 1)
    const logC = pts.map((p) => Math.log1p(p.cnt))
    const maxLog = Math.log1p(maxC)
    const sizes = pts.map((p) => 3 + Math.sqrt(p.cnt / maxC) * 11)

    // Chain walk — line through visited iterations. Reveals the Metropolis
    // random-walk character (stays put on rejected proposals, jumps on
    // accepted). The modal preview ships this on by default so the user
    // sees full MCMC behaviour without toggling.
    out.push({
      type: 'scatter3d', mode: 'lines',
      x: trace.data.x.slice(0, n), y: trace.data.y.slice(0, n), z: trace.data.z.slice(0, n),
      line: { color: WAVE_COLORS.crosshair, width: 1.5 },
      opacity: 0.45,
      name: 'walk',
      hoverinfo: 'skip',
      showlegend: false,
    })

    out.push({
      type: 'scatter3d', mode: 'markers',
      x: pts.map((p) => p.px), y: pts.map((p) => p.py), z: pts.map((p) => p.pz),
      marker: {
        size: sizes, color: logC, colorscale: MCMC_DENSITY_COLORSCALE,
        cmin: 0, cmax: maxLog || 1, opacity: 0.85, line: { width: 0 },
      },
      customdata: pts.map((p) => p.cnt),
      hovertemplate: 'x %{x}<br>y %{y}<br>z %{z}<br>visits %{customdata}<extra></extra>',
      showlegend: false,
    })

    // Posterior mode (most-visited state) — ring marker.
    let modeKey = ''; let modeC = 0
    for (const [k, c] of Object.entries(counts)) if (c > modeC) { modeC = c; modeKey = k }
    if (modeKey) {
      const [mx, my, mz] = modeKey.split(',').map(Number)
      out.push({
        type: 'scatter3d', mode: 'markers',
        x: [mx], y: [my], z: [mz],
        marker: { symbol: 'circle-open', size: 14, color: WAVE_COLORS.accent, line: { color: WAVE_COLORS.accent, width: 3 } },
        name: 'mode',
        showlegend: false,
      })
    }

    // Min-misfit / MAP estimator within the revealed iterations — diamond.
    if (n > 0) {
      let bestI = 0; let bestM = trace.data.misfit[0]
      for (let i = 1; i < n; i++) {
        if (trace.data.misfit[i] < bestM) { bestM = trace.data.misfit[i]; bestI = i }
      }
      out.push({
        type: 'scatter3d', mode: 'markers',
        x: [trace.data.x[bestI]], y: [trace.data.y[bestI]], z: [trace.data.z[bestI]],
        marker: { symbol: 'diamond-open', size: 14, color: WAVE_COLORS.good, line: { color: WAVE_COLORS.good, width: 3 } },
        name: 'best',
        showlegend: false,
      })
    }

    const tv = trace.data.true_values
    out.push({
      type: 'scatter3d', mode: 'markers',
      x: [tv.x], y: [tv.y], z: [tv.z],
      marker: { symbol: 'cross', size: 14, color: WAVE_COLORS.bad, line: { color: '#fff', width: 2 } },
      name: 'true',
      showlegend: false,
    })

    return out
  }, [trace.data, bg.data, throttledProgress, targetIters])

  const layout = useMemo(() => {
    const PAD = 1
    let xr: [number, number] | undefined, yr: [number, number] | undefined, zr: [number, number] | undefined
    if (bg.data?.local_bounds) {
      const b = bg.data.local_bounds
      const safe = (a: number, c: number): [number, number] | undefined =>
        isFinite(a) && isFinite(c) && c > a ? [a - PAD, c + PAD] : undefined
      xr = safe(b.x[0], b.x[1])
      yr = safe(b.y[0], b.y[1])
      zr = safe(b.z[0], b.z[1])
    }
    const axis = (range?: [number, number]) => ({
      color: WAVE_COLORS.muted,
      gridcolor: WAVE_COLORS.border,
      backgroundcolor: WAVE_COLORS.surface,
      showbackground: true,
      ...(range ? { autorange: false, range } : {}),
    })
    return {
      autosize: true,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: WAVE_COLORS.text, family: 'Inter, sans-serif', size: 10 },
      scene: {
        bgcolor: WAVE_COLORS.bg,
        xaxis: { title: { text: 'x', font: { size: 10 } }, ...axis(xr) },
        yaxis: { title: { text: 'y', font: { size: 10 } }, ...axis(yr) },
        zaxis: { title: { text: 'z', font: { size: 10 } }, ...axis(zr) },
        aspectmode: 'data' as const,
      },
      showlegend: false,
    }
  }, [bg.data])

  const currentIter = Math.round(progress * targetIters)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <GitBranch size={13} className="text-accent" /> <span className="font-semibold">MCMC chain · walk + mode + MAP + GT</span>
        </div>
        <span className="font-mono text-[10px] text-muted">
          {currentIter.toLocaleString()} / {targetIters.toLocaleString()} iter
        </span>
      </div>
      <div className="flex items-center gap-3 border-b border-line bg-panel-2/40 px-3 py-1 text-[10px]">
        <span className="flex items-center gap-1 text-good"><span className="inline-block h-2 w-2 rounded-full border border-good" /> mode</span>
        <span className="flex items-center gap-1" style={{ color: 'var(--color-good)' }}><span className="inline-block h-2 w-2 rotate-45 border" style={{ borderColor: 'currentColor' }} /> MAP</span>
        <span className="flex items-center gap-1 text-bad"><span className="inline-block">+</span> GT</span>
        <span className="ml-auto flex items-center gap-1 text-muted"><span className="inline-block h-px w-3 bg-warn" /> walk</span>
      </div>
      <div className="min-h-0 flex-1 p-1">
        {trace.data ? (
          <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">MCMC 데이터 로딩…</div>
        )}
      </div>
    </div>
  )
}
