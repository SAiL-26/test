import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, GitCompareArrows, FileDown, RotateCw, TrendingUp } from 'lucide-react'
import { fetchScan } from '../api/endpoints'
import { fetchMcmcTrace } from '../api/wave'
import WaveWorkspace from '../components/scan/wave/WaveWorkspace'
import DoctorReview from '../components/scan/DoctorReview'
import ErrorBoundary from '../components/ErrorBoundary'
import PipelineRunModal from '../components/scan/wave/PipelineRunModal'
import ChartSheet from '../components/scan/ChartSheet'
import AIAssistantDock from '../components/scan/AIAssistantDock'
import { useAuth } from '../auth/AuthContext'
import type { WaveCaseId } from '../api/wave'
import type { ScanDetail, ScenarioTag } from '../api/types'

/**
 * ScanViewer — clinical console (Phase 4 redesign).
 * Three sections per design handoff:
 *   01 병변 재구성 & 역산  — WaveWorkspace (existing 6-pane viz orchestrator)
 *   02 기록 (Clinical Note) — ChartSheet (SOAP)
 *   03 의사결정 지원       — AIAssistantDock (Claude)
 * Route /scans/:id auto-applies the DARK imaging theme via useRouteTheme.
 */

const SCENARIO_TO_CASE: Record<ScenarioTag, WaveCaseId> = { healthy: 1, inf70: 2, inf80: 3 }

export default function ScanViewer() {
  const { id } = useParams<{ id: string }>()
  const sid = Number(id)
  const { user } = useAuth()
  const qc = useQueryClient()
  const [rerunning, setRerunning] = useState(false)

  const scanQ = useQuery({
    queryKey: ['scan', sid],
    queryFn: () => fetchScan(sid),
    enabled: Number.isFinite(sid),
  })

  const waveCase: WaveCaseId = scanQ.data ? SCENARIO_TO_CASE[scanQ.data.scenario_tag] ?? 1 : 1
  // Prefetch MCMC trace so PipelineRunModal + downstream wave panes hit a warm
  // cache; result not read directly in this view.
  useQuery({
    queryKey: ['wave', 'mcmc', waveCase],
    queryFn: () => fetchMcmcTrace(waveCase),
    enabled: !!scanQ.data,
    staleTime: Infinity,
  })

  if (scanQ.isLoading) {
    return (
      <div className="grid h-full gap-3 p-3">
        <div className="skeleton h-[130px] w-full rounded-[14px]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-[460px] rounded-[14px]" />
          <div className="skeleton h-[460px] rounded-[14px]" />
        </div>
      </div>
    )
  }
  if (scanQ.error || !scanQ.data) {
    return <div className="flex h-full items-center justify-center text-xs text-bad">스캔을 불러올 수 없습니다.</div>
  }

  const scan = scanQ.data

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-[1640px] px-6 pb-10 pt-3 space-y-4">
        {/* ===== HERO STRIP ===== */}
        <HeroStrip scan={scan} />

        {/* ===== SECTION 01 — 파동 신호 분석 ===== */}
        <SectionTitle n="01" title="병변 재구성 & 역산" sub="3D 뷰 · 6패널 시계열 · 라이브 MCMC" />
        {/* viewport-relative min-height keeps the 6-pane workspace usable on
            1280–1440 px laptops; the previous fixed 720 px ate a full
            screen-height row on shorter displays. */}
        <div className="card overflow-hidden min-h-[min(720px,80vh)]">
          <ErrorBoundary>
            <WaveWorkspace scenarioTag={scan.scenario_tag} detection={scan.detection} />
          </ErrorBoundary>
        </div>

        {/* ===== SECTION 02 — 기록 & 의사결정 지원 ===== */}
        <SectionTitle n="02" title="기록 & 의사결정 지원" sub="임상 기록지 · AI 어시스턴트" />
        {/* Stack the two panes vertically below 1280 px (xl:) — side-by-side
            crammed below 600 px wide each on a 1280 laptop. */}
        <div className="grid grid-cols-1 gap-4 min-h-[min(600px,70vh)] xl:grid-cols-2">
          <div className="card overflow-hidden min-w-0">
            <ChartSheet scan={scan} />
          </div>
          <div className="card overflow-hidden min-w-0">
            <AIAssistantDock scan={scan} mode={user?.role === 'patient' ? 'patient' : 'doctor'} />
          </div>
        </div>

        {/* ===== ACTION RAIL ===== */}
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/scans/${scan.id}/story`} className="btn">
            <BookOpen className="h-3 w-3" />
            <span>작동 원리 (스토리)</span>
          </Link>
          <Link to={`/patients/${scan.patient_id}/timeline`} className="btn">
            <TrendingUp className="h-3 w-3" />
            <span>병변 경과</span>
          </Link>
          <Link to={`/patients/${scan.patient_id}/compare`} className="btn">
            <GitCompareArrows className="h-3 w-3" />
            <span>케이스 비교</span>
          </Link>
          <Link
            to={`/scans/${scan.id}/report`}
            className="btn"
            title="A4 리포트 미리보기 (한글 PDF 저장 가능)"
          >
            <FileDown className="h-3 w-3" />
            <span>보고서 미리보기</span>
          </Link>
          <div className="flex-1" />
          {user?.role === 'doctor' && (
            <button
              onClick={() => setRerunning(true)}
              title="조건을 바꿔 5단계 파이프라인을 다시 실행"
              className="btn btn-primary"
            >
              <RotateCw className="h-3 w-3" />
              <span>파이프라인 재계산</span>
            </button>
          )}
        </div>

        {/* ===== DOCTOR REVIEW ===== */}
        {user?.role === 'doctor' && scan.detection && (
          <div className="card p-4">
            <DoctorReview scanId={scan.id} initialReview={scan.detection.doctor_review} />
          </div>
        )}
      </div>

      {rerunning && (
        <PipelineRunModal
          caseId={waveCase}
          onClose={() => setRerunning(false)}
          onComplete={() => qc.invalidateQueries({ queryKey: ['wave'] })}
        />
      )}
    </div>
  )
}

function SectionTitle({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2.5 px-1 pt-1">
      <span className="font-mono text-[11px] font-bold text-accent">{n}</span>
      <span className="text-[14px] font-bold text-text-strong whitespace-nowrap">{title}</span>
      <span className="text-[11.5px] text-faint">{sub}</span>
    </div>
  )
}

function HeroStrip({ scan }: { scan: ScanDetail }) {
  const det = scan.detection
  const score = det?.severity_score
  const pct = score != null ? Math.round(score * 100) : null
  const verdict = pct == null
    ? { label: '—', ko: '판정 보류', tone: 'muted' as const }
    : pct < 20 ? { label: 'NEGATIVE', ko: '정상 소견', tone: 'good' as const }
    : pct < 50 ? { label: 'EQUIVOCAL', ko: '경계성', tone: 'warn' as const }
    : pct < 80 ? { label: 'SUSPICIOUS', ko: '의심 소견', tone: 'warn' as const }
    : { label: 'PROBABLE LESION', ko: '병변 가능성 높음', tone: 'bad' as const }

  const toneColor =
    verdict.tone === 'good' ? 'var(--color-good)' :
    verdict.tone === 'warn' ? 'var(--color-warn)' :
    verdict.tone === 'bad' ? 'var(--color-bad)' :
    'var(--color-muted)'
  const pillClass =
    verdict.tone === 'good' ? 'pill-good' :
    verdict.tone === 'warn' ? 'pill-warn' :
    verdict.tone === 'bad' ? 'pill-bad' :
    'pill-muted'
  const scn = scan.scenario_tag === 'healthy' ? '정상' : scan.scenario_tag === 'inf70' ? '염증 70%' : '염증 80%'

  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-5 px-1 py-3">
      <div className="flex items-center gap-4">
        <SeverityDial pct={pct} color={toneColor} />
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            <span>pt-{String(scan.patient_id).padStart(4, '0')}</span>
            <span className="h-[9px] w-px bg-line" />
            <span>{scan.scan_date}</span>
            <span className="h-[9px] w-px bg-line" />
            <span>{scn}</span>
          </div>
          <div className="editorial mt-0.5 mb-1 text-[34px] font-semibold tracking-[-0.02em] leading-[1.1] text-text-strong">
            {scan.patient_name ?? `환자 ${scan.patient_id}`}
          </div>
          <div className="flex items-center gap-2">
            <span className={'pill ' + pillClass}>
              <span className="status-dot" style={{ background: 'currentColor' }} />
              {verdict.label}
            </span>
            <span className="text-[11.5px] text-muted">{verdict.ko}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <KpiCard label="Misfit (RMS)" value={det ? det.candidate_residual.toExponential(1) : '—'} tone="info" />
        <KpiCard label="Lesion severity" value={pct == null ? '—' : String(pct)} unit="%" tone={verdict.tone === 'muted' ? 'info' : verdict.tone} />
        <KpiCard label="X" value={det ? det.estimate_x_mm.toFixed(1) : '—'} unit="mm" tone="info" />
        <KpiCard label="Y" value={det ? det.estimate_y_mm.toFixed(1) : '—'} unit="mm" tone="info" />
        <KpiCard label="Z" value={det ? det.estimate_z_mm.toFixed(1) : '—'} unit="mm" tone="info" />
      </div>
    </div>
  )
}

function SeverityDial({ pct, color }: { pct: number | null; color: string }) {
  const size = 92
  const r = (size - 12) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const offset = circ * (1 - v / 100)
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} stroke="var(--color-panel-2)" strokeWidth={8} fill="none" />
      <circle
        cx={cx} cy={cy} r={r}
        stroke={color} strokeWidth={8} fill="none" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontFamily="var(--font-editorial)" fontSize={28} fontWeight={600} fill={color}>
        {pct ?? '—'}
      </text>
      {pct != null && (
        <text x={cx} y={cy + 22} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--color-faint)">
          %
        </text>
      )}
    </svg>
  )
}

function KpiCard({ label, value, unit, tone }: {
  label: string
  value: string
  unit?: string
  tone: 'good' | 'warn' | 'bad' | 'info'
}) {
  const color =
    tone === 'good' ? 'var(--color-good)' :
    tone === 'warn' ? 'var(--color-warn)' :
    tone === 'bad' ? 'var(--color-bad)' :
    'var(--color-text-strong)'
  return (
    <div className="surface-flat px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-faint">{label}</div>
      <div className="num text-[16px] font-bold" style={{ color }}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  )
}
