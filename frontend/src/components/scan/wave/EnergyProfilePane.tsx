import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { EnergyProfile } from '../../../api/wave'

interface Props {
  data: EnergyProfile | undefined
  onRxSelect?: (ids: Set<number> | null) => void
}

export default function EnergyProfilePane({ data, onRxSelect }: Props) {
  const traces = useMemo(() => {
    if (!data?.profile) return []
    return [
      {
        type: 'scatter', mode: 'lines',
        x: data.receiver_indices, y: data.profile,
        line: { color: WAVE_COLORS.warn, width: 2.2 },
        hovertemplate: 'rx %{x}<br>E %{y:.4f}<extra></extra>',
      },
      {
        type: 'scatter', mode: 'markers',
        x: [data.peak_receiver], y: [data.peak_value],
        marker: { color: WAVE_COLORS.warn, size: 9 },
        showlegend: false,
        hovertemplate: 'peak rx %{x}<br>E %{y:.4f}<extra></extra>',
      },
    ] as unknown as Plotly.Data[]
  }, [data])

  const layout = useMemo(() => {
    const base = basePlotlyLayout()
    return {
      ...base,
      dragmode: 'select' as const,
      selectdirection: 'h' as const,
      xaxis: { ...base.xaxis, title: { text: 'receiver', font: { size: 11 } }, dtick: 5 },
      yaxis: { ...base.yaxis, title: { text: 'norm. energy', font: { size: 11 } }, range: [0, 1.05] },
      shapes: data?.peak_receiver != null ? [{
        type: 'line' as const, xref: 'x' as const, yref: 'paper' as const,
        x0: data.peak_receiver, x1: data.peak_receiver, y0: 0, y1: 1,
        line: { color: WAVE_COLORS.warn, width: 1.2, dash: 'dash' as const },
      }] : [],
    }
  }, [data])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Activity size={13} className="text-accent" /> <span className="font-semibold">Energy profile</span>
        </div>
        {data?.peak_receiver != null && (
          <span className="font-mono text-[10px] text-warn">peak rx {data.peak_receiver}</span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {data ? (
          <PlotlyChart
            data={traces} layout={layout} className="h-full w-full"
            onSelected={(e) => {
              if (!onRxSelect || !data?.receiver_indices) return
              const range = (e as { range?: { x?: [number, number] } })?.range
              if (range?.x) {
                const [a, b] = range.x
                const ids = new Set(data.receiver_indices.filter((i) => i >= a && i <= b).map(Math.round))
                if (ids.size > 0) onRxSelect(ids)
              }
            }}
            onDeselect={() => onRxSelect?.(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">로딩 중…</div>
        )}
      </div>
    </section>
  )
}

declare const Plotly: { Data: any }
