import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchEnergyProfile, fetchMcmcBackground, fetchMcmcTrace,
  fetchScreeningSurface, fetchSeismogramGather, fetchVelocitySlice, fetchWaveMetadata,
} from '../../../api/wave'
import type { WaveCaseId } from '../../../api/wave'
import type { ScenarioTag } from '../../../api/types'
import PolarSeismogram from './PolarSeismogram'
import EnergyProfilePane from './EnergyProfilePane'
import ScreeningSurfacePane from './ScreeningSurfacePane'
import InversionPane from './InversionPane'
import SnapshotGridPane from './SnapshotGridPane'
import PaneBoundary from './PaneBoundary'
import TrueVsEstimatePane from './TrueVsEstimatePane'
import KpiStrip from './KpiStrip'
import GlobalScrubber from './GlobalScrubber'
import AbWipePane from './AbWipePane'
import type { Detection } from '../../../api/types'

const SCENARIO_TO_CASE: Record<ScenarioTag, WaveCaseId> = {
  healthy: 1,
  inf70: 2,
  inf80: 3,
}

const CASE_LABEL: Record<WaveCaseId, { ko: string; en: string; severity: 'good' | 'warn' | 'bad' | 'muted' }> = {
  1: { ko: 'baseline (염증 80, full)', en: 'baseline', severity: 'bad' },
  2: { ko: 'position shift (염증 70)', en: 'position', severity: 'warn' },
  3: { ko: 'size change (small r9)',  en: 'size',     severity: 'warn' },
  4: { ko: 'custom (사용자 슬라이더)', en: 'custom',   severity: 'muted' },
}

interface Props {
  scenarioTag: ScenarioTag
  estimateMm?: { x: number; y: number; z: number }
  detection?: Detection | null
}

export default function WaveWorkspace({ scenarioTag, detection }: Props) {
  const [caseId, setCaseId] = useState<WaveCaseId>(SCENARIO_TO_CASE[scenarioTag] ?? 1)
  const [, setSelectedRx] = useState<Set<number> | null>(null)
  // Global time scrubber — synced across snapshot + seismogram playhead.
  const [timeIdx, setTimeIdx] = useState(0)
  const [scrubPlaying, setScrubPlaying] = useState(false)
  const [scrubSpeed, setScrubSpeed] = useState(1)

  // Wave bundles are deterministic per-case — once fetched, never restale them.
  // This cuts ~6 redundant network round-trips per console re-mount.
  const meta = useQuery({ queryKey: ['wave', 'metadata'], queryFn: fetchWaveMetadata, staleTime: Infinity })
  const seismo = useQuery({ queryKey: ['wave', 'seismogram', caseId], queryFn: () => fetchSeismogramGather(caseId), staleTime: Infinity })
  const energy = useQuery({ queryKey: ['wave', 'energy', caseId], queryFn: () => fetchEnergyProfile(caseId), staleTime: Infinity })
  const velocity = useQuery({ queryKey: ['wave', 'velocity', caseId], queryFn: () => fetchVelocitySlice(caseId), staleTime: Infinity })
  const screen = useQuery({ queryKey: ['wave', 'screening', caseId], queryFn: () => fetchScreeningSurface(caseId), staleTime: Infinity })
  const mcmcTrace = useQuery({ queryKey: ['wave', 'mcmc', caseId], queryFn: () => fetchMcmcTrace(caseId), staleTime: Infinity })
  const mcmcBg = useQuery({ queryKey: ['wave', 'mcmc-bg'], queryFn: fetchMcmcBackground, staleTime: Infinity })

  const times = meta.data?.snapshotTimes ?? []
  const availableCases = meta.data?.cases ?? {}
  // Convert the current snapshot index to seismogram time (µs) for the
  // seismogram playhead line. dt = 4 ns per sample.
  const currentTimeUs = times[timeIdx] ? Number(times[timeIdx]) * 4e-9 * 1e6 : undefined


  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <header className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
        <span className="text-muted">시나리오 / 케이스</span>
        {([1, 2, 3, 4] as WaveCaseId[]).map((cid) => {
          const info = CASE_LABEL[cid]
          const isActive = caseId === cid
          const isAvail = availableCases[cid]?.available ?? false
          // Hide unavailable cases entirely — keeping a disabled "#4 custom"
          // button just communicates "unfinished" to a first-time reviewer.
          if (!isAvail) return null
          return (
            <button
              key={cid}
              type="button"
              onClick={() => setCaseId(cid)}
              title={info.ko}
              className={[
                'rounded border px-2 py-1 transition',
                isActive ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel hover:border-accent/50',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] text-muted">#{cid}</span>{' '}
              <span>{info.en}</span>
            </button>
          )
        })}
        <div className="ml-auto text-[10px] text-muted">
          {CASE_LABEL[caseId].ko}
        </div>
      </header>

      {/* KPI metrics — high-credibility numeric strip */}
      <KpiStrip caseId={caseId} detection={detection} />

      {/* Global time scrubber — drives snapshot + seismogram playhead together */}
      <GlobalScrubber
        times={times} idx={timeIdx} setIdx={setTimeIdx}
        playing={scrubPlaying} setPlaying={setScrubPlaying}
        speed={scrubSpeed} setSpeed={setScrubSpeed}
      />

      {/* 3-row grid: top row 3 panes, mid row 3 panes, bottom row MCMC.
          Panes mount in waves so the browser can finish painting the top
          row (and the surrounding chrome) before Plotly initializes 4+
          more charts in parallel — without staggering, mounting 7 Plotly
          instances in one synchronous tick froze the main thread for
          1-2 s on the first scan-console visit. */}
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="Snapshot"><SnapshotGridPane caseId={caseId} times={times} controlledIdx={timeIdx} /></PaneBoundary>
        </div>
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="Patient signature"><PolarSeismogram data={seismo.data} lineTimeUs={currentTimeUs} /></PaneBoundary>
        </div>
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="GT vs Estimate"><TrueVsEstimatePane caseId={caseId} /></PaneBoundary>
        </div>
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="Energy profile">
            <DeferredMount delayMs={250}>
              <EnergyProfilePane data={energy.data} onRxSelect={setSelectedRx} />
            </DeferredMount>
          </PaneBoundary>
        </div>
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="A/B wipe">
            <DeferredMount delayMs={350}>
              <AbWipePane data={velocity.data} />
            </DeferredMount>
          </PaneBoundary>
        </div>
        <div className="col-span-4 min-h-0">
          <PaneBoundary name="Screening surface">
            <DeferredMount delayMs={450}>
              <ScreeningSurfacePane data={screen.data} />
            </DeferredMount>
          </PaneBoundary>
        </div>
        <div className="col-span-12 min-h-0">
          <PaneBoundary name="MCMC inversion">
            <DeferredMount delayMs={700}>
              <InversionPane trace={mcmcTrace.data} background={mcmcBg.data} />
            </DeferredMount>
          </PaneBoundary>
        </div>
      </div>
    </div>
  )
}

/** Delay a child's mount so the main thread can paint the surrounding
 *  chrome before kicking off another heavy initialization (typically a
 *  Plotly chart). Renders a lightweight skeleton in the interim. */
function DeferredMount({ delayMs, children }: { delayMs: number; children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), delayMs)
    return () => window.clearTimeout(t)
  }, [delayMs])
  if (!ready) return <div className="skeleton h-full w-full rounded-md" />
  return <>{children}</>
}
