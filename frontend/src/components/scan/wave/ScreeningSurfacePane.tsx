import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { ENERGY_COLORSCALE, WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { ScreeningSurface } from '../../../api/wave'

interface Props {
  data: ScreeningSurface | undefined
}

export default function ScreeningSurfacePane({ data }: Props) {
  // Transpose so the long model axis (ny = 415) lies horizontally — the
  // backend returns z[rows=y][cols=x] with y as the longer dimension; rendering
  // it as-is produces a tall portrait pane that doesn't fit the workspace
  // grid cell. Swapping x↔y gives a landscape strip that matches the
  // visualization slot.
  const traces = useMemo(() => {
    if (!data?.z) return []
    const rows = data.z.length
    const cols = data.z[0]?.length ?? 0
    const zT: number[][] = Array.from({ length: cols }, (_, c) =>
      Array.from({ length: rows }, (_, r) => data.z[r][c])
    )
    return [{
      type: 'heatmap',
      x: data.y, y: data.x, z: zT,
      colorscale: ENERGY_COLORSCALE,
      zmin: 0, zmax: 1, zsmooth: 'best',
      showscale: true,
      colorbar: { thickness: 8, len: 0.85, tickfont: { color: WAVE_COLORS.muted, size: 10 } },
      hovertemplate: 'y %{x}<br>x %{y}<br>E %{z:.3f}<extra></extra>',
    } as any]
  }, [data])

  const layout = useMemo(() => {
    const base = basePlotlyLayout()
    return {
      ...base,
      xaxis: { ...base.xaxis, title: { text: 'y (grid, long axis)', font: { size: 11 } } },
      yaxis: { ...base.yaxis, title: { text: 'x (grid)', font: { size: 11 } } },
    }
  }, [])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Flame size={13} className="text-warn" /> <span className="font-semibold">Screening surface</span>
        </div>
        {data && (
          <span className="font-mono text-[10px] text-warn">
            hotspot {data.hotspotVoxelCount.toLocaleString()}
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {data ? (
          <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">로딩 중…</div>
        )}
      </div>
    </section>
  )
}
