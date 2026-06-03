import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { SEISMIC_COLORSCALE, WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { SeismogramGather } from '../../../api/wave'

interface Props {
  data: SeismogramGather | undefined
  lineTimeUs?: number
}

export default function SeismogramGatherPane({ data, lineTimeUs }: Props) {
  const traces = useMemo(() => {
    if (!data?.z) return []
    return [{
      type: 'heatmap',
      x: data.receivers,
      y: data.time_us,
      z: data.z,
      colorscale: SEISMIC_COLORSCALE,
      zmin: -1, zmax: 1,
      zsmooth: 'fast',
      showscale: true,
      colorbar: { thickness: 8, len: 0.85, tickfont: { color: WAVE_COLORS.muted, size: 10 } },
      hovertemplate: 'rx %{x}<br>t %{y:.2f} μs<br>amp %{z:.3f}<extra></extra>',
    } as unknown as Plotly.Data]
  }, [data])

  const layout = useMemo(() => {
    const base = basePlotlyLayout()
    return {
      ...base,
      xaxis: { ...base.xaxis, title: { text: 'receiver', font: { size: 11 } } },
      yaxis: { ...base.yaxis, title: { text: 'time (μs)', font: { size: 11 } }, autorange: 'reversed' as const },
      shapes: lineTimeUs != null ? [{
        type: 'line' as const, x0: 0, x1: 1, xref: 'paper' as const,
        y0: lineTimeUs, y1: lineTimeUs, yref: 'y' as const,
        line: { color: WAVE_COLORS.crosshair, width: 2 },
      }] : [],
    }
  }, [lineTimeUs])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Activity size={13} className="text-accent" /> <span className="font-semibold">Seismogram gather</span>
        </div>
        {data?.sampledShape && (
          <span className="font-mono text-[10px] text-muted">
            {data.sampledShape.rows}×{data.sampledShape.cols}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Plotly: { Data: any }
