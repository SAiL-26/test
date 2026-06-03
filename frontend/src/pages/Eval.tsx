import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, Target, FlaskConical, ArrowRight, TrendingUp, AlertTriangle,
  ChevronRight, Sigma,
} from 'lucide-react'
import { fetchPatients, fetchScan, fetchScans } from '../api/endpoints'
import type { Detection, Scan, ScanDetail, ScenarioTag } from '../api/types'

/**
 * Eval — evaluation / scenario index, per design handoff console/views.jsx → EvalView.
 * Light theme.
 *
 * Top:    editorial "평가 · 시나리오" + summary line
 * Mid:    three scenario cards (healthy / inf70 / inf80) with n_scans, mean severity,
 *         mean residual, R̂ distribution sketch
 * Bottom: detail table of recent evaluations (scan_id, patient, scenario, severity,
 *         residual, model version)
 */

const SCENARIOS: { id: ScenarioTag; label: string; ko: string; pill: string }[] = [
  { id: 'healthy', label: 'CASE healthy', ko: '정상',    pill: 'pill-good' },
  { id: 'inf70',   label: 'CASE inf70',   ko: '염증 70%', pill: 'pill-warn' },
  { id: 'inf80',   label: 'CASE inf80',   ko: '염증 80%', pill: 'pill-bad'  },
]

const METRICS: { label: string; desc: string; unit: string }[] = [
  { label: 'Localization error', desc: '|posterior mode − GT| (voxel)',     unit: 'vox · mm' },
  { label: 'MCMC R̂',             desc: 'split-half 수렴 진단',                unit: '≤ 1.05' },
  { label: 'ESS',                desc: 'effective sample size',              unit: '/ 1000' },
  { label: 'Best misfit',        desc: '최소 잔차 (exp)',                     unit: 'exp' },
  { label: 'Acceptance',         desc: 'Metropolis 채택률',                   unit: '%' },
]

function pct(v: number | null): string {
  if (v == null) return '—'
  return `${Math.round(v * 100)}%`
}

export default function Eval() {
  const scansQ    = useQuery({ queryKey: ['scans'],    queryFn: () => fetchScans() })
  const patientsQ = useQuery({ queryKey: ['patients'], queryFn: fetchPatients })

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of patientsQ.data ?? []) m.set(p.id, p.full_name)
    return m
  }, [patientsQ.data])

  // Fetch ScanDetail for each scan to get detection + bundle_meta — we need
  // residual / severity / model_version per row. Limit to the latest 24 to
  // keep request volume manageable.
  // PHASE 8 stub: a proper /eval aggregation endpoint would replace this fan-out.
  const sortedScans = useMemo<Scan[]>(() => {
    const xs = scansQ.data ?? []
    return [...xs].sort((a, b) => b.scan_date.localeCompare(a.scan_date)).slice(0, 24)
  }, [scansQ.data])

  const detailsQ = useQueries({
    queries: sortedScans.map((s) => ({
      queryKey: ['scan', s.id],
      queryFn:  () => fetchScan(s.id),
      enabled:  !!s.id,
      staleTime: 60_000,
    })),
  })

  const detailRows: ScanDetail[] = detailsQ
    .map((r) => r.data)
    .filter((d): d is ScanDetail => !!d)

  // Aggregate per-scenario stats
  const stats = useMemo(() => {
    const acc: Record<ScenarioTag, {
      n: number; sumSev: number; sumRes: number; resN: number; sevN: number;
      severities: number[]; residuals: number[];
    }> = {
      healthy: { n: 0, sumSev: 0, sumRes: 0, resN: 0, sevN: 0, severities: [], residuals: [] },
      inf70:   { n: 0, sumSev: 0, sumRes: 0, resN: 0, sevN: 0, severities: [], residuals: [] },
      inf80:   { n: 0, sumSev: 0, sumRes: 0, resN: 0, sevN: 0, severities: [], residuals: [] },
    }
    for (const s of (scansQ.data ?? [])) acc[s.scenario_tag].n += 1
    for (const d of detailRows) {
      const tag = d.scenario_tag
      if (d.detection) {
        acc[tag].sumSev += d.detection.severity_score
        acc[tag].severities.push(d.detection.severity_score)
        acc[tag].sevN += 1
        acc[tag].sumRes += d.detection.candidate_residual
        acc[tag].residuals.push(d.detection.candidate_residual)
        acc[tag].resN += 1
      }
    }
    return acc
  }, [scansQ.data, detailRows])

  const [scenarioFilter, setScenarioFilter] = useState<'all' | ScenarioTag>('all')

  const filteredRows = useMemo(() => {
    let xs = detailRows
    if (scenarioFilter !== 'all') xs = xs.filter((d) => d.scenario_tag === scenarioFilter)
    return xs
  }, [detailRows, scenarioFilter])

  if (scansQ.isLoading || patientsQ.isLoading) return <LoadingScreen />
  if (scansQ.error) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-bad">
        평가 데이터 로드 실패: {(scansQ.error as Error).message}
      </div>
    )
  }

  const totalScans = scansQ.data?.length ?? 0
  const loadingDetails = detailsQ.some((q) => q.isLoading)

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* ====== title ====== */}
      <header className="flex flex-wrap items-baseline gap-4 px-6 pt-4 pb-4">
        <div>
          <div className="editorial text-[26px] font-semibold tracking-[-0.02em] text-text-strong">
            평가 · 시나리오
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            3개 활성 시나리오 · 사전계산 케이스 + 측정 지표 · 총 {totalScans}건 스캔
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/compare"
            className="btn"
          >
            <ArrowRight className="h-3 w-3" />
            교차 비교 열기
          </Link>
          <Link
            to="/runs"
            className="btn"
          >
            <ArrowRight className="h-3 w-3" />
            전체 이력
          </Link>
        </div>
      </header>

      {/* ====== scenario cards ====== */}
      <section className="px-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          <FlaskConical className="h-3.5 w-3.5 text-accent" />
          시나리오 (precomputed)
        </div>
        <div className="grid grid-cols-3 gap-3">
          {SCENARIOS.map((sc) => (
            <ScenarioCard
              key={sc.id}
              scenario={sc}
              stat={stats[sc.id]}
              detailLoaded={!loadingDetails}
              total={totalScans}
            />
          ))}
        </div>
      </section>

      {/* ====== metrics legend ====== */}
      <section className="px-6 pt-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          <Sigma className="h-3.5 w-3.5 text-accent" />
          측정 지표
        </div>
        <div className="card overflow-hidden">
          {METRICS.map((m, i) => (
            <div
              key={m.label}
              className={
                'flex items-center gap-4 px-4 py-3 ' +
                (i < METRICS.length - 1 ? 'border-b border-line-soft' : '')
              }
            >
              <span className="w-[160px] text-[12.5px] font-semibold text-text">{m.label}</span>
              <span className="flex-1 text-[11.5px] text-muted">{m.desc}</span>
              <span className="num text-[10.5px] text-accent-strong">{m.unit}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ====== detailed rows ====== */}
      <section className="px-6 pb-6 pt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            <Activity className="h-3.5 w-3.5 text-accent" />
            최근 평가 결과 · 최대 24건
          </div>
          <div className="flex items-center gap-1.5">
            <ScenarioToggle
              label="전체"
              active={scenarioFilter === 'all'}
              onClick={() => setScenarioFilter('all')}
            />
            {SCENARIOS.map((sc) => (
              <ScenarioToggle
                key={sc.id}
                label={sc.ko}
                tone={sc.id === 'healthy' ? 'good' : sc.id === 'inf70' ? 'warn' : 'bad'}
                active={scenarioFilter === sc.id}
                onClick={() => setScenarioFilter(sc.id)}
              />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-line bg-panel">
          <table className="dt">
            <thead>
              <tr>
                <th>스캔</th>
                <th>환자</th>
                <th>날짜</th>
                <th>시나리오</th>
                <th>심각도</th>
                <th>잔차</th>
                <th>탐지 채널</th>
                <th>모델 버전</th>
                <th aria-label="open" className="w-[44px]" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((d) => (
                <EvalRow
                  key={d.id}
                  detail={d}
                  patientName={nameById.get(d.patient_id)}
                />
              ))}
            </tbody>
          </table>
          {loadingDetails && filteredRows.length === 0 && (
            <div className="space-y-1 p-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9" />)}
            </div>
          )}
          {!loadingDetails && filteredRows.length === 0 && (
            <div className="flex h-24 items-center justify-center text-[11.5px] text-muted">
              해당 시나리오의 최근 평가 결과가 없습니다.
            </div>
          )}
        </div>

        <div className="mt-3 rounded-[10px] border border-dashed border-line bg-panel-2/40 px-4 py-3 text-center text-[11px] text-muted">
          ROC · PR cohort 분석은 다중 시나리오 sweep 도입 후 제공됩니다.
        </div>
      </section>
    </div>
  )
}

// ── scenario card ─────────────────────────────────────────────────────────
function ScenarioCard({
  scenario, stat, detailLoaded, total,
}: {
  scenario: { id: ScenarioTag; label: string; ko: string; pill: string }
  stat: { n: number; sumSev: number; sumRes: number; resN: number; sevN: number; severities: number[]; residuals: number[] }
  detailLoaded: boolean
  total: number
}) {
  const meanSev = stat.sevN > 0 ? stat.sumSev / stat.sevN : null
  const meanRes = stat.resN > 0 ? stat.sumRes / stat.resN : null
  const share = total > 0 ? stat.n / total : 0
  const tone =
    scenario.id === 'healthy' ? 'good'
      : scenario.id === 'inf70' ? 'warn'
      : 'bad'
  const toneColor =
    tone === 'good' ? 'var(--color-good)'
      : tone === 'warn' ? 'var(--color-warn)'
      : 'var(--color-bad)'

  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
          {scenario.label}
        </div>
        <span className={`pill ${scenario.pill}`}>{scenario.ko}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="editorial-i text-[36px] leading-none font-semibold"
          style={{ color: toneColor }}
        >
          {stat.n}
        </span>
        <span className="text-[11px] text-muted">건</span>
        <span className="ml-auto num text-[10.5px] text-faint">
          {Math.round(share * 100)}% 비중
        </span>
      </div>

      <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-panel-2">
        <span
          className="block h-full"
          style={{ width: `${Math.max(2, share * 100)}%`, background: toneColor }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric
          label="평균 심각도"
          value={detailLoaded ? pct(meanSev) : '…'}
          tone={tone}
          icon={<AlertTriangle className="h-3 w-3" />}
        />
        <MiniMetric
          label="평균 잔차"
          value={detailLoaded ? (meanRes != null ? meanRes.toFixed(3) : '—') : '…'}
          tone="muted"
          icon={<Target className="h-3 w-3" />}
        />
      </div>

      {/* severity distribution sparkline */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[9.5px] uppercase tracking-[0.06em] text-muted">
          <span>심각도 분포</span>
          <span className="num text-faint">{stat.severities.length} pts</span>
        </div>
        <SeverityHist values={stat.severities} toneColor={toneColor} />
      </div>

      <div className="mt-3 text-[10.5px] text-muted">
        <TrendingUp className="mr-1 inline-block h-3 w-3 text-faint" />
        {scenario.id === 'healthy'
          ? '정상 대조군. severity가 < 20%로 모이면 모델이 잘 분리.'
          : scenario.id === 'inf70'
          ? '경계 영역. severity가 50–80%로 분포하면 임상 검토 권고.'
          : '임상 의뢰 권고 영역. 80% 이상에 모일수록 정확.'}
      </div>
    </article>
  )
}

function MiniMetric({
  label, value, tone, icon,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'bad' | 'muted'
  icon: React.ReactNode
}) {
  const color =
    tone === 'good' ? 'var(--color-good)'
      : tone === 'warn' ? 'var(--color-warn)'
      : tone === 'bad' ? 'var(--color-bad)'
      : 'var(--color-text)'
  return (
    <div className="surface-flat px-3 py-2">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.06em] text-muted">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 num text-[14px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

/** Tiny histogram: 5 bins over [0, 1] severity range. */
function SeverityHist({ values, toneColor }: { values: number[]; toneColor: string }) {
  const bins = [0, 0, 0, 0, 0]
  for (const v of values) {
    const i = Math.min(4, Math.floor(v * 5))
    bins[i] += 1
  }
  const max = Math.max(1, ...bins)
  return (
    <div className="flex h-[34px] items-end gap-1">
      {bins.map((n, i) => {
        const h = (n / max) * 100
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm"
            title={`${i * 20}–${(i + 1) * 20}%: ${n}`}
            style={{
              height: `${Math.max(4, h)}%`,
              background: n === 0 ? 'var(--color-panel-2)' : toneColor,
              opacity: n === 0 ? 1 : 0.4 + (n / max) * 0.6,
            }}
          />
        )
      })}
    </div>
  )
}

// ── scenario toggle (filter) ──────────────────────────────────────────────
function ScenarioToggle({
  label, active, onClick, tone,
}: {
  label: string
  active: boolean
  onClick: () => void
  tone?: 'good' | 'warn' | 'bad'
}) {
  const dot =
    tone === 'good' ? 'var(--color-good)'
      : tone === 'warn' ? 'var(--color-warn)'
      : tone === 'bad' ? 'var(--color-bad)'
      : null
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[11px] transition ' +
        (active
          ? 'border-accent-line bg-accent-soft text-accent-strong'
          : 'border-line bg-panel text-muted hover:text-text')
      }
    >
      {dot && <span className="status-dot" style={{ background: dot }} />}
      {label}
    </button>
  )
}

// ── eval row ──────────────────────────────────────────────────────────────
function EvalRow({
  detail, patientName,
}: {
  detail: ScanDetail
  patientName?: string
}) {
  const nav = useNavigate()
  const det: Detection | null = detail.detection
  const sevPct = det ? Math.round((det.severity_score ?? 0) * 100) : null
  const tone =
    sevPct == null ? 'muted'
      : sevPct < 20 ? 'good'
      : sevPct < 80 ? 'warn'
      : 'bad'
  const toneColor =
    tone === 'good' ? 'var(--color-good)'
      : tone === 'warn' ? 'var(--color-warn)'
      : tone === 'bad' ? 'var(--color-bad)'
      : 'var(--color-muted)'
  const scenarioPill: Record<ScenarioTag, string> = {
    healthy: 'pill-good', inf70: 'pill-warn', inf80: 'pill-bad',
  }
  const scenarioLabel: Record<ScenarioTag, string> = {
    healthy: '정상', inf70: '염증 70%', inf80: '염증 80%',
  }
  return (
    <tr onClick={() => nav(`/scans/${detail.id}`)}>
      <td><span className="num text-muted">scan/{detail.id}</span></td>
      <td>
        <Link
          to={`/patients/${detail.patient_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-text-strong hover:text-accent-strong"
        >
          {patientName ?? `patient ${detail.patient_id}`}
        </Link>
      </td>
      <td><span className="num text-muted">{detail.scan_date}</span></td>
      <td><span className={`pill ${scenarioPill[detail.scenario_tag]}`}>{scenarioLabel[detail.scenario_tag]}</span></td>
      <td>
        <span className="num font-semibold" style={{ color: toneColor }}>
          {sevPct == null ? '—' : `${sevPct}%`}
        </span>
      </td>
      <td>
        <span className="num text-text">
          {det ? det.candidate_residual.toFixed(3) : '—'}
        </span>
      </td>
      <td>
        <span className="num text-muted">
          {det ? `#${det.candidate_recv_idx}` : '—'}
        </span>
      </td>
      <td>
        <span className="font-mono text-[10.5px] text-muted">
          {det?.model_version ?? '—'}
        </span>
      </td>
      <td className="text-right">
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-faint" />
      </td>
    </tr>
  )
}

// ── loading ───────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="skeleton h-7 w-[260px]" />
      <div className="skeleton mt-2 h-3 w-[180px]" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-[200px]" />)}
      </div>
      <div className="mt-6 space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-9" />)}
      </div>
    </div>
  )
}
