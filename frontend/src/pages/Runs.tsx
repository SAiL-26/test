import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, ArrowUpDown, ChevronRight, RotateCw, Layers,
} from 'lucide-react'
import { fetchScans, fetchPatients } from '../api/endpoints'
import type { Scan, ScanStatus, ScenarioTag } from '../api/types'

/**
 * Runs — scan history table (light, dense), per design handoff
 * console/views.jsx → RunsView. Top: editorial title "스캔 이력" + counts +
 * search + filters by scenario and status. Dense .dt table; click row → console.
 */

const SCENARIO_LABEL: Record<ScenarioTag, string> = {
  healthy: '정상',
  inf70:   '염증 70%',
  inf80:   '염증 80%',
}
const SCENARIO_PILL: Record<ScenarioTag, string> = {
  healthy: 'pill-good',
  inf70:   'pill-warn',
  inf80:   'pill-bad',
}
const STATUS_LABEL: Record<ScanStatus, string> = {
  pending:    '대기',
  processing: '처리 중',
  completed:  '완료',
  failed:     '실패',
}

type SortKey = 'date' | 'patient' | 'scenario' | 'status' | 'scan_id'
type StatusFilter = 'all' | ScanStatus
type ScenarioFilter = 'all' | ScenarioTag

export default function Runs() {
  const sq = useQuery({ queryKey: ['scans'],    queryFn: () => fetchScans() })
  const pq = useQuery({ queryKey: ['patients'], queryFn: fetchPatients })

  const [q, setQ] = useState('')
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>('all')
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDesc, setSortDesc] = useState(true)

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of pq.data ?? []) m.set(p.id, p.full_name)
    return m
  }, [pq.data])

  const allScans = sq.data ?? []

  const counts = useMemo(() => {
    const sc: Record<ScenarioTag, number> = { healthy: 0, inf70: 0, inf80: 0 }
    const st: Record<ScanStatus, number> = { pending: 0, processing: 0, completed: 0, failed: 0 }
    for (const s of allScans) {
      sc[s.scenario_tag] = (sc[s.scenario_tag] ?? 0) + 1
      st[s.status] = (st[s.status] ?? 0) + 1
    }
    return { sc, st }
  }, [allScans])

  const filtered = useMemo<Scan[]>(() => {
    if (!sq.data) return []
    let xs = sq.data
    if (q) {
      const needle = q.trim().toLowerCase()
      xs = xs.filter((s) => {
        const name = (nameById.get(s.patient_id) ?? '').toLowerCase()
        return (
          name.includes(needle)
          || String(s.id).includes(needle)
          || s.scan_date.includes(needle)
          || s.bundle_dir.toLowerCase().includes(needle)
        )
      })
    }
    if (scenarioFilter !== 'all') xs = xs.filter((s) => s.scenario_tag === scenarioFilter)
    if (statusFilter !== 'all')   xs = xs.filter((s) => s.status === statusFilter)

    const sign = sortDesc ? -1 : 1
    xs = [...xs].sort((a, b) => {
      let v = 0
      if (sortKey === 'date')         v = a.scan_date.localeCompare(b.scan_date)
      else if (sortKey === 'patient') v = (nameById.get(a.patient_id) ?? '').localeCompare(nameById.get(b.patient_id) ?? '')
      else if (sortKey === 'scenario') v = a.scenario_tag.localeCompare(b.scenario_tag)
      else if (sortKey === 'status')   v = a.status.localeCompare(b.status)
      else if (sortKey === 'scan_id')  v = a.id - b.id
      return v * sign
    })
    return xs
  }, [sq.data, nameById, q, scenarioFilter, statusFilter, sortKey, sortDesc])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDesc(!sortDesc)
    else { setSortKey(k); setSortDesc(true) }
  }

  if (sq.isLoading || pq.isLoading) return <LoadingScreen />
  if (sq.error) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-bad">
        스캔 이력 로드 실패: {(sq.error as Error).message}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ====== title block ====== */}
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4 pb-3">
        <div>
          <div className="editorial text-[26px] font-semibold tracking-[-0.02em] text-text-strong">
            스캔 이력
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            전체 {allScans.length}건 · 필터링 {filtered.length}건
          </div>
        </div>

        <div className="flex-1" />

        {/* search */}
        <div className="flex h-[38px] w-[260px] items-center gap-2 rounded-[9px] border border-line bg-panel px-3">
          <Search className="h-[15px] w-[15px] text-faint" strokeWidth={1.8} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="환자 · 스캔 ID · 날짜 · 번들"
            className="flex-1 bg-transparent text-[12.5px] text-text placeholder:text-faint outline-none"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="text-[10px] text-faint hover:text-bad"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => sq.refetch()}
          className="btn"
          title="새로고침"
        >
          <RotateCw className={`h-3 w-3 ${sq.isFetching ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* ====== filter chips (scenario + status) ====== */}
      <div className="flex flex-wrap items-center gap-2 border-y border-line bg-panel-2/40 px-6 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">시나리오</span>
        <FilterChip
          label="전체" active={scenarioFilter === 'all'}
          onClick={() => setScenarioFilter('all')}
          count={allScans.length}
        />
        <FilterChip
          label="정상" active={scenarioFilter === 'healthy'} tone="good"
          onClick={() => setScenarioFilter('healthy')} count={counts.sc.healthy}
        />
        <FilterChip
          label="염증 70%" active={scenarioFilter === 'inf70'} tone="warn"
          onClick={() => setScenarioFilter('inf70')} count={counts.sc.inf70}
        />
        <FilterChip
          label="염증 80%" active={scenarioFilter === 'inf80'} tone="bad"
          onClick={() => setScenarioFilter('inf80')} count={counts.sc.inf80}
        />

        <span className="mx-2 h-4 w-px bg-line" />

        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">상태</span>
        <FilterChip
          label="전체" active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')} count={allScans.length}
        />
        <FilterChip
          label="완료" active={statusFilter === 'completed'} tone="good"
          onClick={() => setStatusFilter('completed')} count={counts.st.completed}
        />
        <FilterChip
          label="처리 중" active={statusFilter === 'processing'} tone="warn"
          onClick={() => setStatusFilter('processing')} count={counts.st.processing}
        />
        <FilterChip
          label="대기" active={statusFilter === 'pending'} tone="muted"
          onClick={() => setStatusFilter('pending')} count={counts.st.pending}
        />
        <FilterChip
          label="실패" active={statusFilter === 'failed'} tone="bad"
          onClick={() => setStatusFilter('failed')} count={counts.st.failed}
        />
      </div>

      {/* ====== table ====== */}
      <div className="flex-1 overflow-auto">
        <table className="dt">
          <thead>
            <tr>
              <th>
                <SortHeader label="날짜" active={sortKey === 'date'} desc={sortDesc} onClick={() => toggleSort('date')} />
              </th>
              <th>
                <SortHeader label="환자" active={sortKey === 'patient'} desc={sortDesc} onClick={() => toggleSort('patient')} />
              </th>
              <th>
                <SortHeader label="스캔 ID" active={sortKey === 'scan_id'} desc={sortDesc} onClick={() => toggleSort('scan_id')} />
              </th>
              <th>
                <SortHeader label="시나리오" active={sortKey === 'scenario'} desc={sortDesc} onClick={() => toggleSort('scenario')} />
              </th>
              <th>
                <SortHeader label="상태" active={sortKey === 'status'} desc={sortDesc} onClick={() => toggleSort('status')} />
              </th>
              <th>번들</th>
              <th aria-label="actions" className="w-[44px]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <RunRow key={s.id} scan={s} patientName={nameById.get(s.patient_id)} />
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-[12px] text-muted">
            <Layers className="h-4 w-4 text-faint" />
            조건에 해당하는 스캔이 없습니다.
            {(q || scenarioFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setQ(''); setScenarioFilter('all'); setStatusFilter('all') }}
                className="mt-1 text-[11px] text-accent hover:underline"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      {/* ====== footer ====== */}
      <footer className="flex items-center justify-between border-t border-line bg-panel px-6 py-2">
        <div className="text-[10.5px] text-faint">
          최근 30일 표시 · 모든 스캔은 합성 PoC 데이터입니다
        </div>
        <div className="font-mono text-[10.5px] text-muted">
          {filtered.length}/{allScans.length}
        </div>
      </footer>
    </div>
  )
}

// ── row ────────────────────────────────────────────────────────────────────
function RunRow({ scan, patientName }: { scan: Scan; patientName?: string }) {
  const nav = useNavigate()
  const statusTone =
    scan.status === 'completed' ? 'good'
      : scan.status === 'processing' ? 'warn'
      : scan.status === 'failed' ? 'bad'
      : 'muted'
  return (
    <tr onClick={() => nav(`/scans/${scan.id}`)}>
      <td><span className="num text-muted">{scan.scan_date}</span></td>
      <td>
        <Link
          to={`/patients/${scan.patient_id}`}
          className="font-medium text-text-strong hover:text-accent-strong"
          onClick={(e) => e.stopPropagation()}
        >
          {patientName ?? `patient ${scan.patient_id}`}
        </Link>
      </td>
      <td><span className="num text-muted">scan/{String(scan.id).padStart(5, '0')}</span></td>
      <td><span className={`pill ${SCENARIO_PILL[scan.scenario_tag]}`}>{SCENARIO_LABEL[scan.scenario_tag]}</span></td>
      <td>
        <span className="flex items-center gap-1.5">
          <span
            className="status-dot"
            style={{
              background:
                statusTone === 'good' ? 'var(--color-good)'
                  : statusTone === 'warn' ? 'var(--color-warn)'
                  : statusTone === 'bad' ? 'var(--color-bad)'
                  : 'var(--color-faint)',
              animation: scan.status === 'processing' ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }}
          />
          <span className="text-[12px] text-muted">{STATUS_LABEL[scan.status]}</span>
        </span>
      </td>
      <td><span className="num text-[10.5px] text-faint">{scan.bundle_dir}</span></td>
      <td className="text-right">
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-faint" />
      </td>
    </tr>
  )
}

// ── ui bits ────────────────────────────────────────────────────────────────
function SortHeader({ label, active, desc, onClick }: {
  label: string; active: boolean; desc: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 ${active ? 'text-text-strong' : 'text-muted hover:text-text'}`}
    >
      {label}
      <ArrowUpDown
        className={`h-2.5 w-2.5 transition ${active ? 'opacity-100' : 'opacity-40'} ${active && !desc ? 'rotate-180' : ''}`}
      />
    </button>
  )
}

function FilterChip({
  label, count, active, tone, onClick,
}: {
  label: string
  count: number
  active: boolean
  tone?: 'bad' | 'warn' | 'good' | 'muted'
  onClick: () => void
}) {
  const dotColor =
    tone === 'bad'  ? 'var(--color-bad)'
    : tone === 'warn' ? 'var(--color-warn)'
    : tone === 'good' ? 'var(--color-good)'
    : tone === 'muted' ? 'var(--color-faint)'
    : null
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11.5px] transition ' +
        (active
          ? 'border-accent-line bg-accent-soft text-accent-strong'
          : 'border-line bg-panel text-muted hover:border-accent-line/60 hover:text-text')
      }
    >
      {dotColor && (
        <span className="status-dot" style={{ background: dotColor }} />
      )}
      <span>{label}</span>
      <span className="num text-[10.5px] text-faint">{count}</span>
    </button>
  )
}

// ── loading ────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4 pb-3">
        <div className="skeleton h-7 w-[200px]" />
        <div className="skeleton mt-2 h-3 w-[140px]" />
      </div>
      <div className="space-y-1.5 p-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-9" />)}
      </div>
    </div>
  )
}
