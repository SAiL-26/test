import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Target } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { fetchMcmcBackground, fetchMcmcTrace } from '../../../api/wave'
import type { WaveCaseId } from '../../../api/wave'
import { WAVE_COLORS } from '../../../lib/wavePalette'
import CameraPresetButtons, { CAMERA_PRESETS, type CameraKey } from './CameraPresets'

interface Props {
  caseId: WaveCaseId
}

// Compute 95% credible ellipsoid from the MCMC posterior samples — uses the
// empirical mean and standard deviation per axis. For 95% credible the
// ellipsoid radii are ~1.96σ (assumes approximately Gaussian posterior in
// each axis, which is a reasonable demo simplification).
function ellipsoid(x: number[], y: number[], z: number[]) {
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)
  const std = (a: number[], m: number) =>
    Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / Math.max(1, a.length))
  const mx = mean(x), my = mean(y), mz = mean(z)
  const sx = std(x, mx), sy = std(y, my), sz = std(z, mz)
  const N = 24
  const pts = { x: [] as number[], y: [] as number[], z: [] as number[], i: [] as number[], j: [] as number[], k: [] as number[] }
  // parametric ellipsoid surface
  for (let u = 0; u <= N; u++) {
    for (let v = 0; v <= N; v++) {
      const theta = (u / N) * Math.PI
      const phi   = (v / N) * 2 * Math.PI
      pts.x.push(mx + 1.96 * sx * Math.sin(theta) * Math.cos(phi))
      pts.y.push(my + 1.96 * sy * Math.sin(theta) * Math.sin(phi))
      pts.z.push(mz + 1.96 * sz * Math.cos(theta))
    }
  }
  // triangulate the (N+1)×(N+1) grid
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      const a = u * (N + 1) + v
      const b = a + 1
      const c = a + (N + 1)
      const d = c + 1
      pts.i.push(a, b)
      pts.j.push(b, d)
      pts.k.push(c, c)
    }
  }
  return { mean: { x: mx, y: my, z: mz }, std: { x: sx, y: sy, z: sz }, mesh: pts }
}

export default function TrueVsEstimatePane({ caseId }: Props) {
  const trace = useQuery({ queryKey: ['wave', 'mcmc', caseId], queryFn: () => fetchMcmcTrace(caseId), staleTime: Infinity })
  const bg = useQuery({ queryKey: ['wave', 'mcmc-bg'], queryFn: fetchMcmcBackground, staleTime: Infinity })
  const [camera, setCamera] = useState<CameraKey>('default')

  const summary = useMemo(() => {
    if (!trace.data) return null
    return ellipsoid(trace.data.x, trace.data.y, trace.data.z)
  }, [trace.data])

  const traces = useMemo<any[]>(() => {
    if (!trace.data || !summary) return []
    const tv = trace.data.true_values
    const est = summary.mean
    const out: any[] = []

    // background tissue meshes — very faint for context only
    if (bg.data?.tissues) {
      for (const [name, t] of Object.entries(bg.data.tissues)) {
        if (!t.i?.length) continue
        out.push({
          type: 'mesh3d', x: t.x, y: t.y, z: t.z, i: t.i, j: t.j, k: t.k,
          color: t.color, opacity: 0.04, name, hoverinfo: 'skip', showlegend: false,
          flatshading: true,
          lighting: { ambient: 0.9, diffuse: 0.5, specular: 0.05, roughness: 1.0 },
        })
      }
    }

    // 95% credible-region ellipsoid (translucent cyan)
    out.push({
      type: 'mesh3d',
      x: summary.mesh.x, y: summary.mesh.y, z: summary.mesh.z,
      i: summary.mesh.i, j: summary.mesh.j, k: summary.mesh.k,
      color: WAVE_COLORS.accent,
      opacity: 0.18,
      flatshading: true,
      hoverinfo: 'skip',
      name: '95% credible region',
      showlegend: true,
    })

    // ground-truth marker (green cross)
    out.push({
      type: 'scatter3d', mode: 'markers+text',
      x: [tv.x], y: [tv.y], z: [tv.z],
      marker: { symbol: 'cross', size: 14, color: WAVE_COLORS.good, line: { color: '#fff', width: 2 } },
      text: ['GT'], textposition: 'top center', textfont: { color: WAVE_COLORS.good, size: 11 },
      name: `GT (${tv.x}, ${tv.y}, ${tv.z})`,
      hovertemplate: `GT: (${tv.x}, ${tv.y}, ${tv.z})<extra></extra>`,
    })

    // posterior-mean estimate marker (magenta diamond)
    out.push({
      type: 'scatter3d', mode: 'markers+text',
      x: [est.x], y: [est.y], z: [est.z],
      marker: { symbol: 'diamond', size: 12, color: WAVE_COLORS.findingHi, line: { color: '#fff', width: 2 } },
      text: ['EST'], textposition: 'bottom center', textfont: { color: WAVE_COLORS.findingHi, size: 11 },
      name: `Estimate (${est.x.toFixed(1)}, ${est.y.toFixed(1)}, ${est.z.toFixed(1)})`,
      hovertemplate: `Est: (${est.x.toFixed(2)}, ${est.y.toFixed(2)}, ${est.z.toFixed(2)})<extra></extra>`,
    })

    // error vector (yellow line GT → EST)
    out.push({
      type: 'scatter3d', mode: 'lines',
      x: [tv.x, est.x], y: [tv.y, est.y], z: [tv.z, est.z],
      line: { color: WAVE_COLORS.crosshair, width: 4 },
      name: 'error vector',
      hoverinfo: 'skip',
    })

    return out
  }, [trace.data, bg.data, summary])

  const layout = useMemo(() => {
    const PAD = 2
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
      font: { color: WAVE_COLORS.text, family: 'Inter, sans-serif', size: 11 },
      scene: {
        bgcolor: WAVE_COLORS.bg,
        xaxis: { title: { text: 'x', font: { size: 10 } }, ...axis(xr) },
        yaxis: { title: { text: 'y', font: { size: 10 } }, ...axis(yr) },
        zaxis: { title: { text: 'z', font: { size: 10 } }, ...axis(zr) },
        aspectmode: 'data' as const,
        camera: CAMERA_PRESETS[camera],
      },
      legend: {
        x: 0.01, y: 0.98,
        bgcolor: 'rgba(18,24,33,0.88)', bordercolor: WAVE_COLORS.border, borderwidth: 1,
        font: { size: 10, color: WAVE_COLORS.text },
      },
    }
  }, [bg.data, camera])

  const err = useMemo(() => {
    if (!trace.data || !summary) return null
    const tv = trace.data.true_values
    const dx = summary.mean.x - tv.x
    const dy = summary.mean.y - tv.y
    const dz = summary.mean.z - tv.z
    return {
      dx, dy, dz,
      total: Math.sqrt(dx * dx + dy * dy + dz * dz),
      stdMag: Math.sqrt(summary.std.x ** 2 + summary.std.y ** 2 + summary.std.z ** 2),
    }
  }, [trace.data, summary])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Target size={13} className="text-accent" /> <span className="font-semibold">GT vs 추정 · 3D overlay</span>
        </div>
        <div className="flex items-center gap-2">
          <CameraPresetButtons value={camera} onChange={setCamera} />
          {err && (
            <span className="font-mono text-[10px] text-muted">
              |err| <span className={err.total <= 3 ? 'text-good' : 'text-warn'}>{err.total.toFixed(2)}</span> vox
            </span>
          )}
        </div>
      </header>
      {/* 3D scene fills the pane width; quantitative readout lives in a
          compact strip at the bottom. Earlier sidebar layout (1fr_180px)
          starved the scene of width on narrow workspace cells. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {trace.data ? (
            <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">MCMC 데이터 로딩…</div>
          )}
        </div>
        {err && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-line bg-panel-2/40 px-3 py-2 text-[10.5px]">
            <Row k="GT (true)" v={`(${trace.data!.true_values.x}, ${trace.data!.true_values.y}, ${trace.data!.true_values.z})`} color="text-good" />
            <Row k="추정 (mean)" v={`(${summary!.mean.x.toFixed(1)}, ${summary!.mean.y.toFixed(1)}, ${summary!.mean.z.toFixed(1)})`} color="text-finding" />
            <Row k="Δx · Δy · Δz" v={`${err.dx.toFixed(1)} · ${err.dy.toFixed(1)} · ${err.dz.toFixed(1)}`} />
            <Row k="σ_total" v={err.stdMag.toFixed(2)} />
            <Row k="|err|" v={`${err.total.toFixed(2)} vox`} color={err.total <= 3 ? 'text-good' : 'text-warn'} />
            <div className="col-span-2 mt-0.5 text-[9.5px] leading-tight text-muted">
              95% credible mesh = mean ± 1.96σ · yellow vector = GT → est.
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={`font-mono ${color ?? 'text-text/90'}`} style={color === 'text-finding' ? { color: WAVE_COLORS.findingHi } : undefined}>{v}</span>
    </div>
  )
}
