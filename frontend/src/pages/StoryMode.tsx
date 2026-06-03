// StoryMode — 6-step clinical scrollytelling for one scan.
// Top header = progress + doctor/patient toggle. Body = sticky viz (left)
// + scroll-driven narrative (right). Route /scans/:id/story is whitelisted
// in useRouteTheme.ts so it renders light.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import scrollama from 'scrollama'
import {
  ArrowLeft, Sparkles, Stethoscope, User as UserIcon,
  Activity, Crosshair, Target, Layers,
} from 'lucide-react'
import { fetchScan } from '../api/endpoints'
import {
  fetchEnergyProfile, fetchMcmcBackground, fetchMcmcTrace,
  fetchScreeningSurface, fetchSeismogramGather, fetchVelocitySlice,
} from '../api/wave'
import type {
  EnergyProfile, McmcBackground, McmcTrace, ScreeningSurface,
  SeismogramGather, VelocitySlice, WaveCaseId,
} from '../api/wave'
import type { ScanDetail, ScenarioTag } from '../api/types'
import StageSlicePreview from '../components/scan/wave/StageSlicePreview'
import PolarSeismogram from '../components/scan/wave/PolarSeismogram'
import ScreeningSurfacePane from '../components/scan/wave/ScreeningSurfacePane'
// Lazy: three.js + R3F + drei + postprocessing (~1.5 MB) only when MCMC step
// is visible during scrollytelling.
const McmcParticleField = React.lazy(() => import('../components/scan/wave/McmcParticleField'))
import {
  STORY_STEPS_CLINICAL,
  type StoryAudience,
  type StoryStepClinical,
} from '../lib/storyCopy'

// Which step (0-based) each wave query first becomes relevant for. We gate
// queries on activeIdx >= this threshold so the cover paints instantly and
// background fetches stagger in as the reader scrolls.
const VIZ_STEP_GATE = {
  velocity: 1,     // step 02 — pulse + CBCT slice
  seismo: 2,       // step 03 — polar seismogram
  energy: 2,       // step 03 — energy strip
  mcmc: 3,         // step 04 — MCMC particle field
  mcmcBg: 3,       // step 04 — MCMC bg surface
  screen: 4,       // step 05 — screening surface
} as const

// ── scenario → wave fixture mapping (mirrors WaveWorkspace) ─────────────────
const SCENARIO_TO_CASE: Record<ScenarioTag, WaveCaseId> = {
  healthy: 1, inf70: 2, inf80: 3,
}

// Severity → verdict band (mirrors ScanHeroHeader.tsx).
function verdictOf(severity: number | null | undefined): {
  label: string; ko: string; tone: 'good' | 'warn' | 'bad' | 'muted'
} {
  if (severity == null) return { label: '—', ko: '판정 보류', tone: 'muted' }
  const pct = Math.round(severity * 100)
  if (pct < 20) return { label: 'NEGATIVE', ko: '정상 소견', tone: 'good' }
  if (pct < 50) return { label: 'EQUIVOCAL', ko: '경계성', tone: 'warn' }
  if (pct < 80) return { label: 'SUSPICIOUS', ko: '의심 소견', tone: 'warn' }
  return { label: 'PROBABLE LESION', ko: '병변 가능성 높음', tone: 'bad' }
}

// ── header: progress + audience toggle ──────────────────────────────────────
function StoryHeader({
  scanId, scenario, audience, onAudienceChange, stepIdx, totalSteps,
}: {
  scanId: number
  scenario: ScenarioTag | undefined
  audience: StoryAudience
  onAudienceChange: (a: StoryAudience) => void
  stepIdx: number
  totalSteps: number
}) {
  const progressPct = totalSteps > 0
    ? Math.min(100, Math.max(0, ((stepIdx + 1) / totalSteps) * 100))
    : 0
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-6 px-[4vw]">
        <Link
          to={`/scans/${scanId}`}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted hover:text-accent"
        >
          <ArrowLeft size={11} /> 스캔으로
        </Link>
        <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-faint md:flex">
          <span>scan #{scanId}</span>
          <span className="h-2 w-px bg-line" />
          <span>{scenario ?? '—'}</span>
        </div>

        {/* progress bar — flexes to fill */}
        <div className="flex flex-1 items-center gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {String(stepIdx + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </div>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-panel-2">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* audience segmented toggle */}
        <div className="inline-flex items-center rounded-md border border-line bg-panel p-[3px]">
          {(['doctor', 'patient'] as const).map((k) => {
            const active = audience === k
            const Icon = k === 'doctor' ? Stethoscope : UserIcon
            return (
              <button
                key={k}
                onClick={() => onAudienceChange(k)}
                className={[
                  'inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] transition',
                  active
                    ? 'bg-accent text-bg shadow-sm'
                    : 'text-muted hover:text-text',
                ].join(' ')}
                aria-pressed={active}
              >
                <Icon size={12} />
                {k === 'doctor' ? '의사용' : '환자용'}
              </button>
            )
          })}
        </div>
      </div>

      {/* step kicker rail — subtle row showing the current step's kicker */}
      <div className="hidden border-t border-line-soft px-[4vw] py-1.5 lg:block">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          {STORY_STEPS_CLINICAL[stepIdx]?.kicker ?? ''}
        </div>
      </div>
    </header>
  )
}

// ── per-step right-column panel (narrative) ─────────────────────────────────
function StepPanel({
  step, idx, active, audience,
}: {
  step: StoryStepClinical
  idx: number
  active: boolean
  audience: StoryAudience
}) {
  const headline = audience === 'doctor' ? step.headline_doc : step.headline_pat
  const body = audience === 'doctor' ? step.body_doc : step.body_pat
  const callout = audience === 'doctor' ? step.callout_doc : step.callout_pat
  const captionField = audience === 'doctor' ? 'caption_doc' : 'caption_pat'
  const heroCaption = step.hero?.[captionField]

  return (
    <article
      data-step={idx}
      className={[
        // top-justified so step 1 sits cleanly under the sticky header at the
        // top of the right panel, matching the rhythm of steps 2-6.
        'story-step relative flex min-h-screen flex-col justify-start pt-[18vh] pb-[14vh] transition-opacity duration-300',
        active ? 'opacity-100' : 'opacity-55',
      ].join(' ')}
    >
      {/* kicker */}
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.24em] text-accent">
        {step.kicker}
      </div>

      {/* headline — serif for editorial weight */}
      <h2 className="editorial mt-4 text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.12] tracking-tight text-text-strong">
        {headline}
      </h2>

      {/* hero number block */}
      {step.hero && (
        <div className="surface mt-7 inline-flex w-fit items-baseline gap-2.5 rounded-xl border border-line px-4 py-3">
          <span className="num text-[34px] font-bold leading-none tracking-tight text-text-strong">
            {step.hero.value}
          </span>
          <span className="text-[13px] text-muted">{step.hero.unit}</span>
          <span className="ml-2 text-[11.5px] text-faint">· {heroCaption}</span>
        </div>
      )}

      {/* body paragraphs */}
      <div className="mt-8 max-w-[520px] space-y-4">
        {body.map((p, i) => (
          <p key={i} className="text-[14.5px] leading-[1.8] text-text">
            {p}
          </p>
        ))}
      </div>

      {/* callout chip (doctor-mode: technical; patient-mode: reassuring) */}
      {callout && (
        <div
          className={[
            'pill mt-6 inline-flex w-fit items-center gap-1.5',
            audience === 'doctor' ? 'pill-accent' : 'pill-info',
          ].join(' ')}
        >
          {audience === 'doctor'
            ? <Activity size={11} />
            : <Sparkles size={11} />}
          {callout}
        </div>
      )}

      {/* patient-mode disclaimer line */}
      {audience === 'patient' && (
        <div className="mt-4 inline-flex w-fit items-center gap-1.5 text-[11.5px] italic text-muted">
          <Sparkles size={11} className="text-accent" />
          쉽게 풀어 쓴 설명입니다
        </div>
      )}
    </article>
  )
}

// (AskBox + buildStepContext removed — story mode no longer hosts an AI dock.)

// ── small visual aid chip overlaid on the sticky pane ───────────────────────
function VizAid({ kind, caseId, severity }: {
  kind: StoryStepClinical['viz_kind']
  caseId: WaveCaseId
  severity: number | null
}) {
  const item = (() => {
    switch (kind) {
      case 'patient':
        return { icon: Layers, label: `case #${caseId} · 환자 컨텍스트`, tone: 'accent' as const }
      case 'pulse':
        return { icon: Activity, label: '30 kHz Ricker · 단일 shot', tone: 'accent' as const }
      case 'gather':
        return { icon: Target, label: 'peak rx #47 · 잔차 최대', tone: 'warn' as const }
      case 'mcmc':
        return { icon: Crosshair, label: '사후분포 · 1,000 iter', tone: 'accent' as const }
      case 'estimate': {
        const v = verdictOf(severity)
        return { icon: Crosshair, label: `${v.ko} · ${v.label}`, tone: v.tone === 'bad' ? 'bad' as const : v.tone === 'warn' ? 'warn' as const : 'good' as const }
      }
      case 'clinical':
        return { icon: Stethoscope, label: '임상 적용 · 다음 단계', tone: 'good' as const }
    }
  })()
  const Icon = item.icon
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10">
      <div
        className={[
          'pill inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px]',
          item.tone === 'bad' ? 'pill-bad'
            : item.tone === 'warn' ? 'pill-warn'
            : item.tone === 'good' ? 'pill-good'
            : 'pill-accent',
        ].join(' ')}
      >
        <Icon size={11} />
        {item.label}
      </div>
    </div>
  )
}

// ── sticky visualization (left column) — picks one viz per step ─────────────
interface VizProps {
  stepIdx: number
  audience: StoryAudience
  caseId: WaveCaseId
  scan: ScanDetail | undefined
  velocity: VelocitySlice | undefined
  screen: ScreeningSurface | undefined
  seismo: SeismogramGather | undefined
  energy: EnergyProfile | undefined
  mcmcTrace: McmcTrace | undefined
  mcmcBg: McmcBackground | undefined
  totalIters: number
  progress: number       // 0..1, loop for in-pane animation
}

function StickyVisual(props: VizProps) {
  const { stepIdx, audience, caseId, scan, velocity, screen, seismo,
          energy, mcmcTrace, mcmcBg, totalIters, progress } = props
  const step = STORY_STEPS_CLINICAL[stepIdx]
  const kind = step?.viz_kind ?? 'patient'

  const detection = scan?.detection ?? null
  const severity = detection?.severity_score ?? null

  // pre-built per-step visuals — wrap each in a crossfade overlay
  const visuals = useMemo(() => {
    const pat = <PatientCard key="patient" scan={scan} caseId={caseId} audience={audience} progress={progress} />
    const pulse = (
      <div key="pulse" className="relative h-full w-full">
        <StageSlicePreview mode="cbct" data={velocity} progress={progress} />
        <RickerOverlay progress={progress} />
      </div>
    )
    const gather = (
      <div key="gather" className="grid h-full w-full grid-rows-[1fr_auto] gap-2 p-3">
        <div className="relative overflow-hidden rounded-md border border-line bg-panel">
          <PolarSeismogram data={seismo} />
        </div>
        <EnergyStrip energy={energy} />
      </div>
    )
    const mcmc = mcmcTrace ? (
      <div key="mcmc" className="h-full w-full overflow-hidden">
        <React.Suspense fallback={<div className="skeleton h-full w-full" />}>
          <McmcParticleField
            trace={mcmcTrace}
            background={mcmcBg}
            n={Math.max(50, Math.floor(totalIters * progress))}
            showMode showBest showWalk
          />
        </React.Suspense>
      </div>
    ) : (
      <div key="mcmc-empty" className="flex h-full items-center justify-center text-xs text-muted">
        MCMC 데이터 로딩…
      </div>
    )
    const estimate = (
      <div key="estimate" className="grid h-full w-full grid-rows-[1.4fr_1fr] gap-2 p-3">
        <div className="relative overflow-hidden rounded-md border border-line bg-panel">
          <StageSlicePreview mode="lesion" data={velocity} progress={progress} />
        </div>
        <ScreeningSurfacePane data={screen} />
      </div>
    )
    const clinical = <ClinicalCard key="clinical" scan={scan} audience={audience} />
    // map viz_kind → which composite to show
    return { patient: pat, pulse, gather, mcmc, estimate, clinical } as Record<string, React.ReactNode>
  }, [scan, caseId, audience, progress, velocity, seismo, energy, mcmcTrace,
      mcmcBg, totalIters, screen])

  return (
    <div className="relative h-full w-full">
      {(['patient', 'pulse', 'gather', 'mcmc', 'estimate', 'clinical'] as const).map((k) => (
        <div
          key={k}
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: kind === k ? 1 : 0,
            pointerEvents: kind === k ? 'auto' : 'none',
          }}
        >
          {visuals[k]}
        </div>
      ))}
      <VizAid kind={kind} caseId={caseId} severity={severity} />
      {/* tiny step counter */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        {stepIdx + 1} / {STORY_STEPS_CLINICAL.length}
      </div>
    </div>
  )
}

// ── viz: patient context card (step 01) ─────────────────────────────────────
function PatientCard({
  scan, caseId, audience, progress,
}: {
  scan: ScanDetail | undefined
  caseId: WaveCaseId
  audience: StoryAudience
  progress: number
}) {
  const verdict = verdictOf(scan?.detection?.severity_score ?? null)
  const sevPct = scan?.detection ? Math.round(scan.detection.severity_score * 100) : null
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(progress * Math.PI))
  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-br from-panel via-panel to-panel-2 p-7">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
        case #{caseId} · scan #{scan?.id ?? '—'}
      </div>
      <div className="editorial mt-3 text-[28px] font-semibold leading-[1.15] tracking-tight text-text-strong">
        {scan?.patient_name ?? '환자'}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">
        {scan?.scenario_tag === 'inf80' ? '염증 의심 80%' :
         scan?.scenario_tag === 'inf70' ? '염증 의심 70%' :
         scan?.scenario_tag === 'healthy' ? '정상 시나리오' : '—'}
        {scan?.scan_date && ` · ${scan.scan_date}`}
      </div>

      {/* big severity pill — animated halo */}
      <div className="mt-7 self-start">
        <div className="relative inline-flex">
          <div
            className={[
              'absolute inset-0 rounded-full blur-2xl transition-opacity',
              verdict.tone === 'bad' ? 'bg-bad/30'
                : verdict.tone === 'warn' ? 'bg-warn/30'
                : verdict.tone === 'good' ? 'bg-good/30'
                : 'bg-muted/20',
            ].join(' ')}
            style={{ opacity: pulse }}
          />
          <div
            className={[
              'relative inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 backdrop-blur-sm',
              verdict.tone === 'bad' ? 'border-bad/40 bg-bad/10 text-bad'
                : verdict.tone === 'warn' ? 'border-warn/40 bg-warn/10 text-warn'
                : verdict.tone === 'good' ? 'border-good/40 bg-good/10 text-good'
                : 'border-line bg-panel text-muted',
            ].join(' ')}
          >
            <div className="status-dot" />
            <span className="font-mono text-[11.5px] font-bold uppercase tracking-[0.18em]">
              {verdict.label}
            </span>
            {sevPct != null && (
              <span className="num text-[13px] font-bold tabular-nums">
                {sevPct}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* metadata grid — three small fact tiles */}
      <div className="mt-auto grid grid-cols-3 gap-2">
        <FactTile
          label={audience === 'doctor' ? 'CHIEF COMPLAINT' : '오늘 검진 이유'}
          value={audience === 'doctor' ? '잇몸 출혈 · 압통' : '잇몸이 욱신거림'}
        />
        <FactTile
          label={audience === 'doctor' ? 'MEDICAL HISTORY' : '과거 병력'}
          value={audience === 'doctor' ? 'Smk 30y · 치주염 FHx' : '흡연 30년'}
        />
        <FactTile
          label="MODALITY"
          value={audience === 'doctor' ? '30 kHz 탄성파' : '무방사선 검사'}
        />
      </div>

      {scan?.notes && (
        <div className="mt-3 rounded border border-line bg-panel-2/40 px-3 py-2 text-[11.5px] leading-[1.5] text-muted">
          {scan.notes}
        </div>
      )}
    </div>
  )
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-[12.5px] font-medium text-text-strong">
        {value}
      </div>
    </div>
  )
}

// ── viz: pulse — small ricker waveform overlay on top of CBCT slice ─────────
function RickerOverlay({ progress }: { progress: number }) {
  // Ricker wavelet ψ(t) = (1 − 2π²f²t²) e^(−π²f²t²) — draw a stylized
  // version animated horizontally to suggest the pulse propagating.
  const w = 280, h = 64
  const fc = 1.6                      // arbitrary scaled frequency for the SVG
  const phase = progress * 2 - 1      // -1 .. 1 sweep
  const path = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * 2 - 1     // -1..1
      const x = (i / 100) * w
      const a = 1 - 2 * Math.PI * Math.PI * fc * fc * t * t
      const y = h / 2 - a * Math.exp(-Math.PI * Math.PI * fc * fc * t * t) * (h * 0.42)
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    return pts.join(' ')
  }, [])
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-line bg-bg/85 px-3 py-2 backdrop-blur-sm">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">
        Ricker · 30 kHz
      </div>
      <svg width={w} height={h} className="mt-1">
        <path d={path} stroke="var(--color-accent)" strokeWidth={1.5} fill="none" />
        <line
          x1={(phase * 0.5 + 0.5) * w}
          x2={(phase * 0.5 + 0.5) * w}
          y1={4}
          y2={h - 4}
          stroke="var(--color-finding-progressed)"
          strokeWidth={1}
          opacity={0.7}
        />
      </svg>
      <div className="font-mono text-[9px] text-muted">
        t = {Math.round(progress * 75)} μs
      </div>
    </div>
  )
}

// ── viz: small bar strip showing per-receiver energy ────────────────────────
function EnergyStrip({ energy }: { energy: EnergyProfile | undefined }) {
  const bars = useMemo(() => {
    if (!energy?.profile) return null
    const p = energy.profile
    const max = Math.max(...p, 1e-9)
    return p.map((v, i) => ({ i, h: Math.max(2, (v / max) * 100), peak: i === energy.peak_receiver }))
  }, [energy])

  return (
    <div className="rounded-md border border-line bg-panel-2/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          energy / receiver
        </div>
        {energy && (
          <div className="font-mono text-[10px] text-faint">
            peak rx #{energy.peak_receiver}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex h-[44px] items-end gap-[1.5px]">
        {bars
          ? bars.map((b) => (
              <div
                key={b.i}
                className={[
                  'flex-1 rounded-t-sm transition-all',
                  b.peak ? 'bg-finding-progressed' : 'bg-accent/55',
                ].join(' ')}
                style={{ height: `${b.h}%` }}
              />
            ))
          : <div className="h-full w-full skeleton rounded" />}
      </div>
    </div>
  )
}

// ── viz: clinical recommendation card (step 06) ─────────────────────────────
function ClinicalCard({
  scan, audience,
}: {
  scan: ScanDetail | undefined
  audience: StoryAudience
}) {
  const verdict = verdictOf(scan?.detection?.severity_score ?? null)
  const recs = useMemo(() => {
    const sev = scan?.detection ? Math.round(scan.detection.severity_score * 100) : null
    if (sev == null) {
      return [{ t: '결과 확인 필요', d: '판정 데이터를 불러오는 중입니다.', tone: 'muted' as const, primary: true }]
    }
    if (sev >= 80) {
      return audience === 'doctor' ? [
        { t: '전문의 의뢰', d: '치주과 의뢰 · 정밀 검사 및 치료 계획 수립', tone: 'bad' as const, primary: true },
        { t: '임상 검진', d: '프로빙 깊이 · BOP · 치은 지수 측정', tone: 'warn' as const },
        { t: '재촬영 권고', d: '4주 후 추적 스캔으로 진행 양상 평가', tone: 'muted' as const },
      ] : [
        { t: '진료 예약', d: '담당 의사 선생님과 자세히 상의해 주세요.', tone: 'bad' as const, primary: true },
        { t: '치료 시작', d: '잇몸 스케일링 및 약물 치료 등이 안내될 수 있어요.', tone: 'warn' as const },
        { t: '4주 뒤 재검사', d: '잘 나아지고 있는지 다시 한 번 확인합니다.', tone: 'muted' as const },
      ]
    }
    if (sev >= 50) {
      return audience === 'doctor' ? [
        { t: '임상 검토', d: '대면 검진으로 시각적 소견 교차 확인', tone: 'warn' as const, primary: true },
        { t: '추적 관찰', d: '8–12주 간격 재스캔 권고', tone: 'muted' as const },
      ] : [
        { t: '경과 관찰', d: '치료 전 추가 진료로 정확한 상태를 확인합니다.', tone: 'warn' as const, primary: true },
        { t: '재검사', d: '약 2–3개월 뒤 다시 검사합니다.', tone: 'muted' as const },
      ]
    }
    return audience === 'doctor' ? [
      { t: '경과 관찰', d: '정기 검진 주기 유지 — 추가 조치 불필요', tone: 'good' as const, primary: true },
    ] : [
      { t: '정상 결과', d: '특별한 치료 없이 정기 검진만 받으시면 됩니다.', tone: 'good' as const, primary: true },
    ]
  }, [scan, audience])

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-br from-panel via-panel to-panel-2 p-7">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
        recommendation · scan #{scan?.id ?? '—'}
      </div>
      <div className="editorial mt-3 text-[26px] font-semibold leading-[1.18] tracking-tight text-text-strong">
        {audience === 'doctor' ? '권고 사항' : '앞으로의 진행'}
      </div>

      <div
        className={[
          'mt-4 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1',
          verdict.tone === 'bad' ? 'border-bad/40 bg-bad/10 text-bad'
            : verdict.tone === 'warn' ? 'border-warn/40 bg-warn/10 text-warn'
            : verdict.tone === 'good' ? 'border-good/40 bg-good/10 text-good'
            : 'border-line bg-panel text-muted',
        ].join(' ')}
      >
        <div className="status-dot" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
          {verdict.label}
        </span>
        <span className="text-[11.5px]">· {verdict.ko}</span>
      </div>

      <div className="mt-6 space-y-2.5">
        {recs.map((r, i) => (
          <div
            key={i}
            className={[
              'rounded-lg border px-4 py-3 transition',
              r.primary
                ? 'border-accent-line bg-accent-soft/40'
                : 'border-line bg-panel',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <div
                className={[
                  'h-2 w-2 rounded-full',
                  r.tone === 'bad' ? 'bg-bad'
                    : r.tone === 'warn' ? 'bg-warn'
                    : r.tone === 'good' ? 'bg-good'
                    : 'bg-muted',
                ].join(' ')}
              />
              <div className="text-[13.5px] font-semibold text-text-strong">{r.t}</div>
            </div>
            <div className="mt-1 pl-4 text-[12px] leading-[1.6] text-muted">{r.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
        최종 판단은 면허 의사의 직접 검진에 따라야 합니다
      </div>
    </div>
  )
}

// ── main page ───────────────────────────────────────────────────────────────
export default function StoryMode() {
  const { id } = useParams<{ id: string }>()
  const sid = Number(id)
  const containerRef = useRef<HTMLDivElement>(null)

  const [activeIdx, setActiveIdx] = useState(0)
  const [audience, setAudience] = useState<StoryAudience>('doctor')
  const [progress, setProgress] = useState(0)        // 0..1 loop for in-pane anim

  // ── data ──────────────────────────────────────────────────────────────────
  const scanQ = useQuery({
    queryKey: ['scan', sid],
    queryFn: () => fetchScan(sid),
    enabled: Number.isFinite(sid),
  })
  const caseId: WaveCaseId = scanQ.data
    ? (SCENARIO_TO_CASE[scanQ.data.scenario_tag] ?? 1)
    : 1

  // Wave fixtures are heavy — gate each query on the active scroll step so the
  // cover paints instantly. staleTime: Infinity makes navigation back-and-forth
  // free after the first fetch.
  const velocity = useQuery({
    queryKey: ['wave', 'velocity', caseId],
    queryFn: () => fetchVelocitySlice(caseId),
    enabled: !!scanQ.data && activeIdx >= VIZ_STEP_GATE.velocity,
    staleTime: Infinity,
  })
  const seismo = useQuery({
    queryKey: ['wave', 'seismogram', caseId],
    queryFn: () => fetchSeismogramGather(caseId),
    enabled: !!scanQ.data && activeIdx >= VIZ_STEP_GATE.seismo,
    staleTime: Infinity,
  })
  const energy = useQuery({
    queryKey: ['wave', 'energy', caseId],
    queryFn: () => fetchEnergyProfile(caseId),
    enabled: !!scanQ.data && activeIdx >= VIZ_STEP_GATE.energy,
    staleTime: Infinity,
  })
  const mcmcTrace = useQuery({
    queryKey: ['wave', 'mcmc', caseId],
    queryFn: () => fetchMcmcTrace(caseId),
    enabled: !!scanQ.data && activeIdx >= VIZ_STEP_GATE.mcmc,
    staleTime: Infinity,
  })
  const mcmcBg = useQuery({
    queryKey: ['wave', 'mcmc-bg'],
    queryFn: fetchMcmcBackground,
    enabled: activeIdx >= VIZ_STEP_GATE.mcmcBg,
    staleTime: Infinity,
  })
  const screen = useQuery({
    queryKey: ['wave', 'screening', caseId],
    queryFn: () => fetchScreeningSurface(caseId),
    enabled: !!scanQ.data && activeIdx >= VIZ_STEP_GATE.screen,
    staleTime: Infinity,
  })

  const totalIters = mcmcTrace.data?.total ?? 1000

  // ── ambient loop for per-pane animation (ricker sweep, severity pulse) ────
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setProgress(((Date.now() - start) / 4000) % 1), 50)
    return () => clearInterval(id)
  }, [])

  // ── scrollama wiring (same pattern as previous impl) ──────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const scroller = scrollama()
    scroller
      .setup({
        step: '.story-step',
        offset: 0.5,
        progress: false,
      })
      .onStepEnter((res) => setActiveIdx(res.index))

    const onResize = () => scroller.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      scroller.destroy()
    }
  }, [scanQ.data])

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-bg">
      <StoryHeader
        scanId={sid}
        scenario={scanQ.data?.scenario_tag}
        audience={audience}
        onAudienceChange={setAudience}
        stepIdx={activeIdx}
        totalSteps={STORY_STEPS_CLINICAL.length}
      />

      {/* ───── COVER ───── shares the same 2-col rhythm as the scrolly section
          (px-[3vw], col-start-2) so the headline lines up with all step
          headlines below — fixes "첫 화면 카피 위치 어긋남". */}
      <section className="relative grid min-h-[72vh] grid-cols-2 items-center gap-[2vw] px-[3vw] py-[8vh]">
        <div className="col-start-1 hidden lg:block" />
        <div className="col-span-2 col-start-1 max-w-[640px] lg:col-span-1 lg:col-start-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            작동 원리 · 6단계
          </div>
          <h1
            className="editorial mt-4 text-[clamp(28px,4.4vw,58px)] font-semibold leading-[1.08] tracking-tight text-text-strong"
            style={{ fontFeatureSettings: '"ss01"' }}
          >
            {audience === 'doctor'
              ? '30 kHz 탄성파 스크리닝의 6단계'
              : '오늘 검사가 어떻게 진행됐나요'}
          </h1>
          <p className="mt-6 max-w-[520px] text-[14.5px] leading-[1.75] text-muted">
            {audience === 'doctor'
              ? '환자 케이스, Ricker 펄스 인가, 100채널 수신, 베이지안 역산, 위치 추정, 임상 적용 — 검사 흐름을 단계별로 정리했습니다.'
              : '단계별로 어떤 일이 일어났는지 차근차근 알려드릴게요.'}
          </p>
          <div className="mt-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            <span>scan #{sid}</span>
            <span className="h-2 w-px bg-line" />
            <span>{scanQ.data?.scenario_tag ?? '—'}</span>
            <span className="h-2 w-px bg-line" />
            <span>6 단계 · 약 5분</span>
          </div>
          <div className="mt-10 flex items-center gap-2 text-[11px] text-muted">
            <span className="h-px w-12 bg-line" />
            <span>스크롤하여 시작</span>
            <span className="animate-bounce">↓</span>
          </div>
        </div>
      </section>

      {/* ───── SCROLLY SECTION ───── */}
      <div className="relative">
        {/* sticky visualization — pinned left column */}
        <div className="sticky top-14 z-10 -mt-[100vh] grid h-[calc(100vh-3.5rem)] grid-cols-2 gap-[2vw] px-[3vw] py-[2vh]">
          <div className="relative col-span-1 col-start-1 overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
            <StickyVisual
              stepIdx={activeIdx}
              audience={audience}
              caseId={caseId}
              scan={scanQ.data}
              velocity={velocity.data}
              screen={screen.data}
              seismo={seismo.data}
              energy={energy.data}
              mcmcTrace={mcmcTrace.data}
              mcmcBg={mcmcBg.data}
              totalIters={totalIters}
              progress={progress}
            />
          </div>
        </div>

        {/* scrolling narrative — right column */}
        <div className="relative grid grid-cols-2 gap-[2vw] px-[3vw]">
          <div className="col-start-1" />{/* spacer matching sticky viz */}
          <div className="col-start-2">
            {STORY_STEPS_CLINICAL.map((step, i) => (
              <StepPanel
                key={step.step_id}
                step={step}
                idx={i}
                active={activeIdx === i}
                audience={audience}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ───── CLOSER ───── */}
      <section className="grid min-h-[44vh] grid-cols-1 items-center justify-center px-[10vw] py-[8vh] text-center">
        <div>
          <p className="editorial mx-auto max-w-2xl text-[clamp(18px,2.0vw,24px)] leading-[1.55] text-text-strong">
            {audience === 'doctor'
              ? '임상 판단은 면허 의사의 직접 검진에 따라야 합니다.'
              : '자세한 사항은 담당 선생님과 상담해주세요.'}
          </p>
          <Link
            to={`/scans/${sid}`}
            className="btn btn-primary mt-8 inline-flex items-center gap-2"
          >
            <ArrowLeft size={13} />
            분석 화면으로
          </Link>
        </div>
      </section>

    </div>
  )
}
