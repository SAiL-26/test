import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Pause, Play, Waves } from 'lucide-react'
import PlotlyChart from './PlotlyChart'
import { SEISMIC_COLORSCALE, WAVE_COLORS } from '../../../lib/wavePalette'
import type { SnapshotGrid, WaveCaseId } from '../../../api/wave'
import { fetchSnapshotGrid, fetchTissueFullMesh } from '../../../api/wave'
import CameraPresetButtons, { CAMERA_PRESETS, type CameraKey } from './CameraPresets'

interface Props {
  caseId: WaveCaseId
  times: string[]
  autoplay?: boolean
  compact?: boolean
  /** If provided, this overrides the pane's internal time index — used by the
   *  WaveWorkspace global scrubber to keep snapshot + seismogram in sync. */
  controlledIdx?: number
}

const FRAME_MS = 600

export default function SnapshotGridPane({ caseId, times, autoplay = false, compact = false, controlledIdx }: Props) {
  const [internalIdx, setIdx] = useState(0)
  const idx = controlledIdx ?? internalIdx
  const isControlled = controlledIdx != null
  const [playing, setPlaying] = useState(autoplay)
  // Tissue meshes (tooth+bone+gingiva) are 1.46 MB / ~1.3 s to fetch and
  // add three heavy mesh3d traces (~10k triangles each) to the Plotly
  // scene. Default OFF so the snapshot pane paints the wavefield surface
  // immediately on console entry; the eye-icon toggle in the header still
  // lets the user opt in. This was the single largest piece of non-Plotly
  // network blocking on /scans/:id.
  const [showTissue, setShowTissue] = useState(false)
  const [camera, setCamera] = useState<CameraKey>('default')
  const [grid, setGrid] = useState<SnapshotGrid | undefined>()
  const cache = useRef(new Map<string, SnapshotGrid>())

  // Tooth/bone/gingiva surface meshes from the full Vs volume, shared cache
  // across all snapshot frames — the geometry doesn't change with time.
  const tissue = useQuery({
    queryKey: ['wave', 'tissue-full', 8],
    queryFn: () => fetchTissueFullMesh(8),
    staleTime: Infinity,
    enabled: showTissue,
  })

  useEffect(() => {
    cache.current.clear()
    setIdx(0)
  }, [caseId])

  useEffect(() => {
    if (idx >= times.length) return
    const t = times[idx]
    const key = `${caseId}:${t}`
    const cached = cache.current.get(key)
    if (cached) { setGrid(cached); return }
    let canceled = false
    fetchSnapshotGrid(t, caseId).then((g) => {
      if (canceled) return
      cache.current.set(key, g)
      setGrid(g)
    }).catch(() => {})
    return () => { canceled = true }
  }, [idx, caseId, times])

  useEffect(() => {
    if (!playing || times.length === 0) return
    const id = setInterval(() => {
      setIdx((p) => (p + 1) % times.length)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [playing, times.length])

  // Build the 3D scene. Wavefield surface = a thin amplitude ridge placed at
  // z=Z_PLANE (the slice the simulation was taken at) so it overlays in-place
  // with the tooth/bone/gingiva tissue meshes from the full Vs volume.
  // Tissue meshes use Vs grid voxel coords (x∈[0,308), y∈[0,415), z∈[0,17)).
  // Surface trace x/y use the snapshot's grid coords (sub-sampled but same
  // voxel frame).
  const traces = useMemo(() => {
    if (!grid?.z) return []
    const rows = grid.z.length
    const cols = grid.z[0]?.length ?? 0
    if (rows === 0 || cols === 0) return []
    // Transpose so the long model axis (ny=415) ends up on Plotly's x, which
    // gives a landscape-feeling 3D scene under the default camera.
    const zT: number[][] = Array.from({ length: cols }, (_, c) =>
      Array.from({ length: rows }, (_, r) => grid.z[r][c])
    )
    const Z_PLANE = 9   // z-slice of the simulation (matches velocity_slice_z9)
    const AMP_SCALE = 3  // how far above/below Z_PLANE the ridges rise
    const surfaceZ = zT.map((row) => row.map((v) => Z_PLANE + v * AMP_SCALE))

    const out: any[] = []
    if (showTissue && tissue.data?.tissues) {
      // Swap the mesh's x/y so it sits in the same transposed frame as the
      // wavefield surface (Plotly x = model y, Plotly y = model x). Without
      // this swap, the tissue mesh appears 90° rotated relative to the wave
      // ridges and receivers don't align with the dental arch.
      for (const [name, t] of Object.entries(tissue.data.tissues)) {
        if (!t.i?.length) continue
        out.push({
          type: 'mesh3d',
          x: t.y, y: t.x, z: t.z, i: t.i, j: t.j, k: t.k,
          color: t.color,
          opacity: name === 'tooth' ? 0.45 : name === 'bone' ? 0.22 : 0.12,
          flatshading: true,
          hoverinfo: 'skip',
          name,
          showlegend: false,
          lighting: { ambient: 0.85, diffuse: 0.5, specular: 0.08, roughness: 0.9 },
          lightposition: { x: 100, y: 100, z: 80 },
        })
      }
    }
    out.push({
      type: 'surface',
      x: grid.y, y: grid.x, z: surfaceZ,
      surfacecolor: zT,   // color by amplitude, not by elevation
      colorscale: SEISMIC_COLORSCALE,
      cmin: -1, cmax: 1,
      showscale: true,
      colorbar: { thickness: 8, len: 0.7, tickfont: { color: WAVE_COLORS.muted, size: 9 } },
      contours: {
        z: { show: true, usecolormap: true, project: { z: true }, width: 1 },
      },
      lighting: { ambient: 0.6, diffuse: 0.7, specular: 0.15, roughness: 0.7, fresnel: 0.2 },
      lightposition: { x: 100, y: 100, z: 80 },
      hovertemplate: 'y %{x}<br>x %{y}<br>amp %{surfacecolor:.3f}<extra></extra>',
      name: 'wavefield',
      showlegend: false,
    })
    return out
  }, [grid, showTissue, tissue.data])

  const layout = useMemo(() => {
    return {
      autosize: true,
      paper_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      font: { color: WAVE_COLORS.text, family: 'Inter, sans-serif', size: 10 },
      scene: {
        bgcolor: WAVE_COLORS.bg,
        xaxis: { title: { text: 'y (long)', font: { size: 10 } }, color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border, backgroundcolor: WAVE_COLORS.surface, showbackground: true },
        yaxis: { title: { text: 'x', font: { size: 10 } }, color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border, backgroundcolor: WAVE_COLORS.surface, showbackground: true },
        zaxis: { title: { text: 'z', font: { size: 10 } }, color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border, backgroundcolor: WAVE_COLORS.surface, showbackground: true },
        camera: CAMERA_PRESETS[camera],
        aspectmode: 'manual' as const,
        aspectratio: { x: 1.8, y: 1, z: 0.6 },
      },
      showlegend: false,
    }
  }, [camera])

  const currentTime = times[idx]

  return (
    <section className={`flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/30 ${compact ? '' : ''}`}>
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Waves size={13} className="text-accent" /> <span className="font-semibold">Wavefield · 3D + tissue overlay</span>
        </div>
        <div className="flex items-center gap-2">
          <CameraPresetButtons value={camera} onChange={setCamera} />
          <button
            onClick={() => setShowTissue((v) => !v)}
            title="치아·골·치은 mesh 오버레이 토글"
            className={[
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition',
              showTissue ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel-2 text-muted hover:border-accent/40',
            ].join(' ')}
          >
            {showTissue ? <Eye size={10} /> : <EyeOff size={10} />} tissue
          </button>
          <span className="font-mono text-[10px] text-muted">t={currentTime ?? '—'} · case {caseId}</span>
        </div>
      </header>
      <div className={`flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs ${compact || isControlled ? 'hidden' : ''}`}>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 hover:border-accent"
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range" min={0} max={Math.max(0, times.length - 1)} value={idx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
          className="flex-1 accent-accent"
        />
        <span className="w-12 text-right font-mono text-[10px] text-muted">{idx + 1}/{times.length}</span>
      </div>
      <div className="min-h-0 flex-1">
        {grid ? (
          <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">파동장 로딩 중…</div>
        )}
      </div>
    </section>
  )
}
