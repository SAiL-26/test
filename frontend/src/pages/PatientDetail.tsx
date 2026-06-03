import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, GitCompareArrows } from 'lucide-react'
import { fetchPatient, fetchScan, fetchScans } from '../api/endpoints'
import {
  fetchEnergyProfile, fetchMcmcBackground, fetchMcmcTrace,
  fetchScreeningSurface, fetchSeismogramGather, fetchVelocitySlice,
  fetchWaveMetadata,
} from '../api/wave'
import type { WaveCaseId } from '../api/wave'
import type { Scan, ScenarioTag } from '../api/types'

const SCENARIO_TO_CASE: Record<ScenarioTag, WaveCaseId> = { healthy: 1, inf70: 2, inf80: 3 }

function scenarioMeta(s: ScenarioTag) {
  switch (s) {
    case 'healthy': return { label: '정상',     pill: 'pill-good', dot: 'bg-good' }
    case 'inf70':   return { label: '염증 70%', pill: 'pill-warn', dot: 'bg-warn' }
    case 'inf80':   return { label: '염증 80%', pill: 'pill-bad',  dot: 'bg-bad' }
  }
}

function ScanRow({ scan }: { scan: Scan }) {
  const m = scenarioMeta(scan.scenario_tag)
  const qc = useQueryClient()

  // On hover/focus, warm the scan detail + every wave bundle the console will
  // request. Wave responses are now cache-controlled `immutable` on the
  // backend, so a successful prefetch makes the console render with cached
  // data on click — no waiting on MBs of JSON.
  function prefetch() {
    const caseId = SCENARIO_TO_CASE[scan.scenario_tag] ?? 1
    qc.prefetchQuery({ queryKey: ['scan', scan.id], queryFn: () => fetchScan(scan.id), staleTime: 60_000 })
    qc.prefetchQuery({ queryKey: ['wave', 'metadata'], queryFn: fetchWaveMetadata, staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'seismogram', caseId], queryFn: () => fetchSeismogramGather(caseId), staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'energy', caseId], queryFn: () => fetchEnergyProfile(caseId), staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'velocity', caseId], queryFn: () => fetchVelocitySlice(caseId), staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'screening', caseId], queryFn: () => fetchScreeningSurface(caseId), staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'mcmc', caseId], queryFn: () => fetchMcmcTrace(caseId), staleTime: Infinity })
    qc.prefetchQuery({ queryKey: ['wave', 'mcmc-bg'], queryFn: fetchMcmcBackground, staleTime: Infinity })
  }

  return (
    <Link
      to={`/scans/${scan.id}`}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="group flex items-center justify-between border-b border-line-soft px-4 py-2.5 transition hover:bg-panel-2"
    >
      <div className="flex items-center gap-3">
        <span className={`status-dot ${m.dot}`} />
        <div className="leading-tight">
          <div className="text-[12.5px] font-medium text-text">{scan.scan_date}</div>
          <div className="text-[10px] text-muted font-mono">scan/{scan.id}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`pill ${m.pill}`}>{m.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">{scan.status}</span>
        <ChevronRight className="h-3.5 w-3.5 text-faint opacity-0 group-hover:opacity-100 transition" />
      </div>
    </Link>
  )
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const pid = Number(id)

  const pq = useQuery({ queryKey: ['patient', pid], queryFn: () => fetchPatient(pid), enabled: Number.isFinite(pid) })
  const sq = useQuery({ queryKey: ['scans', pid],   queryFn: () => fetchScans(pid),   enabled: Number.isFinite(pid) })

  if (pq.isLoading || sq.isLoading) {
    return (
      <div className="grid h-full grid-cols-[280px_1fr] gap-0 overflow-hidden">
        <div className="skeleton m-3 h-[calc(100%-24px)]" />
        <div className="skeleton m-3 h-[calc(100%-24px)]" />
      </div>
    )
  }
  if (pq.error || !pq.data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-bad">
        환자 정보를 불러올 수 없습니다.
      </div>
    )
  }
  const p = pq.data
  const scans = sq.data ?? []

  return (
    <div className="grid h-full animate-[fade-in_0.18s_ease-out_both] grid-cols-[280px_1fr] overflow-hidden">
      {/* ====== Left: patient header card + properties ====== */}
      <aside className="overflow-auto border-r border-line bg-panel">
        <div className="px-4 pt-3">
          <Link to="/" className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent">
            <ArrowLeft className="h-3 w-3" />
            환자 목록
          </Link>
          <div className="mt-2 text-[15px] font-semibold tracking-tight text-text-strong">{p.full_name}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted">{p.mrn}</div>
        </div>

        <SectionTitle>속성</SectionTitle>
        <Prop k="생년월일"  v={p.dob} />
        <Prop k="성별"      v={p.sex === 'M' ? '남' : p.sex === 'F' ? '여' : '기타'} />
        <Prop k="스캔 횟수" v={`${p.scan_count}`} />
        <Prop k="최근 스캔" v={p.latest_scan_date ?? '—'} />
        <Prop
          k="최근 점수"
          v={p.latest_severity !== null ? `${(p.latest_severity * 100).toFixed(0)}%` : '—'}
        />

        {p.notes && (
          <>
            <SectionTitle>메모</SectionTitle>
            <p className="px-4 pb-4 text-[11.5px] leading-relaxed text-text/80">{p.notes}</p>
          </>
        )}
      </aside>

      {/* ====== Right: scan timeline ====== */}
      <section className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[12.5px] font-semibold text-text-strong">스캔 이력</h2>
            <span className="text-[10.5px] text-muted">{scans.length}건</span>
          </div>
          {scans.length >= 2 && (
            <Link
              to={`/patients/${p.id}/compare`}
              className="flex items-center gap-1.5 rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-muted transition hover:border-accent hover:text-accent-strong"
            >
              <GitCompareArrows className="h-3 w-3" />
              시간 경과 비교
            </Link>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {scans.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-[11px] text-muted">
              스캔 기록 없음
            </div>
          ) : (
            <div>
              {scans.map((s) => <ScanRow key={s.id} scan={s} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 border-b border-line bg-panel-2 px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
      {children}
    </div>
  )
}
function Prop({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-line-soft px-4 py-1.5 text-[11.5px]">
      <span className="text-muted">{k}</span>
      <span className="font-mono text-text">{v}</span>
    </div>
  )
}
