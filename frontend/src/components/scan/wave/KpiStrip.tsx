import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Target, TrendingUp, Zap } from 'lucide-react'
import { fetchMcmcTrace, fetchScreeningSurface } from '../../../api/wave'
import type { WaveCaseId } from '../../../api/wave'
import type { Detection } from '../../../api/types'

// Approximate voxel pitch for the Vs model. The wave_real backend doesn't
// publish an explicit spacing_mm field, so we use this constant for
// voxel-to-mm display conversions. Adjust here if the physical extent
// becomes available in metadata.
const VOXEL_MM = 0.1

interface Props {
  caseId: WaveCaseId
  detection?: Detection | null
}

// Cheap-but-honest convergence diagnostics from a single MCMC chain.
// Split-R̂: variance ratio of first-half mean vs second-half mean against the
// pooled variance (a coarse single-chain R̂ proxy). ESS proxy: unique-state
// count, which underestimates a continuous-parameter chain but matches the
// discrete-voxel sampling here.
function diagnostics(x: number[], y: number[], z: number[], misfit: number[]) {
  const n = x.length
  if (n < 4) return { rhat: NaN, ess: 0, bestMisfit: NaN }
  const half = Math.floor(n / 2)
  const halves = [
    { x: x.slice(0, half), y: y.slice(0, half), z: z.slice(0, half) },
    { x: x.slice(half),    y: y.slice(half),    z: z.slice(half)    },
  ]
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const variance = (a: number[]) => {
    const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length
  }
  // axis-averaged variance ratio
  let totalRatio = 0
  for (const axis of ['x', 'y', 'z'] as const) {
    const v1 = variance(halves[0][axis])
    const v2 = variance(halves[1][axis])
    const pooled = (v1 + v2) / 2
    if (pooled > 1e-9) {
      const between = (mean(halves[0][axis]) - mean(halves[1][axis])) ** 2 / 4
      totalRatio += Math.sqrt(1 + between / pooled)
    } else {
      totalRatio += 1
    }
  }
  const rhat = totalRatio / 3

  const uniq = new Set<string>()
  for (let i = 0; i < n; i++) uniq.add(`${x[i]},${y[i]},${z[i]}`)
  const ess = uniq.size

  const bestMisfit = misfit.reduce((m, v) => (v < m ? v : m), Infinity)
  return { rhat, ess, bestMisfit }
}

function mode3(x: number[], y: number[], z: number[]) {
  const counts: Record<string, number> = {}
  for (let i = 0; i < x.length; i++) {
    const k = `${x[i]},${y[i]},${z[i]}`
    counts[k] = (counts[k] || 0) + 1
  }
  let best = ''
  let bestC = 0
  for (const [k, c] of Object.entries(counts)) {
    if (c > bestC) { bestC = c; best = k }
  }
  const [mx, my, mz] = best.split(',').map(Number)
  return { x: mx, y: my, z: mz, count: bestC }
}

export default function KpiStrip({ caseId, detection }: Props) {
  const trace = useQuery({ queryKey: ['wave', 'mcmc', caseId], queryFn: () => fetchMcmcTrace(caseId), staleTime: Infinity })
  const screen = useQuery({ queryKey: ['wave', 'screening', caseId], queryFn: () => fetchScreeningSurface(caseId), staleTime: Infinity })

  const kpis = useMemo(() => {
    if (!trace.data) return null
    const m = mode3(trace.data.x, trace.data.y, trace.data.z)
    const tv = trace.data.true_values
    const dx = m.x - tv.x, dy = m.y - tv.y, dz = m.z - tv.z
    const locErr = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const diag = diagnostics(trace.data.x, trace.data.y, trace.data.z, trace.data.misfit)
    return {
      locErr,
      rhat: diag.rhat,
      ess: diag.ess,
      bestMisfit: diag.bestMisfit,
      confidence: detection ? detection.severity_score * 100 : null,
      hotspot: screen.data?.hotspotVoxelCount ?? null,
    }
  }, [trace.data, screen.data, detection])

  if (!kpis) {
    return (
      <div className="grid h-[60px] grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton rounded-md" />)}
      </div>
    )
  }

  const essRatio = kpis.ess / 1000  // total iterations = 1000
  const essTotal = 1000

  return (
    <div className="grid grid-cols-5 gap-2">
      <Kpi
        Icon={Target}
        label="Localization err"
        value={kpis.locErr.toFixed(2)}
        unit="vox"
        tone={kpis.locErr <= 3 ? 'good' : kpis.locErr <= 6 ? 'warn' : 'bad'}
        sub={`|mode − GT| · ≈${(kpis.locErr * VOXEL_MM).toFixed(2)} mm`}
      />
      <Kpi
        Icon={AlertTriangle}
        label="Lesion severity"
        value={kpis.confidence != null ? `${kpis.confidence.toFixed(0)}` : '—'}
        unit="%"
        tone={kpis.confidence != null && kpis.confidence >= 80 ? 'bad' : kpis.confidence != null && kpis.confidence >= 50 ? 'warn' : 'good'}
        sub="0 healthy · 100 probable lesion"
      />
      <Kpi
        Icon={TrendingUp}
        label="MCMC R̂"
        value={isFinite(kpis.rhat) ? kpis.rhat.toFixed(3) : '—'}
        unit=""
        tone={kpis.rhat < 1.05 ? 'good' : kpis.rhat < 1.1 ? 'warn' : 'bad'}
        sub="split-half (≤1.05 OK)"
      />
      <Kpi
        Icon={Zap}
        label="ESS"
        value={kpis.ess.toString()}
        unit={`/ ${essTotal}`}
        tone={kpis.ess >= 200 ? 'good' : kpis.ess >= 100 ? 'warn' : 'bad'}
        sub={`unique states · ${(essRatio * 100).toFixed(0)}%`}
      />
      <Kpi
        Icon={Activity}
        label="Best misfit"
        value={isFinite(kpis.bestMisfit) ? kpis.bestMisfit.toExponential(1) : '—'}
        unit=""
        tone="muted"
        sub={`hotspot ${(kpis.hotspot ?? 0).toLocaleString()} vox`}
      />
    </div>
  )
}

function Kpi({
  Icon, label, value, unit, tone, sub,
}: {
  Icon: typeof Target; label: string; value: string; unit: string
  tone: 'good' | 'warn' | 'bad' | 'muted'; sub: string
}) {
  const toneClass = tone === 'good' ? 'text-good border-good/40 bg-good/5'
    : tone === 'warn' ? 'text-warn border-warn/40 bg-warn/5'
    : tone === 'bad'  ? 'text-bad  border-bad/40  bg-bad/5'
    : 'text-text border-line bg-panel-2/40'
  return (
    <div className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        <Icon size={11} /> {label}
      </div>
      <div className="flex items-baseline gap-1 font-mono">
        <span className="text-lg font-semibold leading-none">{value}</span>
        {unit && <span className="text-[10px] opacity-70">{unit}</span>}
      </div>
      <div className="text-[9.5px] opacity-60">{sub}</div>
    </div>
  )
}
