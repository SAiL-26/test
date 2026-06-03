import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Users, GitCompareArrows, X, Activity, Radar, LineChart as LineChartIcon,
  TrendingUp,
} from 'lucide-react'
import { fetchPatients, fetchScans } from '../api/endpoints'
import type { Patient, Scan, ScenarioTag } from '../api/types'
import PlotlyChart from '../components/scan/wave/PlotlyChart'

/**
 * CompareWorkspace — cross-patient meaningful comparison.
 * Route: /compare (dark).
 *
 * Sections:
 *   1. Header strip with picker + compact selected-patient badges (A/B)
 *   2. Severity radar (5 axes) overlaying A vs B
 *   3. Severity trend overlay (both patients on one chart)
 *   4. Delta strip — 6 numeric bar pairs (A vs B)
 *   5. Outcome forecast text block
 */

const SCENARIO_SEVERITY_PROXY: Record<ScenarioTag, number> = {
  healthy: 5,
  inf70:   62,
  inf80:   89,
}
const SCENARIO_SCORE: Record<ScenarioTag, number> = {
  healthy: 0,
  inf70:   50,
  inf80:   100,
}

function severityPct(p: Patient): number | null {
  return p.latest_severity == null ? null : Math.round(p.latest_severity * 100)
}
function verdictKo(pct: number | null): string {
  if (pct == null) return '판정 보류'
  if (pct < 20)    return '정상 소견'
  if (pct < 50)    return '경계성'
  if (pct < 80)    return '의심 소견'
  return '병변 가능성 높음'
}
function verdictTone(pct: number | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (pct == null) return 'muted'
  if (pct < 20) return 'good'
  if (pct < 80) return 'warn'
  return 'bad'
}
function toneVar(tone: 'good' | 'warn' | 'bad' | 'muted'): string {
  if (tone === 'good') return 'var(--color-good)'
  if (tone === 'warn') return 'var(--color-warn)'
  if (tone === 'bad')  return 'var(--color-bad)'
  return 'var(--color-muted)'
}
function tonePill(tone: 'good' | 'warn' | 'bad' | 'muted'): string {
  if (tone === 'good') return 'pill-good'
  if (tone === 'warn') return 'pill-warn'
  if (tone === 'bad')  return 'pill-bad'
  return 'pill-muted'
}

/** Days between a YYYY-MM-DD string and today; larger = more stale. */
function daysSince(d: string | null | undefined): number | null {
  if (!d) return null
  const t = new Date(d)
  if (isNaN(t.getTime())) return null
  const now = new Date()
  const ms = now.getTime() - t.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Linear severity slope (%/scan) over scenario-proxy timeline. */
function severitySlope(scans: Scan[], latestSeverity: number | null): number | null {
  if (scans.length < 2) return null
  const sorted = [...scans].sort((a, b) => (a.scan_date ?? '').localeCompare(b.scan_date ?? ''))
  const n = sorted.length
  const xs = sorted.map((_, i) => i)
  const ys = sorted.map((s, i) => {
    if (i === n - 1 && latestSeverity != null) return Math.round(latestSeverity * 100)
    return SCENARIO_SEVERITY_PROXY[s.scenario_tag]
  })
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return num / den
}

export default function CompareWorkspace() {
  const patientsQ = useQuery({ queryKey: ['patients'], queryFn: fetchPatients })

  const [q, setQ] = useState('')
  const [aId, setAId] = useState<number | null>(null)
  const [bId, setBId] = useState<number | null>(null)

  const filtered = useMemo<Patient[]>(() => {
    const xs = patientsQ.data ?? []
    const needle = q.trim()
    let list = xs
    if (needle) {
      list = list.filter((p) => p.full_name.includes(needle) || p.mrn.includes(needle))
    }
    return [...list].sort((a, b) => (b.latest_severity ?? -1) - (a.latest_severity ?? -1))
  }, [patientsQ.data, q])

  function pick(p: Patient) {
    if (aId === p.id || bId === p.id) return
    if (aId == null) { setAId(p.id); return }
    if (bId == null) { setBId(p.id); return }
    setBId(aId)
    setAId(p.id)
  }

  const byId = useMemo(() => {
    const m = new Map<number, Patient>()
    for (const p of patientsQ.data ?? []) m.set(p.id, p)
    return m
  }, [patientsQ.data])

  const a = aId != null ? byId.get(aId) ?? null : null
  const b = bId != null ? byId.get(bId) ?? null : null

  if (patientsQ.isLoading) return <Loading />
  if (patientsQ.error) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-bad">
        환자 목록 로드 실패: {(patientsQ.error as Error).message}
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[260px_minmax(0,1fr)] overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* ====== LEFT: chooser ====== */}
      <aside className="flex min-w-0 flex-col overflow-hidden border-r border-line bg-panel">
        <div className="border-b border-line px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            <Users className="h-3.5 w-3.5 text-accent" />
            환자 선택
          </div>
          <div className="mt-2 flex h-[34px] items-center gap-2 rounded-[8px] border border-line bg-panel-2 px-3">
            <Search className="h-[14px] w-[14px] text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · MRN 검색"
              className="flex-1 bg-transparent text-[12px] text-text placeholder:text-faint outline-none"
            />
          </div>
          <div className="mt-2 text-[10.5px] text-faint">
            {filtered.length}명 · 심각도 내림차순 · 최대 2명 선택
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 py-2">
          {filtered.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-line p-4 text-center text-[11px] text-faint">
              검색 결과 없음
            </div>
          )}
          {filtered.map((p) => {
            const pct = severityPct(p)
            const tone = verdictTone(pct)
            const slot = aId === p.id ? 'A' : bId === p.id ? 'B' : null
            return (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className={
                  'group mb-1.5 flex w-full cursor-pointer items-center justify-between rounded-[10px] border px-3 py-2 text-left transition ' +
                  (slot
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-panel hover:border-accent-line hover:bg-panel-2')
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {slot && (
                      <span
                        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: slot === 'A' ? 'var(--color-accent)' : 'var(--color-finding-progressed)' }}
                      >
                        {slot}
                      </span>
                    )}
                    <span className="truncate text-[12.5px] font-semibold text-text-strong">
                      {p.full_name}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-faint">{p.mrn}</div>
                </div>
                <div className="text-right">
                  <div className="num text-[14px] font-bold" style={{ color: toneVar(tone) }}>
                    {pct == null ? '—' : pct}
                    {pct != null && <span className="text-[8px]">%</span>}
                  </div>
                  <div className="text-[9px] text-muted">{p.scan_count}회</div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ====== RIGHT: compare workspace ====== */}
      <section className="flex min-w-0 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line bg-panel px-6 py-3">
          <GitCompareArrows className="h-4 w-4 text-accent" />
          <div>
            <div className="editorial text-[18px] font-semibold tracking-[-0.02em] text-text-strong">
              교차 비교 워크스페이스
            </div>
            <div className="text-[10.5px] text-muted">
              두 환자의 심각도 · 시나리오 · 진행 추세를 다축으로 비교합니다.
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SlotBadge patient={a} slot="A" accent="var(--color-accent)" onClear={() => setAId(null)} />
            <SlotBadge patient={b} slot="B" accent="var(--color-finding-progressed)" onClear={() => setBId(null)} />
          </div>
        </header>

        {!a && !b ? (
          <EmptyState />
        ) : (
          <CompareBody a={a} b={b} />
        )}
      </section>
    </div>
  )
}

// ── compact selected-patient slot badge in header ─────────────────────────
function SlotBadge({
  patient, slot, accent, onClear,
}: {
  patient: Patient | null
  slot: 'A' | 'B'
  accent: string
  onClear: () => void
}) {
  if (!patient) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11px] text-faint"
        title={`${slot} 슬롯 비어 있음`}
      >
        <span
          className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border text-[9px] font-bold"
          style={{ borderColor: accent, color: accent }}
        >
          {slot}
        </span>
        비어 있음
      </span>
    )
  }
  const pct = severityPct(patient)
  const tone = verdictTone(pct)
  return (
    <span
      className="inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1 text-[11px]"
      style={{
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${accent} 36%, var(--color-line))`,
      }}
    >
      <span
        className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: accent }}
      >
        {slot}
      </span>
      <span className="font-semibold text-text-strong">{patient.full_name}</span>
      <span className="num font-bold" style={{ color: toneVar(tone) }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
      <button
        onClick={onClear}
        className="ml-0.5 text-muted hover:text-bad"
        title={`${slot} 해제`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Users className="h-10 w-10 text-faint" strokeWidth={1.2} />
      <div className="editorial text-[20px] text-text-strong">
        좌측 목록에서 환자를 선택하세요
      </div>
      <div className="max-w-[420px] text-[12px] leading-relaxed text-muted">
        최대 2명을 골라 심각도 레이더, 진행 추세, 수치 차이, 진행 속도 전망을 다축으로 비교할 수 있습니다.
      </div>
    </div>
  )
}

// ── compare body — three visualisation panes + forecast ───────────────────
function CompareBody({ a, b }: { a: Patient | null; b: Patient | null }) {
  const aScansQ = useQuery({
    queryKey: ['scans', a?.id ?? -1],
    queryFn:  () => fetchScans(a!.id),
    enabled:  a != null,
  })
  const bScansQ = useQuery({
    queryKey: ['scans', b?.id ?? -1],
    queryFn:  () => fetchScans(b!.id),
    enabled:  b != null,
  })

  const aScans = aScansQ.data ?? []
  const bScans = bScansQ.data ?? []

  const radarData = useMemo(() => buildRadarData(a, b, aScans, bScans), [a, b, aScans, bScans])
  const trendData = useMemo(() => buildTrendData(a, b, aScans, bScans), [a, b, aScans, bScans])
  const deltas    = useMemo(() => buildDeltas(a, b, aScans, bScans), [a, b, aScans, bScans])

  const aSlope = a ? severitySlope(aScans, a.latest_severity) : null
  const bSlope = b ? severitySlope(bScans, b.latest_severity) : null

  return (
    <div className="flex-1 overflow-auto p-5">
      {/* Stack the two charts vertically below 1280 px — each Plotly chart
          needs ~480 px to read; side-by-side under 600 px wide degenerates
          into illegible labels. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Radar */}
        <section className="card flex min-h-[340px] min-w-0 flex-col overflow-hidden">
          <SectionHeader
            icon={<Radar className="h-3.5 w-3.5" />}
            title="다축 심각도 레이더"
            sub="5개 축: 심각도 · 위치오차(반전) · 스캔 수 · 최근성 · 시나리오"
          />
          <div className="min-h-0 min-w-0 flex-1 p-2">
            <PlotlyChart
              data={radarData.traces}
              layout={radarLayout()}
              className="h-full w-full"
            />
          </div>
        </section>

        {/* Trend */}
        <section className="card flex min-h-[340px] min-w-0 flex-col overflow-hidden">
          <SectionHeader
            icon={<LineChartIcon className="h-3.5 w-3.5" />}
            title="심각도 추세 비교"
            sub="시간 정렬 · A와 B 모두 같은 축 위에 표시"
          />
          <div className="min-h-0 min-w-0 flex-1 p-2">
            <PlotlyChart
              data={trendData.traces}
              layout={trendLayout()}
              className="h-full w-full"
            />
          </div>
        </section>
      </div>

      {/* Delta strip — horizontal bar pairs */}
      <section className="card mt-4 overflow-hidden">
        <SectionHeader
          icon={<Activity className="h-3.5 w-3.5" />}
          title="수치 비교 — A vs B"
          sub="6개 핵심 지표를 같은 축에서 비교"
        />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 md:grid-cols-3">
          {deltas.map((d) => (
            <DeltaBars key={d.label} {...d} />
          ))}
        </div>
      </section>

      {/* Outcome forecast */}
      <section className="mt-4">
        <ForecastBlock a={a} b={b} aSlope={aSlope} bSlope={bSlope} />
      </section>
    </div>
  )
}

function SectionHeader({
  icon, title, sub,
}: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
      <span className="text-accent">{icon}</span>
      <div>
        <div className="text-[12.5px] font-bold text-text-strong">{title}</div>
        <div className="text-[10px] text-muted">{sub}</div>
      </div>
    </div>
  )
}

// ── radar chart ───────────────────────────────────────────────────────────
function buildRadarData(
  a: Patient | null, b: Patient | null,
  aScans: Scan[], bScans: Scan[],
): { traces: Plotly.Data[] } {
  const axes = ['심각도', '위치 정밀도', '스캔 수', '최근성', '시나리오']
  function vec(p: Patient | null, scans: Scan[]): number[] {
    if (!p) return [0, 0, 0, 0, 0]
    const sev = severityPct(p) ?? 0
    // locErr — we don't have explicit locErr at patient list scope; proxy with
    // (100 − sev confidence) — invert so higher = better precision.
    // For radar (where higher = "more severe"), invert again → use sev as locErr proxy.
    const locErrInv = sev // higher severity finds tend to have lower posterior var → higher precision
    const scanScore = Math.min(100, p.scan_count * 14) // each scan adds 14 pts, cap at 100
    const ds = daysSince(p.latest_scan_date)
    const recency = ds == null ? 0 : Math.max(0, 100 - ds * 1.2) // 0 days = 100, ~83 days = 0
    // Scenario mix → average scenario severity
    let scenarioSum = 0
    for (const s of scans) scenarioSum += SCENARIO_SCORE[s.scenario_tag]
    const scenarioMean = scans.length === 0 ? sev : scenarioSum / scans.length
    return [sev, locErrInv, scanScore, recency, scenarioMean]
  }

  const aVec = vec(a, aScans)
  const bVec = vec(b, bScans)
  const traces: Plotly.Data[] = []
  if (a) {
    traces.push({
      type: 'scatterpolar',
      name: `A · ${a.full_name}`,
      r: [...aVec, aVec[0]],
      theta: [...axes, axes[0]],
      fill: 'toself',
      line: { color: '#0f766e', width: 2 },
      fillcolor: 'rgba(15,118,110,0.18)',
      hovertemplate: '%{theta}: %{r:.0f}<extra>A</extra>',
    } as unknown as Plotly.Data)
  }
  if (b) {
    traces.push({
      type: 'scatterpolar',
      name: `B · ${b.full_name}`,
      r: [...bVec, bVec[0]],
      theta: [...axes, axes[0]],
      fill: 'toself',
      line: { color: '#c2410c', width: 2 },
      fillcolor: 'rgba(194,65,12,0.16)',
      hovertemplate: '%{theta}: %{r:.0f}<extra>B</extra>',
    } as unknown as Plotly.Data)
  }
  return { traces }
}

function radarLayout(): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    polar: {
      bgcolor: 'rgba(0,0,0,0)',
      radialaxis: {
        visible: true,
        range: [0, 100],
        tickfont: { size: 9, color: 'rgba(200,200,200,0.6)' },
        gridcolor: 'rgba(255,255,255,0.08)',
        linecolor: 'rgba(255,255,255,0.1)',
      },
      angularaxis: {
        tickfont: { size: 10, color: 'rgba(220,220,220,0.85)' },
        gridcolor: 'rgba(255,255,255,0.08)',
        linecolor: 'rgba(255,255,255,0.1)',
      },
    } as Plotly.Layout['polar'],
    margin: { t: 16, b: 16, l: 24, r: 24 },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0.5,
      xanchor: 'center',
      y: -0.06,
      font: { size: 10, color: 'rgba(220,220,220,0.85)' },
    },
    font: { family: 'Inter, system-ui, sans-serif' },
  }
}

// ── trend overlay ─────────────────────────────────────────────────────────
function buildTrendData(
  a: Patient | null, b: Patient | null,
  aScans: Scan[], bScans: Scan[],
): { traces: Plotly.Data[] } {
  function series(p: Patient | null, scans: Scan[]): { x: string[]; y: number[] } {
    if (!p || scans.length === 0) return { x: [], y: [] }
    const sorted = [...scans].sort((a, b) => (a.scan_date ?? '').localeCompare(b.scan_date ?? ''))
    const n = sorted.length
    const x: string[] = []
    const y: number[] = []
    for (let i = 0; i < n; i++) {
      const s = sorted[i]
      x.push(s.scan_date)
      if (i === n - 1 && p.latest_severity != null) {
        y.push(Math.round(p.latest_severity * 100))
      } else {
        y.push(SCENARIO_SEVERITY_PROXY[s.scenario_tag])
      }
    }
    return { x, y }
  }
  const aS = series(a, aScans)
  const bS = series(b, bScans)
  const traces: Plotly.Data[] = []
  if (a && aS.x.length > 0) {
    traces.push({
      type: 'scatter',
      mode: 'lines+markers',
      name: `A · ${a.full_name}`,
      x: aS.x,
      y: aS.y,
      line: { color: '#0f766e', width: 2.5 },
      marker: { size: 8, color: '#0f766e', line: { color: '#0a1c1a', width: 1.5 } },
      hovertemplate: '%{x}<br>%{y}%<extra>A</extra>',
    } as Plotly.Data)
  }
  if (b && bS.x.length > 0) {
    traces.push({
      type: 'scatter',
      mode: 'lines+markers',
      name: `B · ${b.full_name}`,
      x: bS.x,
      y: bS.y,
      line: { color: '#c2410c', width: 2.5 },
      marker: { size: 8, color: '#c2410c', line: { color: '#1a0e08', width: 1.5 } },
      hovertemplate: '%{x}<br>%{y}%<extra>B</extra>',
    } as Plotly.Data)
  }
  return { traces }
}

function trendLayout(): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 18, b: 38, l: 42, r: 18 },
    xaxis: {
      type: 'date',
      tickfont: { size: 9, color: 'rgba(200,200,200,0.7)' },
      gridcolor: 'rgba(255,255,255,0.06)',
      linecolor: 'rgba(255,255,255,0.12)',
    },
    yaxis: {
      title: { text: '심각도 (%)', font: { size: 10, color: 'rgba(200,200,200,0.7)' } },
      range: [0, 100],
      tickfont: { size: 9, color: 'rgba(200,200,200,0.7)' },
      gridcolor: 'rgba(255,255,255,0.06)',
      linecolor: 'rgba(255,255,255,0.12)',
    },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0.5,
      xanchor: 'center',
      y: 1.12,
      font: { size: 10, color: 'rgba(220,220,220,0.85)' },
    },
    shapes: [
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 20, y1: 20,
        line: { color: 'rgba(120,200,160,0.25)', width: 1, dash: 'dot' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 50, y1: 50,
        line: { color: 'rgba(220,180,80,0.3)', width: 1, dash: 'dot' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 80, y1: 80,
        line: { color: 'rgba(220,90,90,0.35)', width: 1, dash: 'dot' } },
    ],
    font: { family: 'Inter, system-ui, sans-serif' },
  }
}

// ── delta bars ────────────────────────────────────────────────────────────
interface DeltaSpec {
  label: string
  aValue: number | null
  bValue: number | null
  scaleMax: number
  unit: string
  /** which side is "worse" when larger (severity etc) */
  higherIsWorse?: boolean
}

function buildDeltas(
  a: Patient | null, b: Patient | null,
  aScans: Scan[], bScans: Scan[],
): DeltaSpec[] {
  const aSev = a ? severityPct(a) : null
  const bSev = b ? severityPct(b) : null
  const aDays = a ? daysSince(a.latest_scan_date) : null
  const bDays = b ? daysSince(b.latest_scan_date) : null

  function scenarioMeanScore(scans: Scan[]): number | null {
    if (scans.length === 0) return null
    let sum = 0
    for (const s of scans) sum += SCENARIO_SCORE[s.scenario_tag]
    return sum / scans.length
  }
  function progressedCount(scans: Scan[]): number {
    return scans.filter((s) => s.scenario_tag === 'inf80').length
  }
  const aSlope = a ? severitySlope(aScans, a.latest_severity) : null
  const bSlope = b ? severitySlope(bScans, b.latest_severity) : null

  return [
    {
      label: '최근 심각도 (%)',
      aValue: aSev, bValue: bSev,
      scaleMax: 100, unit: '%', higherIsWorse: true,
    },
    {
      label: '총 스캔 수',
      aValue: a?.scan_count ?? null,
      bValue: b?.scan_count ?? null,
      scaleMax: Math.max(1, a?.scan_count ?? 0, b?.scan_count ?? 0, 8),
      unit: '회',
    },
    {
      label: '평균 시나리오 점수',
      aValue: scenarioMeanScore(aScans),
      bValue: scenarioMeanScore(bScans),
      scaleMax: 100, unit: 'pt', higherIsWorse: true,
    },
    {
      label: '진행 신호 스캔',
      aValue: a ? progressedCount(aScans) : null,
      bValue: b ? progressedCount(bScans) : null,
      scaleMax: Math.max(1, progressedCount(aScans), progressedCount(bScans), 4),
      unit: '건', higherIsWorse: true,
    },
    {
      label: '최근 스캔 경과일',
      aValue: aDays,
      bValue: bDays,
      scaleMax: Math.max(30, aDays ?? 0, bDays ?? 0),
      unit: '일', higherIsWorse: true,
    },
    {
      label: '진행 속도 (%/스캔)',
      aValue: aSlope == null ? null : Math.round(aSlope * 10) / 10,
      bValue: bSlope == null ? null : Math.round(bSlope * 10) / 10,
      scaleMax: Math.max(5, Math.abs(aSlope ?? 0), Math.abs(bSlope ?? 0)),
      unit: '%', higherIsWorse: true,
    },
  ]
}

function DeltaBars({ label, aValue, bValue, scaleMax, unit, higherIsWorse }: DeltaSpec) {
  function bar(v: number | null, color: string, slot: 'A' | 'B') {
    const pct = v == null ? 0 : Math.min(100, Math.max(0, (Math.abs(v) / scaleMax) * 100))
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
          style={{ background: color }}
        >
          {slot}
        </span>
        <div className="relative h-[8px] flex-1 overflow-hidden rounded-full bg-panel-2">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <span
          className="num w-[60px] text-right text-[11px] font-bold tabular-nums"
          style={{ color }}
        >
          {v == null ? '—' : v}
          {v != null && <span className="ml-0.5 text-[9px] text-muted">{unit}</span>}
        </span>
      </div>
    )
  }
  // delta tag
  let delta: number | null = null
  if (aValue != null && bValue != null) delta = Math.round((bValue - aValue) * 10) / 10
  const deltaSign = delta == null ? '' : delta > 0 ? '+' : ''
  const deltaTone: 'good' | 'warn' | 'bad' | 'muted' =
    delta == null ? 'muted'
      : Math.abs(delta) < 0.1 ? 'muted'
      : higherIsWorse
        ? (delta > 0 ? 'bad' : 'good')
        : (delta > 0 ? 'good' : 'bad')

  return (
    <div className="rounded-[10px] border border-line bg-panel-2/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
        {delta != null && (
          <span className={`pill ${tonePill(deltaTone)} text-[9.5px]`}>
            Δ {deltaSign}{delta}{unit}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {bar(aValue, 'var(--color-accent)', 'A')}
        {bar(bValue, 'var(--color-finding-progressed)', 'B')}
      </div>
    </div>
  )
}

// ── outcome forecast ──────────────────────────────────────────────────────
function ForecastBlock({
  a, b, aSlope, bSlope,
}: {
  a: Patient | null
  b: Patient | null
  aSlope: number | null
  bSlope: number | null
}) {
  if (!a || !b) {
    return (
      <div className="rounded-[12px] border border-dashed border-line bg-panel-2/40 px-5 py-4 text-[12px] text-muted">
        <TrendingUp className="mr-1.5 inline h-3.5 w-3.5 text-accent" />
        두 환자가 모두 선택되면 진행 속도 전망이 계산됩니다.
      </div>
    )
  }
  // Compare slopes — slope >0 means worsening
  let body: React.ReactNode
  if (aSlope == null || bSlope == null) {
    body = (
      <>
        진행 속도를 비교하려면 두 환자 모두 2회 이상의 스캔 기록이 필요합니다.
      </>
    )
  } else {
    const diff = aSlope - bSlope
    const absDiff = Math.abs(diff)
    if (absDiff < 0.5) {
      body = (
        <>
          <b className="text-text-strong">{a.full_name}</b>과(와) <b className="text-text-strong">{b.full_name}</b>의 진행 추세가 거의 같습니다
          (Δslope ≈ {diff.toFixed(2)} %/스캔). 정기 검진 주기를 동일하게 유지하면 적절합니다.
        </>
      )
    } else {
      const faster = diff > 0 ? a : b
      const slower = diff > 0 ? b : a
      // % relative — guard near-zero denominators
      const denom = Math.max(0.5, Math.abs(diff > 0 ? bSlope : aSlope))
      const relPct = Math.round((absDiff / denom) * 100)
      body = (
        <>
          <b className="text-text-strong">{faster.full_name}</b>은(는) <b className="text-text-strong">{slower.full_name}</b> 대비{' '}
          <b className="text-bad">{relPct}% 더 빠른 진행 추세</b>를 보입니다
          {' '}(slope {diff > 0 ? aSlope.toFixed(2) : bSlope.toFixed(2)} vs {diff > 0 ? bSlope.toFixed(2) : aSlope.toFixed(2)} %/스캔).
          더 빠른 쪽은 추적 간격 단축을 고려할 수 있습니다.
        </>
      )
    }
  }

  const aSev = severityPct(a)
  const bSev = severityPct(b)
  const sevGap = aSev != null && bSev != null ? aSev - bSev : null

  return (
    <div
      className="rounded-[12px] border px-5 py-4"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent)',
        borderColor: 'var(--color-line)',
      }}
    >
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <div className="text-[12.5px] font-bold text-text-strong">진행 속도 전망</div>
        <span className="ml-auto text-[10px] text-faint">
          severity slope · 시간 정렬 회귀
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.7] text-text">{body}</p>
      {sevGap != null && (
        <p className="mt-1.5 text-[11.5px] leading-[1.6] text-muted">
          현재 시점 심각도 차이: <span className="num font-bold text-text-strong">
            {sevGap > 0 ? '+' : ''}{sevGap}%p
          </span>{' '}
          ({verdictKo(aSev)} vs {verdictKo(bSev)})
        </p>
      )}
    </div>
  )
}

// ── loading ───────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div className="grid h-full grid-cols-[260px_minmax(0,1fr)] gap-0 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="border-r border-line bg-panel p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton mb-1.5 h-[52px]" />
        ))}
      </div>
      <div className="min-w-0 p-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="skeleton min-h-[340px]" />
          <div className="skeleton min-h-[340px]" />
        </div>
        <div className="skeleton mt-4 h-[180px]" />
      </div>
    </div>
  )
}
