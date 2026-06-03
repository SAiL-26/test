import { useMemo } from 'react'
import { Layers3 } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { TISSUE_CLASS_COLORSCALE, TISSUE_LABELS, WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { VelocitySlice } from '../../../api/wave'

interface Props {
  data: VelocitySlice | undefined
  selectedRxIds?: Set<number> | null
}

function velToCode(v: number): number {
  if (v >= 2.0) return 3
  if (v >= 0.5) return 2
  if (v >= 0.04) return 1
  if (v >= 0.015) return 4
  return 0
}

export default function VelocitySlicePane({ data, selectedRxIds }: Props) {
  const { traces, layout } = useMemo(() => {
    if (!data?.receivers || !data?.x?.length) return { traces: [], layout: basePlotlyLayout() }
    const { x: xArr, y: yArr, receivers } = data
    // Long axis = data.y (~415, receiver array span along the dental arch).
    // Short axis = data.x (~59, cross-arch). Put the long axis horizontally
    // so the pane fits a landscape grid cell — the cross-arch dimension is
    // both physically and numerically the smaller of the two.
    const nX = xArr.length
    const nY = yArr.length
    const zCodes = (data.z ?? []).map((row) => row.map(velToCode))
    // transpose z so rows = x_voxel (short), cols = y_voxel (long)
    const zT: number[][] = Array.from({ length: nX }, (_, r) =>
      Array.from({ length: nY }, (_, c) => zCodes[c][r])
    )
    const normalRx = receivers.filter((r) => !selectedRxIds?.has(r.id))
    const hi = selectedRxIds ? receivers.filter((r) => selectedRxIds.has(r.id)) : []
    const out: any[] = [
      {
        type: 'heatmap',
        x: yArr, y: xArr, z: zT,
        colorscale: TISSUE_CLASS_COLORSCALE,
        zmin: 0, zmax: 4, zsmooth: false, showscale: true,
        colorbar: {
          thickness: 9, len: 0.85,
          tickvals: [0, 1, 2, 3, 4], ticktext: TISSUE_LABELS,
          tickfont: { color: WAVE_COLORS.muted, size: 10 },
        },
        hovertemplate: 'y %{x}<br>x %{y}<br>class %{z}<extra></extra>',
      },
      {
        type: 'scatter', mode: 'markers',
        x: normalRx.map((r) => r.y), y: normalRx.map((r) => r.x),
        marker: { color: WAVE_COLORS.warn, size: 6, symbol: 'triangle-down' },
        showlegend: false,
        hovertemplate: 'rx %{text}<extra></extra>',
        text: normalRx.map((r) => `${r.id}`),
      },
    ]
    if (hi.length) {
      out.push({
        type: 'scatter', mode: 'markers',
        x: hi.map((r) => r.y), y: hi.map((r) => r.x),
        marker: { color: WAVE_COLORS.accent, size: 10, symbol: 'triangle-down' },
        showlegend: false,
        hovertemplate: 'rx %{text} (selected)<extra></extra>',
        text: hi.map((r) => `${r.id}`),
      })
    }
    const base = basePlotlyLayout()
    return {
      traces: out,
      layout: {
        ...base,
        xaxis: { ...base.xaxis, title: { text: 'y (grid, long axis)', font: { size: 11 } } },
        yaxis: { ...base.yaxis, title: { text: 'x (grid)', font: { size: 11 } } },
      },
    }
  }, [data, selectedRxIds])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Layers3 size={13} className="text-accent" /> <span className="font-semibold">Velocity slice · z=9</span>
        </div>
        {data?.receivers && (
          <span className="font-mono text-[10px] text-muted">
            {selectedRxIds ? `${selectedRxIds.size} sel` : `${data.receivers.length} rx`}
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {data ? (
          <PlotlyChart data={traces as any} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">로딩 중…</div>
        )}
      </div>
    </section>
  )
}
