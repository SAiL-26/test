import { useMemo, useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { VelocitySlice } from '../../../api/wave'

interface Props {
  data: VelocitySlice | undefined
}

function velToCode(v: number): number {
  if (v >= 2.0) return 3
  if (v >= 0.5) return 2
  if (v >= 0.04) return 1
  if (v >= 0.015) return 4
  return 0
}

// "GT" (healthy) view — inflammation class folded into the gingiva color so
// the left side reads as the pre-lesion tissue map.
const HEALTHY_COLORSCALE: Array<[number, string]> = [
  [0.00, '#1A2230'],
  [0.20, '#1A2230'],
  [0.22, '#FFB3D1'],
  [0.42, '#FFB3D1'],
  [0.44, '#F2B441'],
  [0.62, '#F2B441'],
  [0.64, '#F5EFE2'],
  [0.82, '#F5EFE2'],
  [0.84, '#FFB3D1'],   // inflammation rendered as gingiva on GT side
  [1.00, '#FFB3D1'],
]

// "Posterior" / with-lesion view — full palette including inflammation hot pink.
const POSTERIOR_COLORSCALE: Array<[number, string]> = [
  [0.00, '#1A2230'],
  [0.20, '#1A2230'],
  [0.22, '#FFB3D1'],
  [0.42, '#FFB3D1'],
  [0.44, '#F2B441'],
  [0.62, '#F2B441'],
  [0.64, '#F5EFE2'],
  [0.82, '#F5EFE2'],
  [0.84, '#FF3E8A'],   // inflammation visible
  [1.00, '#FF3E8A'],
]

export default function AbWipePane({ data }: Props) {
  const [wipe, setWipe] = useState(50)  // 0-100, percentage from left

  // Same transpose treatment as ScreeningSurfacePane — the velocity slice is
  // tall in its native frame; we rotate to a landscape strip so the wipe
  // divider has horizontal travel that reads naturally as "left vs right".
  const tissueGrid = useMemo(() => {
    if (!data?.z) return null
    const rows = data.z.length
    const cols = data.z[0]?.length ?? 0
    return Array.from({ length: cols }, (_, c) =>
      Array.from({ length: rows }, (_, r) => velToCode(data.z[r][c]))
    )
  }, [data])

  const { healthyTrace, posteriorTrace } = useMemo(() => {
    if (!data?.x?.length || !tissueGrid) return { healthyTrace: [], posteriorTrace: [] }
    const base = {
      type: 'heatmap', x: data.y, y: data.x, z: tissueGrid,
      zmin: 0, zmax: 4, zsmooth: false, showscale: false,
    } as any
    return {
      healthyTrace: [{ ...base, colorscale: HEALTHY_COLORSCALE, hovertemplate: 'GT · class %{z}<extra></extra>' }],
      posteriorTrace: [{ ...base, colorscale: POSTERIOR_COLORSCALE, hovertemplate: 'posterior · class %{z}<extra></extra>' }],
    }
  }, [data, tissueGrid])

  const layout = useMemo(() => {
    const base = basePlotlyLayout()
    return {
      ...base,
      margin: { l: 40, r: 8, t: 8, b: 32 },
      xaxis: { ...base.xaxis, showticklabels: false, title: undefined },
      yaxis: { ...base.yaxis, showticklabels: false, title: undefined },
    }
  }, [])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <GitCompareArrows size={13} className="text-accent" />
          <span className="font-semibold">A/B wipe · GT ↔ posterior</span>
        </div>
        <span className="font-mono text-[10px] text-muted">wipe {wipe.toFixed(0)}%</span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* base layer = healthy / GT */}
        <div className="absolute inset-0">
          {healthyTrace.length > 0 ? (
            <PlotlyChart data={healthyTrace} layout={layout} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">로딩 중…</div>
          )}
        </div>
        {/* posterior layer clipped from the right — wipe slider exposes more of it */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${wipe}%)` }}
        >
          {posteriorTrace.length > 0 && (
            <PlotlyChart data={posteriorTrace} layout={layout} className="h-full w-full" />
          )}
        </div>
        {/* divider line */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent shadow-[0_0_8px_var(--color-accent)]"
          style={{ left: `${wipe}%` }}
        />
        {/* side labels */}
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-bg/70 px-2 py-0.5 font-mono text-[10px] text-good">
          ← GT
        </div>
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-bg/70 px-2 py-0.5 font-mono text-[10px] text-finding" style={{ color: WAVE_COLORS.findingHi }}>
          posterior →
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-panel-2/40 px-3 py-2 text-[11px]">
        <span className="text-muted">wipe</span>
        <input
          type="range" min={0} max={100} step={1}
          value={wipe}
          onChange={(e) => setWipe(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <button
          onClick={() => setWipe(0)}
          className="rounded border border-line bg-panel-2 px-2 py-0.5 text-[10px] hover:border-good"
        >GT only</button>
        <button
          onClick={() => setWipe(100)}
          className="rounded border border-line bg-panel-2 px-2 py-0.5 text-[10px] hover:border-accent"
        >Posterior</button>
      </div>
    </section>
  )
}
