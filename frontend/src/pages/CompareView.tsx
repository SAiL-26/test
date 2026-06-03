import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, GitCompareArrows, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Target, Activity, Layers,
} from 'lucide-react'
import { fetchPatient, fetchScan, fetchScans } from '../api/endpoints'
import type { Detection, Scan, ScenarioTag } from '../api/types'

/**
 * CompareView — A/B side-by-side comparison of two scans for ONE patient.
 * Route: /patients/:id/compare (dark theme, per IMAGING_PATTERNS).
 *
 * Mirrors the design handoff (console/views.jsx → CompareView):
 *   • top scan-pickers for slot A and B (defaults: newest two scans)
 *   • two columns, each = a scan-card (date · severity · scenario · tooth · KPIs)
 *   • centre delta panel (Δseverity · ΔlocErr · ΔR̂) with directional arrows
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

interface Verdict { label: string; ko: string; tone: 'good' | 'warn' | 'bad' | 'muted' }
function verdict(pct: number | null): Verdict {
  if (pct == null) return { label: '—',                tone: 'muted', ko: '판정 보류' }
  if (pct < 20)    return { label: 'NEGATIVE',         tone: 'good',  ko: '정상 소견' }
  if (pct < 50)    return { label: 'EQUIVOCAL',        tone: 'warn',  ko: '경계성' }
  if (pct < 80)    return { label: 'SUSPICIOUS',       tone: 'warn',  ko: '의심 소견' }
  return            { label: 'PROBABLE LESION',        tone: 'bad',   ko: '병변 가능성 높음' }
}
function tonePill(tone: Verdict['tone']): string {
  if (tone === 'good') return 'pill-good'
  if (tone === 'warn') return 'pill-warn'
  if (tone === 'bad')  return 'pill-bad'
  return 'pill-muted'
}
function toneVar(tone: Verdict['tone']): string {
  if (tone === 'good') return 'var(--color-good)'
  if (tone === 'warn') return 'var(--color-warn)'
  if (tone === 'bad')  return 'var(--color-bad)'
  return 'var(--color-muted)'
}

function severityPct(d: Detection | null | undefined): number | null {
  if (!d) return null
  return Math.round((d.severity_score ?? 0) * 100)
}

export default function CompareView() {
  const { id } = useParams<{ id: string }>()
  const patientId = Number(id)

  const patientQ = useQuery({
    queryKey: ['patient', patientId],
    queryFn:  () => fetchPatient(patientId),
    enabled:  Number.isFinite(patientId),
  })
  const scansQ = useQuery({
    queryKey: ['scans', patientId],
    queryFn:  () => fetchScans(patientId),
    enabled:  Number.isFinite(patientId),
  })

  // sort newest-first for the picker
  const scansSorted = useMemo<Scan[]>(() => {
    const xs = scansQ.data ?? []
    return [...xs].sort((a, b) => b.scan_date.localeCompare(a.scan_date))
  }, [scansQ.data])

  const [aId, setAId] = useState<number | null>(null)
  const [bId, setBId] = useState<number | null>(null)

  // bootstrap defaults: newest = A, second newest = B (fallback A)
  useEffect(() => {
    if (scansSorted.length === 0) return
    setAId((cur) => cur ?? scansSorted[0].id)
    setBId((cur) => cur ?? (scansSorted[1]?.id ?? scansSorted[0].id))
  }, [scansSorted])

  if (!Number.isFinite(patientId)) {
    return <ErrorScreen message="유효하지 않은 환자 ID입니다." />
  }
  if (patientQ.isLoading || scansQ.isLoading) return <LoadingScreen />
  if (patientQ.error || !patientQ.data) {
    return <ErrorScreen message="환자 정보를 불러올 수 없습니다." />
  }
  if (scansSorted.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <div className="editorial text-[22px] text-text-strong">스캔 기록이 없습니다</div>
        <div className="text-[12px] text-muted">{patientQ.data.full_name} · {patientQ.data.mrn}</div>
        <Link to={`/patients/${patientId}`} className="btn">← 환자 상세로</Link>
      </div>
    )
  }
  if (scansSorted.length === 1) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <div className="editorial text-[22px] text-text-strong">비교에는 2회 이상의 스캔이 필요합니다</div>
        <div className="text-[12px] text-muted">현재 {scansSorted.length}회 스캔</div>
        <Link to={`/patients/${patientId}`} className="btn">← 환자 상세로</Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
      {/* ====== header ====== */}
      <header className="flex flex-wrap items-center gap-4">
        <Link
          to={`/patients/${patientId}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
        >
          <ArrowLeft className="h-3 w-3" />
          환자 상세
        </Link>
        <div>
          <div className="editorial text-[22px] font-semibold tracking-[-0.02em] text-text-strong">
            케이스 비교
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {patientQ.data.full_name} · {patientQ.data.mrn} · 총 {scansSorted.length}회 스캔
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ScanPicker
            slot="A"
            value={aId ?? scansSorted[0].id}
            scans={scansSorted}
            onChange={setAId}
          />
          <GitCompareArrows className="h-4 w-4 text-faint" />
          <ScanPicker
            slot="B"
            value={bId ?? scansSorted[1].id}
            scans={scansSorted}
            onChange={setBId}
          />
        </div>
      </header>

      {/* ====== A | DELTA | B grid ====== */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px_1fr] gap-4">
        <ScanColumn slot="A" scanId={aId ?? scansSorted[0].id} accent="var(--color-accent)" />
        <DeltaColumn aId={aId ?? scansSorted[0].id} bId={bId ?? scansSorted[1].id} />
        <ScanColumn slot="B" scanId={bId ?? scansSorted[1].id} accent="var(--color-finding-progressed)" />
      </div>
    </div>
  )
}

// ── pickers ────────────────────────────────────────────────────────────────
function ScanPicker({
  slot, value, scans, onChange,
}: {
  slot: 'A' | 'B'
  value: number
  scans: Scan[]
  onChange: (id: number) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-muted">{slot}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[34px] rounded-[8px] border border-line bg-panel px-3 text-[12.5px] text-text outline-none focus:border-accent-line"
      >
        {scans.map((s) => (
          <option key={s.id} value={s.id}>
            {s.scan_date} · {SCENARIO_LABEL[s.scenario_tag]} · scan/{s.id}
          </option>
        ))}
      </select>
    </label>
  )
}

// ── per-scan column ────────────────────────────────────────────────────────
function ScanColumn({ slot, scanId, accent }: { slot: 'A' | 'B'; scanId: number; accent: string }) {
  const q = useQuery({
    queryKey: ['scan', scanId],
    queryFn:  () => fetchScan(scanId),
    enabled:  Number.isFinite(scanId),
  })

  if (q.isLoading) {
    return <div className="card flex min-h-0 flex-col p-4"><div className="skeleton flex-1 min-h-[400px]" /></div>
  }
  if (q.error || !q.data) {
    return (
      <div className="card flex h-full items-center justify-center p-6 text-[12px] text-bad">
        스캔 로드 실패
      </div>
    )
  }
  const s = q.data
  const pct = severityPct(s.detection)
  const v = verdict(pct)

  return (
    <article className="card flex min-h-0 flex-col overflow-hidden">
      {/* slot ribbon */}
      <div
        className="flex items-center justify-between border-b border-line-soft px-4 py-2"
        style={{ background: `color-mix(in srgb, ${accent} 6%, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: accent }}
          >
            {slot}
          </span>
          <span className="text-[11.5px] text-muted">
            {s.scan_date} · scan/{s.id}
          </span>
        </div>
        <Link
          to={`/scans/${s.id}`}
          className="inline-flex items-center gap-1 text-[10.5px] text-muted hover:text-accent"
        >
          콘솔 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* big severity */}
      <div className="flex items-start justify-between border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-text-strong">{s.patient_name ?? '—'}</div>
          <div className="mt-0.5 font-mono text-[10px] text-faint">
            {s.bundle_dir}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`pill ${SCENARIO_PILL[s.scenario_tag]}`}>
              {SCENARIO_LABEL[s.scenario_tag]}
            </span>
            <span className={`pill ${tonePill(v.tone)}`}>{v.ko}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="editorial-i text-[44px] leading-none font-semibold"
            style={{ color: toneVar(v.tone) }}
          >
            {pct == null ? '—' : pct}
            {pct != null && <span className="ml-0.5 text-[18px]">%</span>}
          </div>
          <div className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
            {v.label}
          </div>
        </div>
      </div>

      {/* KPIs grid */}
      <div className="grid grid-cols-2 gap-px bg-line">
        <KpiCell
          icon={<Target className="h-3.5 w-3.5" />}
          label="Localization err"
          value={s.detection ? s.detection.candidate_residual.toFixed(3) : '—'}
          unit="resid"
          tone="muted"
        />
        <KpiCell
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Recv. peak"
          value={s.detection ? `#${s.detection.candidate_recv_idx}` : '—'}
          unit="ch"
          tone="muted"
        />
        <KpiCell
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Severity"
          value={pct == null ? '—' : String(pct)}
          unit="%"
          tone={v.tone}
        />
        <KpiCell
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Model ver."
          value={s.detection?.model_version ?? '—'}
          unit=""
          tone="muted"
          mono={false}
        />
      </div>

      {/* tooth / estimate */}
      <div className="px-5 py-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
          탐지 좌표 (mm)
        </div>
        {s.detection ? (
          <div className="grid grid-cols-3 gap-2">
            <Coord axis="X" v={s.detection.estimate_x_mm} />
            <Coord axis="Y" v={s.detection.estimate_y_mm} />
            <Coord axis="Z" v={s.detection.estimate_z_mm} />
          </div>
        ) : (
          <div className="rounded border border-dashed border-line p-3 text-center text-[11px] text-faint">
            탐지 결과 없음
          </div>
        )}
      </div>

      {/* bundle meta sliver */}
      <div className="mt-auto border-t border-line-soft px-5 py-3 text-[10px] text-faint">
        grid {s.bundle_meta.grid.NX}×{s.bundle_meta.grid.NY}×{s.bundle_meta.grid.NZ}
        <span className="mx-1.5">·</span>
        {s.bundle_meta.spacing_mm.toFixed(2)} mm/vox
        <span className="mx-1.5">·</span>
        {s.bundle_meta.time.NT.toLocaleString()} steps
      </div>
    </article>
  )
}

function KpiCell({
  icon, label, value, unit, tone, mono = true,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  tone: 'good' | 'warn' | 'bad' | 'muted'
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 bg-panel p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-muted">
        <span style={{ color: toneVar(tone) }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`${mono ? 'num' : ''} text-[16px] font-semibold`}
          style={{ color: toneVar(tone) }}
        >
          {value}
        </span>
        {unit && <span className="text-[9.5px] text-faint">{unit}</span>}
      </div>
    </div>
  )
}

function Coord({ axis, v }: { axis: string; v: number }) {
  return (
    <div className="surface-flat px-2.5 py-1.5">
      <div className="text-[9px] font-bold text-muted">{axis}</div>
      <div className="num text-[12.5px] text-text">{v.toFixed(2)}</div>
    </div>
  )
}

// ── delta column ───────────────────────────────────────────────────────────
function DeltaColumn({ aId, bId }: { aId: number; bId: number }) {
  const aQ = useQuery({ queryKey: ['scan', aId], queryFn: () => fetchScan(aId), enabled: Number.isFinite(aId) })
  const bQ = useQuery({ queryKey: ['scan', bId], queryFn: () => fetchScan(bId), enabled: Number.isFinite(bId) })

  if (aQ.isLoading || bQ.isLoading) {
    return <div className="surface flex min-h-0 flex-col p-3"><div className="skeleton min-h-[300px] flex-1" /></div>
  }
  if (!aQ.data || !bQ.data) {
    return <div className="surface flex h-full items-center justify-center text-[11px] text-faint">데이터 부족</div>
  }
  const a = aQ.data
  const b = bQ.data

  const aPct = severityPct(a.detection)
  const bPct = severityPct(b.detection)
  const dSev = aPct != null && bPct != null ? bPct - aPct : null

  const aRes = a.detection?.candidate_residual ?? null
  const bRes = b.detection?.candidate_residual ?? null
  const dRes = aRes != null && bRes != null ? bRes - aRes : null

  const aRecv = a.detection?.candidate_recv_idx ?? null
  const bRecv = b.detection?.candidate_recv_idx ?? null
  const dRecv = aRecv != null && bRecv != null ? bRecv - aRecv : null

  // PHASE 8 stub: ΔR̂ not exposed in current Detection — surface "—" until backend ships an mcmc_rhat field.
  const dRhat: number | null = null

  // Verdict bands for left/right colourings
  const dirSev: 'better' | 'worse' | 'same' | 'unknown' =
    dSev == null ? 'unknown' : dSev > 1 ? 'worse' : dSev < -1 ? 'better' : 'same'

  return (
    <aside className="surface-elev flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          <GitCompareArrows className="h-3.5 w-3.5 text-accent" />
          DELTA · A → B
        </div>
        <div className="mt-1 font-mono text-[10px] text-faint">
          {a.scan_date} → {b.scan_date}
        </div>
      </div>

      {/* big delta severity */}
      <div className="px-4 py-5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
          ΔSeverity
        </div>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          {dSev == null ? (
            <span className="editorial-i text-[40px] text-faint">—</span>
          ) : (
            <>
              <DirIcon dir={dirSev} size={20} />
              <span
                className="editorial-i text-[42px] font-semibold"
                style={{ color: deltaColor(dirSev) }}
              >
                {dSev > 0 ? '+' : ''}{dSev}
              </span>
              <span className="text-[14px] text-muted">%p</span>
            </>
          )}
        </div>
        <div className="mt-2 text-[10.5px] text-muted">
          {dSev == null
            ? '판정 보류'
            : dirSev === 'worse'
              ? '진행 — 심화 양상'
              : dirSev === 'better'
                ? '호전 — 개선 양상'
                : '안정 — 유의 변화 없음'}
        </div>
      </div>

      {/* divider */}
      <div className="mx-4 border-t border-line-soft" />

      {/* delta rows */}
      <div className="flex flex-col divide-y divide-line-soft">
        <DeltaRow
          label="Candidate residual"
          aVal={aRes != null ? aRes.toFixed(3) : '—'}
          bVal={bRes != null ? bRes.toFixed(3) : '—'}
          delta={dRes != null ? (dRes >= 0 ? '+' : '') + dRes.toFixed(3) : '—'}
          dir={dRes == null ? 'unknown' : dRes < 0 ? 'better' : dRes > 0 ? 'worse' : 'same'}
        />
        <DeltaRow
          label="Recv. peak (ch)"
          aVal={aRecv != null ? `#${aRecv}` : '—'}
          bVal={bRecv != null ? `#${bRecv}` : '—'}
          delta={dRecv != null ? (dRecv > 0 ? '+' : '') + dRecv : '—'}
          dir="same"
        />
        <DeltaRow
          label="MCMC R̂"
          aVal="—"
          bVal="—"
          delta={dRhat ?? '—'}
          dir="unknown"
          stub
        />
        <DeltaRow
          label="Scenario"
          aVal={SCENARIO_LABEL[a.scenario_tag]}
          bVal={SCENARIO_LABEL[b.scenario_tag]}
          delta={a.scenario_tag === b.scenario_tag ? '동일' : '변경'}
          dir={a.scenario_tag === b.scenario_tag ? 'same' : 'unknown'}
          mono={false}
        />
        <DeltaRow
          label="Model ver."
          aVal={a.detection?.model_version ?? '—'}
          bVal={b.detection?.model_version ?? '—'}
          delta={
            a.detection?.model_version === b.detection?.model_version ? '동일' : '변경'
          }
          dir={a.detection?.model_version === b.detection?.model_version ? 'same' : 'unknown'}
          mono={false}
        />
      </div>

      {/* footer caption */}
      <div className="mt-auto border-t border-line-soft px-4 py-3 text-[10px] leading-snug text-faint">
        Δ는 B − A 기준. 진행/호전 판정은 ±1%p 임계를 사용합니다.
      </div>
    </aside>
  )
}

function DirIcon({ dir, size }: { dir: 'better' | 'worse' | 'same' | 'unknown'; size: number }) {
  const sz = `${size}px`
  const s = { width: sz, height: sz } as const
  if (dir === 'worse') return <TrendingUp style={s} className="text-bad" />
  if (dir === 'better') return <TrendingDown style={s} className="text-good" />
  if (dir === 'same') return <Minus style={s} className="text-muted" />
  return <Minus style={s} className="text-faint" />
}

function deltaColor(dir: 'better' | 'worse' | 'same' | 'unknown') {
  if (dir === 'worse') return 'var(--color-bad)'
  if (dir === 'better') return 'var(--color-good)'
  if (dir === 'same') return 'var(--color-muted)'
  return 'var(--color-faint)'
}

function DeltaRow({
  label, aVal, bVal, delta, dir, stub, mono = true,
}: {
  label: string
  aVal: string
  bVal: string
  delta: string | number
  dir: 'better' | 'worse' | 'same' | 'unknown'
  stub?: boolean
  mono?: boolean
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-muted">{label}</span>
        {stub && (
          <span className="pill pill-muted" title="PHASE 8 stub: backend field missing">
            stub
          </span>
        )}
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 text-[11.5px]">
        <span className={`${mono ? 'num' : ''} text-text`}>{aVal}</span>
        <span className="text-[10px] text-faint">→</span>
        <span className={`${mono ? 'num' : ''} text-text text-right`}>{bVal}</span>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1">
        <DirIcon dir={dir} size={11} />
        <span
          className={`${mono ? 'num' : ''} text-[11px] font-semibold`}
          style={{ color: deltaColor(dir) }}
        >
          {delta}
        </span>
      </div>
    </div>
  )
}

// ── skeletons / errors ────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="grid h-full grid-cols-[1fr_260px_1fr] gap-4 p-6">
      <div className="skeleton min-h-[300px]" />
      <div className="skeleton min-h-[300px]" />
      <div className="skeleton min-h-[300px]" />
    </div>
  )
}
function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-[13px] text-bad">
      {message}
    </div>
  )
}

