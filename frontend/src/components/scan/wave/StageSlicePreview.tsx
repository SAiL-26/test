import { useMemo } from 'react'
import { Crosshair, Layers, Stethoscope } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { WAVE_COLORS, basePlotlyLayout } from '../../../lib/wavePalette'
import type { VelocitySlice } from '../../../api/wave'

export type StageMode = 'cbct' | 'segment' | 'lesion'

interface Props {
  mode: StageMode
  data: VelocitySlice | undefined
  progress: number  // 0..1 — drives the per-stage reveal animation
}

function velToCode(v: number): number {
  if (v >= 2.0) return 3   // tooth
  if (v >= 0.5) return 2   // bone
  if (v >= 0.04) return 1  // gingiva
  if (v >= 0.015) return 4 // inflammation
  return 0                 // background
}

// CBCT-like grayscale ramp (tissue density → brightness, monochrome like a
// reformatted CBCT cross-section).
const CBCT_COLORSCALE: Array<[number, string]> = [
  [0,    '#0B0F14'],
  [0.18, '#1E2734'],
  [0.45, '#4A5666'],
  [0.78, '#A1ADBD'],
  [1,    '#F1F4F8'],
]

// Discrete tissue-class palette used by the segmentation step. We swap out
// individual classes (replace with background-color stop) when the segment
// reveal progress hasn't gotten to them yet.
function makeSegmentColorscale(reveal: number): Array<[number, string]> {
  const C_BG       = '#1A2230'
  const C_GINGIVA  = '#FFB3D1'
  const C_BONE     = '#F2B441'
  const C_TOOTH    = '#F5EFE2'
  const C_INFLAM   = '#FF3E8A'
  // reveal stages: 0 → only bg, 0.33 → +gingiva, 0.66 → +bone, 1.0 → +tooth
  const gingiva = reveal >= 0.05 ? C_GINGIVA : C_BG
  const bone    = reveal >= 0.40 ? C_BONE    : C_BG
  const tooth   = reveal >= 0.70 ? C_TOOTH   : C_BG
  const inflam  = C_INFLAM  // not used during segment step (lesion class shown in stage 3)
  return [
    [0.00, C_BG],
    [0.20, C_BG],
    [0.22, gingiva],
    [0.42, gingiva],
    [0.44, bone],
    [0.62, bone],
    [0.64, tooth],
    [0.82, tooth],
    [0.84, inflam],
    [1.00, inflam],
  ]
}

const LESION_COLORSCALE = makeSegmentColorscale(1)

export default function StageSlicePreview({ mode, data, progress }: Props) {
  // Transpose so the long voxel axis (data.y, ~415) sits horizontally and the
  // short axis (data.x, ~59) sits vertically — matches the Story mode and
  // PipelineRunModal landscape cells. The raw backend payload is z[rows=y][cols=x].
  const tissueGridT = useMemo(() => {
    if (!data?.z) return null
    const nY = data.z.length
    const nX = data.z[0]?.length ?? 0
    return Array.from({ length: nX }, (_, r) =>
      Array.from({ length: nY }, (_, c) => velToCode(data.z[c][r]))
    )
  }, [data])

  const rawZT = useMemo(() => {
    if (!data?.z) return null
    const nY = data.z.length
    const nX = data.z[0]?.length ?? 0
    return Array.from({ length: nX }, (_, r) =>
      Array.from({ length: nY }, (_, c) => data.z[c][r])
    )
  }, [data])

  const traces = useMemo<any[]>(() => {
    if (!data?.x?.length || !data?.y?.length || !tissueGridT || !rawZT) return []
    const xArr = data.x, yArr = data.y

    if (mode === 'cbct') {
      return [{
        type: 'heatmap',
        x: yArr, y: xArr, z: rawZT,
        colorscale: CBCT_COLORSCALE,
        zmin: 0, zmax: Math.max(0.01, data.vmax),
        zsmooth: 'best',
        showscale: false,
        hovertemplate: 'y %{x}<br>x %{y}<br>density %{z:.3f}<extra></extra>',
      }]
    }

    if (mode === 'segment') {
      const colorscale = makeSegmentColorscale(progress)
      return [{
        type: 'heatmap',
        x: yArr, y: xArr, z: tissueGridT,
        colorscale,
        zmin: 0, zmax: 4,
        zsmooth: false,
        showscale: false,
        hovertemplate: 'class %{z}<extra></extra>',
      }]
    }

    return [{
      type: 'heatmap',
      x: yArr, y: xArr, z: tissueGridT,
      colorscale: LESION_COLORSCALE,
      zmin: 0, zmax: 4,
      zsmooth: false,
      showscale: false,
      hovertemplate: 'class %{z}<extra></extra>',
    }]
  }, [mode, data, tissueGridT, rawZT, progress])

  const layout = useMemo(() => {
    const base = basePlotlyLayout()
    const xArr = data?.x ?? []
    const yArr = data?.y ?? []

    const shapes: any[] = []
    const annotations: any[] = []

    // After the transpose, Plotly x-axis = model y-coord (long), Plotly
    // y-axis = model x-coord (short). Compute centers in the new frame so the
    // CBCT crosshair and lesion marker land in the middle of the visible
    // landscape cell rather than off-screen.
    if (xArr.length > 0 && yArr.length > 0) {
      const plotCx = yArr[Math.floor(yArr.length / 2)]  // model y (long) — Plotly x
      const plotCy = xArr[Math.floor(xArr.length / 2)]  // model x (short) — Plotly y

      if (mode === 'cbct') {
        // Crosshair radius sized to the SHORTER axis so it visually sweeps
        // the cell properly in landscape orientation.
        const radius = xArr.length * 0.5 * progress
        shapes.push({
          type: 'circle', xref: 'x', yref: 'y',
          x0: plotCx - radius, x1: plotCx + radius, y0: plotCy - radius, y1: plotCy + radius,
          line: { color: WAVE_COLORS.crosshair, width: 1.2, dash: 'dot' as const },
          opacity: 0.6,
        })
        shapes.push({
          type: 'line', xref: 'x', yref: 'y',
          x0: plotCx - radius, x1: plotCx + radius, y0: plotCy, y1: plotCy,
          line: { color: WAVE_COLORS.crosshair, width: 1, dash: 'dot' as const },
        })
        shapes.push({
          type: 'line', xref: 'x', yref: 'y',
          x0: plotCx, x1: plotCx, y0: plotCy - radius, y1: plotCy + radius,
          line: { color: WAVE_COLORS.crosshair, width: 1, dash: 'dot' as const },
        })
      }

      if (mode === 'lesion') {
        const pulse = 1 + 0.25 * Math.sin(progress * Math.PI * 4)
        const radius = 6 * pulse
        shapes.push({
          type: 'circle', xref: 'x', yref: 'y',
          x0: plotCx - radius, x1: plotCx + radius, y0: plotCy - radius, y1: plotCy + radius,
          line: { color: WAVE_COLORS.findingHi, width: 2 },
          fillcolor: WAVE_COLORS.findingHi,
          opacity: 0.35,
        })
        shapes.push({
          type: 'circle', xref: 'x', yref: 'y',
          x0: plotCx - radius * 1.8, x1: plotCx + radius * 1.8,
          y0: plotCy - radius * 1.8, y1: plotCy + radius * 1.8,
          line: { color: WAVE_COLORS.findingHi, width: 1, dash: 'dot' as const },
          opacity: 0.4 + 0.6 * (1 - progress),
        })
        annotations.push({
          xref: 'x', yref: 'y',
          x: plotCx + radius * 1.8, y: plotCy - radius * 1.8,
          text: 'Δ Vs · r=7',
          showarrow: false,
          font: { color: WAVE_COLORS.findingHi, size: 10, family: 'JetBrains Mono, monospace' },
          bgcolor: 'rgba(11,15,20,0.7)',
          borderpad: 3,
        })
      }
    }

    return {
      ...base,
      margin: { l: 50, r: 16, t: 8, b: 40 },
      xaxis: { ...base.xaxis, title: { text: 'y (long)', font: { size: 10 } } },
      yaxis: { ...base.yaxis, title: { text: 'x', font: { size: 10 } } },
      shapes,
      annotations,
    }
  }, [mode, data, progress])

  const meta = META[mode]

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <meta.Icon size={13} className="text-accent" />
          <span className="font-semibold">{meta.title}</span>
        </div>
        <span className="font-mono text-[10px] text-muted">{meta.badge(progress)}</span>
      </header>
      <div className="min-h-0 flex-1">
        {data ? (
          <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">로딩…</div>
        )}
      </div>
      {meta.subtitle && (
        <div className="border-t border-line bg-panel-2/40 px-3 py-1.5 text-[10.5px] text-muted">
          {meta.subtitle}
        </div>
      )}
    </section>
  )
}

const META: Record<StageMode, { Icon: typeof Crosshair; title: string; subtitle: string; badge: (p: number) => string }> = {
  cbct: {
    Icon: Crosshair,
    title: 'CBCT volume · STL surface alignment',
    subtitle: 'CBCT 밀도 ramp + STL surface 정합 sweep (grayscale 단면)',
    badge: (p) => `align ${(p * 100).toFixed(0)}%`,
  },
  segment: {
    Icon: Layers,
    title: 'DentalSegmentator · 4-class label map',
    subtitle: 'nnU-Net v2.2 — background → gingiva → bone → tooth 순으로 라벨 노출',
    badge: (p) => {
      const stages = ['bg', '+gingiva', '+bone', '+tooth']
      const idx = p < 0.05 ? 0 : p < 0.4 ? 1 : p < 0.7 ? 2 : 3
      return stages[idx]
    },
  },
  lesion: {
    Icon: Stethoscope,
    title: 'Lesion insertion · Vs override',
    subtitle: '치은 voxel을 염증값(Vs ≈ 0.025)으로 치환, 가정 병변 중심에 마커',
    badge: (p) => `Δ Vs applied · pulse ${(p * 100).toFixed(0)}%`,
  },
}
