import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import { fetchPatient, fetchPatients, fetchScans } from '../api/endpoints'
import type { Patient } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import NewPatientDialog from '../components/NewPatientDialog'

/**
 * PatientList — triage kanban (Phase 3 redesign).
 * 4 risk bands: 전문의 의뢰 (≥80) · 임상 검토 (50-80) · 경과 관찰 (20-50) · 정상 (<20)
 * Mirrors design handoff: console/views.jsx → PatientList().
 */

type BandKey = 'bad' | 'susp' | 'equiv' | 'good'
interface Band {
  key: BandKey
  label: string
  range: [number, number] // [lo inclusive, hi exclusive] in %
  tone: 'bad' | 'warn' | 'good'
}
const BANDS: Band[] = [
  { key: 'bad',   label: '전문의 의뢰', range: [80, 101], tone: 'bad' },
  { key: 'susp',  label: '임상 검토',   range: [50, 80],  tone: 'warn' },
  { key: 'equiv', label: '경과 관찰',   range: [20, 50],  tone: 'warn' },
  { key: 'good',  label: '정상',        range: [0, 20],   tone: 'good' },
]

function severityPct(p: Patient): number | null {
  return p.latest_severity == null ? null : Math.round(p.latest_severity * 100)
}
function ageFromDob(dob: string): number | null {
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const birth = new Date(+m[1], +m[2] - 1, +m[3])
  const t = new Date()
  let age = t.getFullYear() - birth.getFullYear()
  const md = t.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && t.getDate() < birth.getDate())) age--
  return age
}

export default function PatientList() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
  })
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const patients = data ?? []
  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return patients
    return patients.filter((p) => p.full_name.includes(needle) || p.mrn.includes(needle))
  }, [patients, q])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-4 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-64" />
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return <div className="flex h-full items-center justify-center p-8 text-sm text-bad">데이터 로드 실패: {(error as Error).message}</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* ====== Title + search + new-scan ====== */}
      <div className="flex items-center gap-3 px-6 pb-3 pt-4 shrink-0">
        <div>
          <div className="editorial text-[26px] font-semibold tracking-[-0.02em] text-text-strong">
            환자 트리아지
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            병변 심각도 기준 4구간 · 총 {patients.length}명
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex h-[38px] w-[220px] items-center gap-2 rounded-[9px] border border-line bg-panel px-3">
          <Search className="h-[15px] w-[15px] text-faint" strokeWidth={1.8} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · MRN 검색"
            className="flex-1 border-0 bg-transparent text-[12.5px] text-text placeholder:text-faint outline-none"
          />
        </div>
        {user?.role === 'doctor' && (
          <>
            <button
              onClick={() => setNewOpen(true)}
              className="btn"
              title="환자만 빠르게 등록"
            >
              <span>환자 등록</span>
            </button>
            <button
              onClick={() => nav('/scans/new')}
              className="flex h-[38px] items-center gap-2 rounded-[9px] border-0 bg-accent px-4 text-[12.5px] font-bold text-white hover:bg-accent-strong cursor-pointer"
            >
              <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.8} />
              <span>새 환자 · 스캔</span>
            </button>
          </>
        )}
      </div>

      {/* ====== Kanban — 4 risk bands ====== */}
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-6 pt-1">
        <div className="grid h-full min-h-[460px] grid-cols-4 gap-3.5">
          {BANDS.map((b) => {
            const list = filtered.filter((p) => {
              const s = severityPct(p)
              if (s == null) return b.key === 'good' // unscanned → 정상 column
              return s >= b.range[0] && s < b.range[1]
            })
            const toneColor =
              b.tone === 'bad' ? 'var(--color-bad)' :
              b.tone === 'warn' ? 'var(--color-warn)' :
              'var(--color-good)'
            return (
              <div key={b.key} className="flex min-h-0 flex-col">
                <div
                  className="mb-2.5 flex items-center gap-2 px-1 py-2"
                  style={{ borderBottom: `2px solid ${toneColor}` }}
                >
                  <span className="status-dot" style={{ background: toneColor, width: 9, height: 9 }} />
                  <span className="text-[12.5px] font-bold text-text-strong whitespace-nowrap">
                    {b.label}
                  </span>
                  <span
                    className="ml-auto num text-[13px] font-bold"
                    style={{ color: toneColor }}
                  >
                    {list.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5 overflow-auto pr-1">
                  {list.map((p) => (
                    <PatientCard key={p.id} p={p} toneColor={toneColor} />
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-[10px] border border-dashed border-line p-3 text-center text-[11px] text-faint">
                      해당 없음
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <NewPatientDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(p) => nav(`/patients/${p.id}`)}
      />
    </div>
  )
}

function PatientCard({ p, toneColor }: { p: Patient; toneColor: string }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const pct = severityPct(p)
  const age = ageFromDob(p.dob)
  const sexLabel = p.sex === 'M' ? '남' : p.sex === 'F' ? '여' : ''
  const isNew = (() => {
    if (!p.latest_scan_date) return false
    const d = new Date(p.latest_scan_date)
    const days = (Date.now() - d.getTime()) / 86400000
    return days <= 7
  })()

  // Warm the patient + scan-list caches on hover so the detail page paints
  // instantly when the user clicks. Cheap (~2 small JSON requests) and
  // self-deduplicating via React Query's prefetch.
  //
  // We also dynamic-import the scan-viewer + chart components so the heavy
  // Plotly chunk (~1.4 MB gzipped) starts streaming the moment the user
  // shows intent, not when they click. This is the single biggest perceived
  // latency win: by the time the click lands, the chunk is already cached.
  function prefetch() {
    qc.prefetchQuery({ queryKey: ['patient', p.id], queryFn: () => fetchPatient(p.id), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['scans', p.id], queryFn: () => fetchScans(p.id), staleTime: 30_000 })
    void import('../pages/ScanViewer')
    void import('../pages/TimelineView')
  }

  return (
    <button
      onClick={() => nav(`/patients/${p.id}`)}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="card cursor-pointer p-3 text-left transition hover:border-accent-line hover:shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-text-strong">
          {p.full_name}
          {isNew && <span className="ml-1.5 text-[9px] font-bold text-accent">NEW</span>}
        </span>
        <span className="num text-[16px] font-bold" style={{ color: toneColor }}>
          {pct == null ? '—' : pct}
          {pct != null && <span className="text-[9px]">%</span>}
        </span>
      </div>
      <div className="my-1 font-mono text-[9.5px] text-faint">
        {p.mrn}
        {age != null && (
          <>
            <span> · </span>
            {age}세 {sexLabel}
          </>
        )}
      </div>
      <div className="text-[11px] leading-[1.4] text-muted">
        {p.notes ?? (pct == null ? '스캔 없음' : '특이 소견 없음')}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="num text-[9.5px] text-faint">
          {p.latest_scan_date ?? '—'}
        </span>
        <span className="text-[9.5px] text-muted">
          {p.scan_count}회 스캔
        </span>
      </div>
    </button>
  )
}
