/** TimelineView — Phase 7 (severity trend + multi-scan compare).
 *  Route: /patients/:id/timeline. Severity over time + scan cards + KPI
 *  delta + next-scan recommendation. Mirrors console/timeline.jsx. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Activity, AlertCircle, ChevronLeft, ChevronRight, Clock,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { fetchPatient, fetchScan, fetchScans } from '../api/endpoints'
import type { Patient, Scan, ScanDetail, ScenarioTag } from '../api/types'
import PlotlyChart from '../components/scan/wave/PlotlyChart'
import { WAVE_COLORS, basePlotlyLayout } from '../lib/wavePalette'

type Tone = 'good' | 'warn' | 'bad' | 'muted'
interface Verdict { label: string; ko: string; tone: Tone }

function verdict(pct: number | null): Verdict {
  if (pct == null) return { label: '—', ko: '판정 보류', tone: 'muted' }
  if (pct < 20) return { label: 'NEGATIVE',        ko: '정상 소견',        tone: 'good' }
  if (pct < 50) return { label: 'EQUIVOCAL',       ko: '경계성',           tone: 'warn' }
  if (pct < 80) return { label: 'SUSPICIOUS',      ko: '의심 소견',        tone: 'warn' }
  return         { label: 'PROBABLE LESION', ko: '병변 가능성 높음', tone: 'bad'  }
}

const TONE_VAR: Record<Tone, string> = {
  good: 'var(--color-good)', warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',   muted: 'var(--color-muted)',
}
const TONE_PILL: Record<Tone, string> = {
  good: 'pill-good', warn: 'pill-warn', bad: 'pill-bad', muted: 'pill-muted',
}

const SCENARIO_LABEL: Record<ScenarioTag, string> = {
  healthy: '정상',
  inf70:   '염증 70%',
  inf80:   '염증 80%',
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

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

function fmtInterval(days: number): string {
  if (days <= 0) return '동일 일자'
  if (days < 31) return `${days}일`
  const m = Math.round(days / 30)
  if (m < 12) return `약 ${m}개월`
  const y = (days / 365.25).toFixed(1)
  return `약 ${y}년`
}

// ── timeline point assembled from Scan + ScanDetail ──────────────────
interface TimelinePoint {
  scanId: number
  date: string
  severity: number | null   // 0..1
  pct: number | null
  scenario: ScenarioTag
  toothLabel: string | null
  detail: ScanDetail | null
}

// PHASE 7 stub: enhance with /api/wave/timeline endpoint when ready
// — derive a tooth label from the detection coords when we don't yet
// have a stored FDI tooth number. The estimate vector is mm in scan
// frame, so we just surface coords as a fallback.
function deriveToothLabel(d: ScanDetail): string | null {
  if (!d.detection) return null
  const det = d.detection
  if (Number.isFinite(det.estimate_x_mm) && Number.isFinite(det.estimate_y_mm)) {
    return `est. ${det.estimate_x_mm.toFixed(1)}, ${det.estimate_y_mm.toFixed(1)} mm`
  }
  return null
}

// ── Severity trend chart (Plotly) ────────────────────────────────────
function SeverityTrendChart({ points }: { points: TimelinePoint[] }) {
  const realPoints = useMemo(
    () => points.filter((p) => p.pct != null) as Array<TimelinePoint & { pct: number }>,
    [points],
  )

  // Project a recommended next-scan date using a simple linear slope
  // over the last two points. Falls back to +12 weeks when the trend
  // is flat or downward (per spec: 다음 권고 시기).
  const projection = useMemo(() => {
    if (realPoints.length < 2) return null
    const last = realPoints[realPoints.length - 1]
    const prev = realPoints[realPoints.length - 2]
    const dDays = Math.max(1, daysBetween(prev.date, last.date))
    const slope = (last.pct - prev.pct) / dDays  // %p / day
    // pick weeks ahead based on slope magnitude: steep up → sooner
    let weeks = 12
    if (slope >= 0.25) weeks = 4
    else if (slope >= 0.1) weeks = 8
    else if (slope <= -0.1) weeks = 16
    const proj = new Date(last.date)
    proj.setDate(proj.getDate() + weeks * 7)
    const isoDate = proj.toISOString().slice(0, 10)
    return { date: isoDate, weeks, slope, fromPct: last.pct }
  }, [realPoints])

  const traces = useMemo(() => {
    if (realPoints.length === 0) return [] as Plotly.Data[]
    const xs = realPoints.map((p) => p.date)
    const ys = realPoints.map((p) => p.pct)
    const TONE_HEX: Record<Tone, string> = {
      good: WAVE_COLORS.good, warn: WAVE_COLORS.warn,
      bad:  WAVE_COLORS.bad,  muted: WAVE_COLORS.muted,
    }
    const markerColors = realPoints.map((p) => TONE_HEX[verdict(p.pct).tone])
    const out: Plotly.Data[] = [{
      type: 'scatter', mode: 'lines+markers', x: xs, y: ys,
      line: { color: WAVE_COLORS.findingHi, width: 2.5, shape: 'linear' },
      marker: { color: markerColors, size: 12, line: { color: WAVE_COLORS.surface, width: 3 } },
      hovertemplate: '%{x}<br>심각도 <b>%{y}%</b><extra></extra>',
      name: 'severity',
    } as unknown as Plotly.Data]
    if (projection) {
      out.push({
        type: 'scatter', mode: 'lines+markers',
        x: [xs[xs.length - 1], projection.date],
        y: [ys[ys.length - 1], projection.fromPct],
        line: { color: WAVE_COLORS.muted, width: 1.6, dash: 'dash' },
        marker: { color: 'rgba(0,0,0,0)', size: [0, 10],
                  line: { color: WAVE_COLORS.muted, width: 1.5, dash: 'dot' } },
        hovertemplate: '권고 재스캔 %{x}<extra></extra>', showlegend: false,
      } as unknown as Plotly.Data)
    }
    return out
  }, [realPoints, projection])

  const layout = useMemo<Partial<Plotly.Layout>>(() => {
    const base = basePlotlyLayout()
    let xRange: [string, string] | undefined
    if (realPoints.length > 0) {
      const first = new Date(realPoints[0].date)
      const lastDateSrc = projection?.date ?? realPoints[realPoints.length - 1].date
      const last = new Date(lastDateSrc)
      const padMs = Math.max(2 * 86_400_000, (last.getTime() - first.getTime()) * 0.06)
      xRange = [
        new Date(first.getTime() - padMs).toISOString().slice(0, 10),
        new Date(last.getTime() + padMs).toISOString().slice(0, 10),
      ]
    }
    const band = (y0: number, y1: number, hex: string): Partial<Plotly.Shape> => ({
      type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0, y1,
      fillcolor: hex, opacity: 0.06, line: { width: 0 }, layer: 'below',
    })
    const gridline = (y: number): Partial<Plotly.Shape> => ({
      type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: y, y1: y,
      line: { color: WAVE_COLORS.border, width: 1, dash: 'dot' }, layer: 'below',
    })
    const shapes: Partial<Plotly.Shape>[] = [
      band(0, 20, WAVE_COLORS.good),  band(20, 50, WAVE_COLORS.warn),
      band(50, 80, WAVE_COLORS.warn), band(80, 100, WAVE_COLORS.bad),
      gridline(20), gridline(50), gridline(80),
    ]
    const annotations: Partial<Plotly.Annotations>[] = (
      [[10, '정상', WAVE_COLORS.good], [65, '의심', WAVE_COLORS.warn],
       [90, '병변', WAVE_COLORS.bad]] as const
    ).map(([y, text, color]) => ({
      xref: 'paper', yref: 'y', x: 1, y, xanchor: 'left',
      text, font: { color, size: 10 }, showarrow: false,
    }))

    return {
      ...base,
      margin: { l: 48, r: 56, t: 14, b: 40 },
      hovermode: 'closest',
      xaxis: {
        ...base.xaxis,
        type: 'date',
        range: xRange,
        title: { text: '', font: { size: 10 } },
        tickformat: '%y-%m',
      },
      yaxis: {
        ...base.yaxis,
        title: { text: '심각도 (%)', font: { size: 11 } },
        range: [0, 100],
        dtick: 20,
      },
      shapes,
      annotations,
    } as Partial<Plotly.Layout>
  }, [realPoints, projection])

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {realPoints.length > 0 ? (
          <PlotlyChart data={traces} layout={layout} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            추세 데이터를 준비 중입니다…
          </div>
        )}
      </div>
      {projection && (
        <div className="mt-2 flex items-center justify-end gap-2 px-2 text-[11px] text-muted">
          <Clock className="h-3 w-3" />
          <span>다음 권고 재스캔</span>
          <span className="num text-text-strong">{projection.date}</span>
          <span className="text-faint">· 약 {projection.weeks}주 후</span>
        </div>
      )}
    </div>
  )
}

// ── Scan card (side panel) ───────────────────────────────────────────
function ScanCard({ point, isLatest, isBaseline }: {
  point: TimelinePoint
  isLatest?: boolean
  isBaseline?: boolean
}) {
  const v = verdict(point.pct)
  return (
    <Link
      to={`/scans/${point.scanId}`}
      className="card group flex flex-col gap-2 p-3 transition hover:border-accent-line"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLatest && <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">최신</span>}
          {isBaseline && !isLatest && <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">baseline</span>}
        </div>
        <span className={`pill ${TONE_PILL[v.tone]}`}>{v.ko}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="num text-[11px] text-muted">{point.date}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-text/85">{SCENARIO_LABEL[point.scenario]}</div>
          {point.toothLabel && (
            <div className="num mt-0.5 truncate text-[10.5px] text-faint">{point.toothLabel}</div>
          )}
        </div>
        <div className="text-right">
          <div className="num text-[26px] font-semibold leading-none tracking-tight" style={{ color: TONE_VAR[v.tone] }}>
            {point.pct != null ? point.pct : '—'}
            <span className="ml-0.5 text-[12px] font-normal text-muted">%</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-[10.5px] text-muted opacity-0 transition group-hover:opacity-100">
        <span>스캔 상세</span>
        <ChevronRight className="h-3 w-3" />
      </div>
    </Link>
  )
}

// ── KPI delta panel (first vs latest). `desirable` flags whether the
// observed trendDir is clinically good ('down' for severity / residual,
// 'neutral' for non-numeric rows like model version).
interface KpiRow {
  key: string; label: string; unit: string
  baseline: string; latest: string
  trendDir: 'up' | 'down' | 'flat'
  desirable: 'up' | 'down' | 'neutral'
}

function formatNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1e4 || (n !== 0 && Math.abs(n) < 1e-3)) return n.toExponential(2)
  return n.toFixed(digits)
}

function buildKpiRows(first: ScanDetail | null, last: ScanDetail | null): KpiRow[] {
  if (!first || !last || !first.detection || !last.detection) return []
  const df = first.detection, dl = last.detection
  const sevF = Math.round(df.severity_score * 100)
  const sevL = Math.round(dl.severity_score * 100)
  // PHASE 7 stub: enhance with /api/wave/timeline endpoint when ready.
  // locErr proxy = candidate_residual (no GT in stored detection payload).
  const locF = df.candidate_residual, locL = dl.candidate_residual
  const dir = (a: number, b: number): 'up' | 'down' | 'flat' =>
    b > a * 1.001 ? 'up' : b < a * 0.999 ? 'down' : 'flat'
  return [
    { key: 'sev',   label: '심각도',                unit: '%',
      baseline: String(sevF), latest: String(sevL),
      trendDir: dir(sevF, sevL), desirable: 'down' },
    { key: 'loc',   label: 'Localization residual', unit: '',
      baseline: formatNum(locF, 3), latest: formatNum(locL, 3),
      trendDir: dir(locF, locL), desirable: 'down' },
    { key: 'model', label: '모델 버전',             unit: '',
      baseline: df.model_version, latest: dl.model_version,
      trendDir: df.model_version === dl.model_version ? 'flat' : 'up',
      desirable: 'neutral' },
    { key: 'date',  label: '검사 일자',             unit: '',
      baseline: first.scan_date, latest: last.scan_date,
      trendDir: 'flat', desirable: 'neutral' },
  ]
}

function trendIcon(row: KpiRow) {
  if (row.trendDir === 'flat') return <Minus className="h-3.5 w-3.5 text-muted" />
  const good = (row.trendDir === row.desirable)
  const cls = row.desirable === 'neutral'
    ? 'text-muted'
    : good
      ? 'text-good'
      : 'text-bad'
  const Icon = row.trendDir === 'up' ? TrendingUp : TrendingDown
  return <Icon className={`h-3.5 w-3.5 ${cls}`} />
}

function KpiDeltaPanel({ first, last }: { first: ScanDetail | null; last: ScanDetail | null }) {
  const rows = useMemo(() => buildKpiRows(first, last), [first, last])
  if (rows.length === 0) {
    return (
      <div className="card flex h-full items-center justify-center p-4 text-[11.5px] text-muted">
        비교 가능한 검사 지표가 부족합니다.
      </div>
    )
  }
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
        <Activity className="h-3.5 w-3.5 text-accent" />
        <div className="text-[12px] font-semibold text-text-strong">기간 변화 요약</div>
        <div className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          baseline → latest
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-[12px] ${
              i < rows.length - 1 ? 'border-b border-line-soft' : ''
            }`}
          >
            <div className="text-muted">{row.label}</div>
            <div className="num text-right text-text/80">{row.baseline}{row.unit}</div>
            <div className="num text-right text-text-strong">{row.latest}{row.unit}</div>
            <div className="flex w-5 justify-end">{trendIcon(row)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lesion arch morph (R5b) ──────────────────────────────────────────
// SVG top-down view of the upper dental arch (16 teeth as ovals) with
// each scan's lesion estimate overlaid as a coloured circle. Circles
// fade in chronologically; older = faded blue, newer = saturated red,
// radius grows with severity. Lesion mm coords are mapped from scan
// frame extent (≈ 0..20 mm × 0..26 mm) into the arch viewport so the
// drift between scans is visible spatially as well as temporally.

interface LesionPoint {
  scanId: number
  date: string
  pct: number
  scenario: ScenarioTag
  xMm: number
  yMm: number
}

// upper arch curve sampled at 16 positions (FDI 17→11→27 sweep). Hand-
// tuned parabolic arch in the viewBox below, tooth #1 at the upper-left
// molar, tooth #16 at the upper-right molar, with the incisors at the
// front of the arch (smaller y).
// viewBox padded out so the largest lesion glow (radius ≈ 22 px) at the
// posterior molars never clips the edge — earlier 360×220 with cy≈180
// pushed glow to y≈202, leaving only 18 px of slack and visibly cropping
// on narrow laptop viewports.
const ARCH_VB_W = 400
const ARCH_VB_H = 260
// arch baseline params — centred horizontally, leaving ≥30 px padding on
// each side so molar ovals + rotation overshoot never reach the edge.
const ARCH_CY_BASE = 80
const ARCH_CY_DEPTH = 115
const ARCH_HALF_W = 150
const ARCH_TEETH: Array<{ fdi: string; cx: number; cy: number; rot: number; rx: number; ry: number }> =
  Array.from({ length: 16 }, (_, i) => {
    // parametrise along arch: t ∈ [-1, 1]
    const t = (i / 15) * 2 - 1
    const cx = ARCH_VB_W / 2 + t * ARCH_HALF_W
    // parabolic depth — incisors (t≈0) closest to front, molars deeper
    const cy = ARCH_CY_BASE + (t * t) * ARCH_CY_DEPTH
    const rot = t * 70  // degrees: tilt ovals along the arch tangent
    // molars (|t|→1) larger than incisors (t→0)
    const isMolar = Math.abs(t) > 0.5
    const rx = isMolar ? 13 : 8
    const ry = isMolar ? 16 : 13
    // FDI labels — upper right Q1 (17..11), upper left Q2 (21..27)
    const fdiNum = i < 8 ? 18 - i : i - 7 + 20  // 18..11, 21..28 → keep 16
    const fdi = String(fdiNum)
    return { fdi, cx, cy, rot, rx, ry }
  })

function severityHex(pct: number): string {
  // mix from accent blue (low) → warn amber → bad red (high)
  if (pct < 20) return WAVE_COLORS.good
  if (pct < 50) return WAVE_COLORS.warn
  if (pct < 80) return WAVE_COLORS.findingHi
  return WAVE_COLORS.bad
}

function ageHex(ageRatio: number): string {
  // 0 (oldest) → faded slate-blue, 1 (newest) → vivid red
  // linear blend in hex space between #5577AA and #FF3E5D
  const a = { r: 0x55, g: 0x77, b: 0xAA }
  const b = { r: 0xFF, g: 0x3E, b: 0x5D }
  const r = Math.round(a.r + (b.r - a.r) * ageRatio)
  const g = Math.round(a.g + (b.g - a.g) * ageRatio)
  const bl = Math.round(a.b + (b.b - a.b) * ageRatio)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

// Scan-frame extent (≈ 0..20 mm × 0..26 mm based on backend meta).
// The lesion centroid hovers around (15, 20) so we centre the mapped
// space on those typical coords and let drift fan out.
const SCAN_X_MIN = 12, SCAN_X_MAX = 19    // mm
const SCAN_Y_MIN = 18, SCAN_Y_MAX = 23    // mm

function mapToViewBox(xMm: number, yMm: number): { x: number; y: number } {
  const cx = ARCH_VB_W / 2
  const cy = ARCH_VB_H / 2  // arch centre depth
  const fx = (xMm - (SCAN_X_MIN + SCAN_X_MAX) / 2) / (SCAN_X_MAX - SCAN_X_MIN)
  const fy = (yMm - (SCAN_Y_MIN + SCAN_Y_MAX) / 2) / (SCAN_Y_MAX - SCAN_Y_MIN)
  // scale into a tight box around the arch centre so drift reads ~10–60 px
  return { x: cx + fx * 110, y: cy + fy * 70 }
}

function LesionArchMorph({ points }: { points: LesionPoint[] }) {
  // gate the chronological fade-in on a mount tick so each marker reveals
  // one step at a time. `revealCount` rises from 0 → points.length.
  const [revealCount, setRevealCount] = useState(0)
  useEffect(() => {
    setRevealCount(0)
    if (points.length === 0) return
    let cancelled = false
    const step = (i: number) => {
      if (cancelled) return
      setRevealCount(i)
      if (i < points.length) {
        window.setTimeout(() => step(i + 1), 220)
      }
    }
    window.setTimeout(() => step(1), 80)
    return () => { cancelled = true }
  }, [points])

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        병변 위치 데이터를 준비 중입니다…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
      {/* arch SVG — aspect-ratio guarantees a measurable height even when
          the flex parent has no explicit height (was collapsing to 0 px on
          some laptop widths, clipping the entire chart). max-w caps the
          rendered size on ultrawide monitors so it doesn't dominate the
          page. */}
      <div
        className="relative w-full min-w-0 flex-1 overflow-visible rounded-md border border-line bg-panel/40"
        style={{ aspectRatio: `${ARCH_VB_W} / ${ARCH_VB_H}`, maxWidth: 720 }}
      >
        <svg
          viewBox={`0 0 ${ARCH_VB_W} ${ARCH_VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
          style={{ overflow: 'visible' }}
        >
          {/* arch baseline guide */}
          <path
            d={`M 50 ${ARCH_CY_BASE + ARCH_CY_DEPTH} Q ${ARCH_VB_W / 2} ${ARCH_CY_BASE - 30} ${ARCH_VB_W - 50} ${ARCH_CY_BASE + ARCH_CY_DEPTH}`}
            fill="none"
            stroke={WAVE_COLORS.border}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          {/* teeth */}
          {ARCH_TEETH.map((t, i) => (
            <g key={i} transform={`rotate(${t.rot} ${t.cx} ${t.cy})`}>
              <ellipse
                cx={t.cx}
                cy={t.cy}
                rx={t.rx}
                ry={t.ry}
                fill={WAVE_COLORS.surface}
                stroke={WAVE_COLORS.border}
                strokeWidth={1}
              />
              <text
                x={t.cx}
                y={t.cy + 3}
                textAnchor="middle"
                fontSize={7}
                fill={WAVE_COLORS.muted}
                fontFamily="ui-monospace, monospace"
              >
                {t.fdi}
              </text>
            </g>
          ))}

          {/* anterior / posterior label */}
          <text x={ARCH_VB_W / 2} y={22} textAnchor="middle" fontSize={10}
                fill={WAVE_COLORS.muted} fontFamily="ui-monospace, monospace">
            anterior
          </text>
          <text x={ARCH_VB_W / 2} y={ARCH_VB_H - 10} textAnchor="middle" fontSize={10}
                fill={WAVE_COLORS.muted} fontFamily="ui-monospace, monospace">
            posterior
          </text>

          {/* drift trail connecting lesion centroids in order */}
          {points.length > 1 && (
            <polyline
              points={points
                .slice(0, Math.max(0, revealCount))
                .map((p) => {
                  const m = mapToViewBox(p.xMm, p.yMm)
                  return `${m.x},${m.y}`
                })
                .join(' ')}
              fill="none"
              stroke={WAVE_COLORS.muted}
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.55}
              style={{ transition: 'all 220ms ease-out' }}
            />
          )}

          {/* lesion markers, chronological */}
          {points.map((p, i) => {
            const m = mapToViewBox(p.xMm, p.yMm)
            const ageRatio = points.length === 1 ? 1 : i / (points.length - 1)
            const fill = ageHex(ageRatio)
            const stroke = severityHex(p.pct)
            // radius: 6 (low) … 18 (high) px
            const r = 6 + (p.pct / 100) * 12
            const visible = i < revealCount
            return (
              <g
                key={p.scanId}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'scale(1)' : 'scale(0.4)',
                  transformOrigin: `${m.x}px ${m.y}px`,
                  transition: 'opacity 280ms ease-out, transform 280ms cubic-bezier(0.2,0.9,0.3,1.3)',
                }}
              >
                <circle cx={m.x} cy={m.y} r={r + 4} fill={fill} opacity={0.18} />
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={r}
                  fill={fill}
                  fillOpacity={0.55}
                  stroke={stroke}
                  strokeWidth={1.6}
                />
                <text
                  x={m.x}
                  y={m.y + 3}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={600}
                  fill={WAVE_COLORS.text}
                  fontFamily="ui-monospace, monospace"
                >
                  {p.pct}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* legend / chronological timeline — wraps below the arch on narrow
          laptops (1024–1280 px) so it never overflows horizontally, and
          becomes a fixed-width column only at xl+ where there is space. */}
      <div className="flex w-full shrink-0 flex-col gap-1.5 xl:w-[200px]">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          시점별 색상 · 심각도
        </div>
        <ol className="flex flex-col gap-1 xl:max-h-none">
          {points.map((p, i) => {
            const ageRatio = points.length === 1 ? 1 : i / (points.length - 1)
            const fill = ageHex(ageRatio)
            const v = verdict(p.pct)
            const visible = i < revealCount
            return (
              <li
                key={p.scanId}
                className="flex items-center gap-2 rounded-md border border-line-soft bg-panel/40 px-2 py-1.5"
                style={{
                  opacity: visible ? 1 : 0.25,
                  transform: visible ? 'translateX(0)' : 'translateX(-6px)',
                  transition: 'opacity 280ms ease-out, transform 280ms ease-out',
                }}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: fill, border: `1.5px solid ${severityHex(p.pct)}` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="num text-[10.5px] text-text/85">{p.date}</div>
                  <div className="num text-[9.5px]" style={{ color: TONE_VAR[v.tone] }}>
                    {p.pct}% · {v.ko}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="mt-1 rounded-md border border-line-soft bg-panel/40 px-2 py-1.5 text-[10px] text-muted">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: ageHex(0) }} />
            <span>과거 시점</span>
            <span className="ml-auto inline-block h-2 w-2 rounded-full" style={{ background: ageHex(1) }} />
            <span>최근 시점</span>
          </div>
          <div className="mt-1 text-faint">
            원의 크기는 심각도, 위치는 추정 중심 좌표(x/y mm).
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────
export default function TimelineView() {
  const { id } = useParams<{ id: string }>()
  const pid = Number(id)
  const enabled = Number.isFinite(pid)

  const patientQ = useQuery({
    queryKey: ['patient', pid],
    queryFn: () => fetchPatient(pid),
    enabled,
  })
  const scansQ = useQuery({
    queryKey: ['scans', pid],
    queryFn: () => fetchScans(pid),
    enabled,
  })

  // scans sorted by date ascending — the timeline reads left → right
  const sortedScans = useMemo<Scan[]>(() => {
    const xs = scansQ.data ?? []
    return [...xs].sort((a, b) => a.scan_date.localeCompare(b.scan_date))
  }, [scansQ.data])

  // pull each scan's detail in parallel to read severity_score + detection
  const detailsQ = useQueries({
    queries: sortedScans.map((s) => ({
      queryKey: ['scan', s.id],
      queryFn: () => fetchScan(s.id),
      enabled: true,
      staleTime: 60_000,
    })),
  })

  const points = useMemo<TimelinePoint[]>(() => {
    return sortedScans.map((s, i) => {
      const detail = (detailsQ[i]?.data ?? null) as ScanDetail | null
      const score = detail?.detection?.severity_score ?? null
      const pct = score != null ? Math.round(score * 100) : null
      return {
        scanId: s.id,
        date: s.scan_date,
        severity: score,
        pct,
        scenario: s.scenario_tag,
        toothLabel: detail ? deriveToothLabel(detail) : null,
        detail,
      }
    })
  }, [sortedScans, detailsQ])

  const realPoints = points.filter(
    (p): p is TimelinePoint & { pct: number } => p.pct != null,
  )
  const isLoading = patientQ.isLoading || scansQ.isLoading
    || (sortedScans.length > 0 && detailsQ.some((q) => q.isLoading))

  if (isLoading) {
    return (
      <div className="grid h-full grid-cols-[1fr_320px] gap-3 p-3">
        <div className="skeleton h-full" />
        <div className="skeleton h-full" />
      </div>
    )
  }

  if (patientQ.error || !patientQ.data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-bad">
        환자 정보를 불러올 수 없습니다.
      </div>
    )
  }

  const patient = patientQ.data as Patient
  const age = ageFromDob(patient.dob)

  // ── empty states ───────────────────────────────────────────────────
  if (patient.scan_count === 0 || sortedScans.length === 0) {
    return (
      <EmptyState
        patient={patient}
        title="스캔 없음"
        body="아직 등록된 스캔이 없습니다. 신규 스캔을 등록하면 경과 추세가 이 화면에 누적됩니다."
      />
    )
  }
  if (realPoints.length < 2) {
    return (
      <EmptyState
        patient={patient}
        title="추적 데이터 부족"
        body="추적 관찰 데이터가 충분하지 않습니다. 추가 스캔이 누적되면 경과 추세를 확인할 수 있습니다."
        scans={sortedScans}
      />
    )
  }

  // ── primary trend layout ───────────────────────────────────────────
  const first = realPoints[0]
  const last = realPoints[realPoints.length - 1]
  const delta = (last.pct ?? 0) - (first.pct ?? 0)
  const interval = fmtInterval(daysBetween(first.date, last.date))
  const currentVerdict = verdict(last.pct)
  const deltaTone: Tone = delta > 1 ? 'bad' : delta < -1 ? 'good' : 'muted'

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 animate-[fade-in_0.2s_ease-out_both]">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3">
        <div className="min-w-0">
          <Link
            to={`/patients/${patient.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
          >
            <ChevronLeft className="h-3 w-3" />
            환자 상세
          </Link>
          <div className="mt-1 flex items-baseline gap-3">
            <h1 className="editorial truncate text-[28px] text-text-strong">
              {patient.full_name}
            </h1>
            <span className={`pill ${TONE_PILL[currentVerdict.tone]}`}>{currentVerdict.ko}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted">
            <span>{patient.mrn}</span>
            <span className="h-2.5 w-px bg-line" />
            <span>{patient.sex === 'M' ? '남' : patient.sex === 'F' ? '여' : '기타'}{age != null ? ` · ${age}세` : ''}</span>
            <span className="h-2.5 w-px bg-line" />
            <span>스캔 {realPoints.length}건</span>
            <span className="h-2.5 w-px bg-line" />
            <span>간격 {interval}</span>
          </div>
        </div>

        {/* Right: current severity + delta vs baseline */}
        <div className="flex items-end gap-5">
          <div className="text-right">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">current severity</div>
            <div className="num text-[44px] font-semibold leading-none tracking-tight" style={{ color: TONE_VAR[currentVerdict.tone] }}>
              {last.pct}<span className="ml-0.5 text-[16px] font-normal text-muted">%</span>
            </div>
            <div className="num mt-0.5 text-[10.5px] font-semibold tracking-[0.14em]" style={{ color: TONE_VAR[currentVerdict.tone] }}>
              {currentVerdict.label}
            </div>
          </div>
          <div
            className="flex items-center gap-2 rounded-md border px-3 py-2"
            style={{
              borderColor: `color-mix(in srgb, ${TONE_VAR[deltaTone]} 38%, var(--color-line))`,
              background:  `color-mix(in srgb, ${TONE_VAR[deltaTone]} 8%, var(--color-panel))`,
            }}
          >
            {delta > 0 ? <TrendingUp   className="h-4 w-4" style={{ color: TONE_VAR[deltaTone] }} />
              : delta < 0 ? <TrendingDown className="h-4 w-4" style={{ color: TONE_VAR[deltaTone] }} />
              : <Minus className="h-4 w-4 text-muted" />}
            <div className="leading-tight">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">심각도 변화</div>
              <div className="num text-[16px] font-semibold" style={{ color: TONE_VAR[deltaTone] }}>
                {delta > 0 ? '+' : ''}{delta}%p
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main grid: trend chart (left) + scan list (right) ── */}
      <div className="grid min-h-[360px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card flex min-h-[360px] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            <div className="text-[12px] font-semibold text-text-strong">심각도 추세</div>
            <span className="text-[10.5px] text-faint">severity over time</span>
            <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
              <Legend dot={WAVE_COLORS.good} label="정상 &lt;20" />
              <Legend dot={WAVE_COLORS.warn} label="경계/의심" />
              <Legend dot={WAVE_COLORS.bad}  label="병변 ≥80" />
            </div>
          </div>
          <div className="min-h-0 flex-1 px-2 pb-2 pt-1">
            <SeverityTrendChart points={points} />
          </div>
        </section>

        <aside className="flex min-h-[360px] flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="text-[11.5px] font-semibold text-text-strong">스캔 목록</div>
            <div className="font-mono text-[10px] text-muted">{realPoints.length}건</div>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-auto pr-1">
            {[...points].reverse().map((pt, idx) => (
              <ScanCard key={pt.scanId} point={pt} isLatest={idx === 0}
                isBaseline={idx === points.length - 1 && points.length > 1} />
            ))}
          </div>
        </aside>
      </div>

      {/* ── KPI delta panel ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <KpiDeltaPanel first={first.detail} last={last.detail} />

        {/* recommendation block */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
            <Clock className="h-3.5 w-3.5 text-accent" />
            <div className="text-[12px] font-semibold text-text-strong">다음 권고 시기</div>
          </div>
          <div className="flex flex-1 flex-col justify-between gap-2 px-3 py-3">
            <p className="text-[11.5px] leading-relaxed text-text/80">
              {delta > 5
                ? `최근 ${interval} 동안 심각도가 ${delta}%p 상승했습니다. 진행 양상을 확인하기 위해 단기 추적 재스캔을 권장합니다.`
                : delta < -3
                  ? `최근 ${interval} 동안 심각도가 ${Math.abs(delta)}%p 감소했습니다. 다음 정기 검진 주기를 유지하면서 경과를 관찰하세요.`
                  : `최근 ${interval} 동안 심각도가 안정 구간입니다. 표준 추적 주기로 다음 스캔을 예약하세요.`}
            </p>
            <NextScanProjection points={realPoints} delta={delta} />
            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
              <AlertCircle className="h-3 w-3" />
              <span>참고용 추정 · 임상 판단은 면허 의사 검진에 따릅니다.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lesion arch morph (R5b) ── */}
      <section className="card flex flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
          <Activity className="h-3.5 w-3.5 text-accent" />
          <h2 className="editorial text-[18px] leading-none text-text-strong">
            병변 위치 · 크기 변화
          </h2>
          <span className="text-[10.5px] text-faint">lesion morph across scans</span>
          <div className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            top-down arch view
          </div>
        </div>
        <div className="min-w-0 px-3 py-3">
          <LesionArchMorph
            points={realPoints.map((p) => ({
              scanId: p.scanId,
              date: p.date,
              pct: p.pct,
              scenario: p.scenario,
              xMm: p.detail?.detection?.estimate_x_mm ?? (SCAN_X_MIN + SCAN_X_MAX) / 2,
              yMm: p.detail?.detection?.estimate_y_mm ?? (SCAN_Y_MIN + SCAN_Y_MAX) / 2,
            }))}
          />
        </div>
      </section>
    </div>
  )
}

// ── small helpers / sub-components ───────────────────────────────────
function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
      <span>{label}</span>
    </span>
  )
}

function NextScanProjection({
  points, delta,
}: { points: Array<TimelinePoint & { pct: number }>; delta: number }) {
  const last = points[points.length - 1]
  // mirror the chart heuristic
  let weeks = 12
  if (delta >= 10) weeks = 4
  else if (delta >= 4) weeks = 8
  else if (delta <= -4) weeks = 16
  const target = new Date(last.date)
  target.setDate(target.getDate() + weeks * 7)
  const iso = target.toISOString().slice(0, 10)
  return (
    <div className="flex items-end justify-between rounded-md border border-accent-line/60 bg-accent-soft/40 px-3 py-2">
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          recommended next scan
        </div>
        <div className="num mt-0.5 text-[18px] font-semibold text-accent-strong">
          {iso}
        </div>
      </div>
      <div className="text-right text-[10.5px] text-muted">
        <div className="num">+{weeks}주</div>
        <div>last {last.date}</div>
      </div>
    </div>
  )
}

function EmptyState({
  patient, title, body, scans,
}: {
  patient: Patient
  title: string
  body: string
  scans?: Scan[]
}) {
  const age = ageFromDob(patient.dob)
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <header className="flex items-end justify-between rounded-lg border border-line bg-panel px-4 py-3">
        <div>
          <Link
            to={`/patients/${patient.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
          >
            <ChevronLeft className="h-3 w-3" />
            환자 상세
          </Link>
          <h1 className="editorial mt-1 text-[26px] text-text-strong">
            {patient.full_name}
          </h1>
          <div className="mt-1 font-mono text-[10.5px] text-muted">
            {patient.mrn} · {patient.sex === 'M' ? '남' : patient.sex === 'F' ? '여' : '기타'}
            {age != null ? ` · ${age}세` : ''}
          </div>
        </div>
      </header>

      <div className="card flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-panel-2">
          <Clock className="h-6 w-6 text-muted" />
        </div>
        <h2 className="editorial text-[22px] text-text-strong">{title}</h2>
        <p className="max-w-md text-[12.5px] leading-relaxed text-muted">{body}</p>

        {scans && scans.length > 0 && (
          <div className="mt-4 grid w-full max-w-md grid-cols-1 gap-2">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted">
              등록된 스캔
            </div>
            {scans.map((s) => (
              <Link
                key={s.id}
                to={`/scans/${s.id}`}
                className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2 text-[12px] hover:border-accent-line"
              >
                <span className="num text-text">{s.scan_date}</span>
                <span className="text-muted">{SCENARIO_LABEL[s.scenario_tag]}</span>
                <ChevronRight className="h-3 w-3 text-faint" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
