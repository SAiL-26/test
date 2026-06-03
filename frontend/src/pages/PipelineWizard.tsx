import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Upload, ChevronRight, ChevronLeft, Check, X,
  FileBox, Layers, Brain, ClipboardCheck, UserPlus,
  Filter, Radar, ScanLine, Send, Loader2,
} from 'lucide-react'
import type { ScenarioTag } from '../api/types'
import { askClaude } from '../api/ai'

/**
 * PipelineWizard — Phase 5 (R2 + R3 revision)
 * 8-step horizontal wizard for new scan ingestion + simulated pipeline run.
 *
 * Reasoning for restructure (user feedback): "forward modeling은 병변 위치
 * 추정을 위한 과정이 아닌 가상 실험과 synthetic data 생성의 의미이기 때문에
 * forward modeling 대신에 초음파 측정 데이터 입력이나 초음파 스캔 등 seismogram
 * 형식의 파동데이터 입력 과정으로 대체되어야 해."
 *
 * 8 STEPS:
 *  00 환자 등록 (form)
 *  01 임플란트 · 치아 특이사항 입력 (form)
 *  02 치아 스캔 — 3D 메시 업로드 (form)
 *  03 구강 내 파동 신호 측정 — seismogram 업로드 (form)
 *  04 f-k 필터링 (process)
 *  05 저속 에너지 스크리닝 (process)
 *  06 확률적 역산 — Bayesian MCMC (process)
 *  07 결과 검토 (review)
 *
 * Backend isn't wired up — process steps run a fake progress simulation.
 * Search for "PHASE 5 stub" / "PHASE 11" for replacement points.
 */

type StepKind = 'form' | 'process' | 'review'
interface Step {
  k: string; t: string; en: string; desc: string
  bullets: string[]; ai: string
  kind: StepKind; icon: typeof Sparkles
  durationMs?: number
}

const STEPS: Step[] = [
  { k: '00', t: '환자 등록', en: 'Patient Registration',
    desc: '환자 기본정보와 주소증을 입력합니다. 이름·성별·나이가 모두 있어야 다음으로 진행할 수 있습니다.',
    bullets: ['이름 · 성별 · 나이 입력', '주소증(Chief complaint) 기록', '신규 MRN 자동 생성'],
    ai: '신규 환자의 인적사항과 주소증을 기록하는 단계입니다. 주소증은 단순한 메모가 아니라 이후 역산 단계에서 사전확률(prior)을 조정하는 입력으로 사용됩니다. 예를 들어 "우측 어금니 부근 통증"이 기록되면 6번 영역 prior가 다른 분면보다 가중되어, 동일한 파동 신호라도 더 빨리 수렴합니다. 가능한 한 환자 표현 그대로 옮겨 적어주세요.',
    kind: 'form', icon: UserPlus },
  { k: '01', t: '임플란트 · 치아 특이사항 입력', en: 'Tooth Selection',
    desc: '관심 치아(FDI 번호)와 분면을 선택합니다. 임플란트·보철 등 특이사항이 있으면 함께 기록해 주세요.',
    bullets: ['분면(quadrant) 선택', 'FDI 치식 번호 선택', '임플란트·보철 등 특이사항 메모'],
    ai: '관심 치아의 FDI 번호와 임플란트·보철 유무를 알려주세요. 금속 보철과 임플란트 픽스처는 음향 임피던스가 골조직과 크게 달라, 해당 영역에서 강한 반사파와 산란이 발생합니다. 사전에 위치를 알려주면 f-k 필터링 단계에서 보철 반사를 정상 신호로 처리하고, 역산 단계에서는 보철 주변을 별도 prior로 다루어 위양성을 줄일 수 있습니다.',
    kind: 'form', icon: Layers },
  { k: '02', t: '치아 스캔', en: '3D Mesh Upload',
    desc: '구강 스캐너로 획득한 3D 메시를 업로드합니다. 백엔드 연동 전까지는 임의 데이터로 대체합니다.',
    bullets: ['intraoral_scan.stl (3D 표면 메시)', 'mesh metadata · 스캔 랜드마크', '잇몸선 · 교합면 정합 확인'],
    ai: '구강 내 스캐너로 얻은 3D 메시는 파동 시뮬레이션의 격자(geometry) 기반이 됩니다. 잇몸선과 교합면이 실측 좌표계와 정확히 정합되어야 이후 f-k 필터링에서 표면파(surface wave)를 정확히 분리할 수 있습니다. 메시 해상도는 voxel 0.1 mm 단위 격자로 리샘플링되며, 누락된 영역은 인접 voxel 보간으로 채워집니다. 임시 단계에서는 표준 악궁(arch) 모형이 자동 로드됩니다.',
    kind: 'form', icon: ScanLine },
  { k: '03', t: '구강 내 파동 신호 측정', en: 'Wave Signal Acquisition',
    desc: '구강 내 100채널 트랜스듀서로 측정한 seismogram을 업로드합니다. 임의 데이터로 대체 가능합니다.',
    bullets: ['seismogram.bin (100 ch × 75,000 step)', 'measurement_metadata.dat (geometry · dt · num_recv)', '동일 세션 쌍 정합성 확인'],
    ai: '100개 압전 트랜스듀서가 구강 내 표면에 배치되어 약 0.3 ms 동안 기록한 시계열입니다. 30 kHz Ricker 펄스를 한 채널에서 송신하고, 나머지 채널이 골을 통과·반사한 파동을 수신합니다. 병변(저밀도·염증 영역)은 음속이 낮아 도달시간이 지연되고, 그 흔적이 시계열의 미세한 위상·진폭 차이로 남습니다. 메타데이터(.dat)에는 수신기 좌표와 샘플링 주기가 담겨 있어 격자와의 정합에 필수입니다.',
    kind: 'form', icon: Upload },
  { k: '04', t: 'f-k 필터링', en: 'Frequency-Wavenumber Filter',
    desc: '주파수–파수(f-k) 도메인에서 표면파·다중반사를 제거하고 골내 산란 신호만 남깁니다.',
    bullets: ['2D FFT → frequency-wavenumber 평면', 'velocity fan 마스크 · 표면파 차단', '역변환 → 정제된 시계열'],
    ai: 'f-k 필터링은 시계열을 주파수(f)와 파수(k) 두 축으로 분해해, 파의 진행속도(c = f/k)별로 신호를 분리하는 기법입니다. 잇몸 표면을 따라가는 표면파(Rayleigh wave, ~1500 m/s)는 f-k 평면에서 특정 fan 영역에 모이므로, 그 영역을 마스크해 제거합니다. 남는 신호는 골을 통과한 P/S 파동이며, 이들이 다음 단계에서 병변 탐지의 입력이 됩니다. 마스크가 너무 좁으면 표면파가 새고, 너무 넓으면 진단 신호도 함께 잘려나갑니다.',
    kind: 'process', icon: Filter, durationMs: 3600 },
  { k: '05', t: '저속 에너지 스크리닝', en: 'Low-Velocity Energy Screening',
    desc: '저속 영역에 에너지가 집중되는 수신기 쌍을 탐지해 병변 후보 영역을 식별합니다.',
    bullets: ['수신기 쌍별 도달시간 잔차 계산', '저속 영역 누적 에너지 맵', '상위 후보 voxel 추출 → MCMC prior'],
    ai: '병변(염증·낭종)은 주변 골보다 음속이 10–30% 느립니다. 각 수신기 쌍에 대해 직선 경로 가정 도달시간과 실제 도달시간의 잔차를 누적하면, 저속 voxel을 통과한 경로일수록 에너지 합이 커집니다. 이를 모든 쌍에 대해 합산해 만든 3D 에너지 맵에서 상위 1–2% voxel이 병변 후보가 됩니다. 이 단계는 MCMC를 모든 공간에서 돌리는 대신 후보 영역으로 좁혀 수렴 속도를 10배 이상 단축시킵니다.',
    kind: 'process', icon: Radar, durationMs: 4200 },
  { k: '06', t: '확률적 역산', en: 'Bayesian MCMC Inversion',
    desc: '병변 (x, y, z, 반지름)을 1,000-iter Metropolis-Hastings로 추정합니다.',
    bullets: ['1,000 walker step · 후보 영역 prior', '사후분포 수렴 · R̂ < 1.05', '위치오차 ≈ 0.3 mm'],
    ai: '병변의 위치와 크기를 확률변수로 두고, 매 iteration마다 후보값을 제안·평가합니다. 제안된 값으로 합성파를 계산해 실측과 비교(misfit)하고, 더 가까우면 받아들이고 멀어지면 확률적으로 기각합니다. 1,000번 반복 후 받아들여진 표본들의 분포가 곧 병변의 사후확률입니다. 표본이 한 점으로 수렴하면 (R̂ < 1.05) 추정 신뢰도가 높고, 흩어지면 (R̂ > 1.1) 데이터로는 위치를 확정할 수 없다는 신호입니다.',
    kind: 'process', icon: Brain, durationMs: 4800 },
  { k: '07', t: '결과 검토', en: 'Decision Support',
    desc: 'AI 판정·권고 액션을 확인하고 콘솔로 진입합니다.',
    bullets: ['병변 심각도 · 판정 등급', '권고 액션 · 트리아지', '콘솔 · 기록지 · 리포트 연동'],
    ai: 'AI가 사후분포에서 추정된 병변 위치·반지름·신뢰도를 종합해 판정과 권고 액션을 정리했습니다. 좌측 다이얼은 종합 심각도(0–100), 우측 치아 도식은 추정 병변 위치를 표시합니다. 콘솔에서 시계열·파동장 등 6패널 시각화를 직접 확인하고, 기록지·비교·리포트로 이어갈 수 있습니다.',
    kind: 'review', icon: ClipboardCheck },
]

interface Verdict { label: string; ko: string; tone: 'good' | 'warn' | 'bad' }
function verdict(pct: number): Verdict {
  if (pct < 20) return { label: 'NEGATIVE', ko: '정상 소견', tone: 'good' }
  if (pct < 50) return { label: 'EQUIVOCAL', ko: '경계성', tone: 'warn' }
  if (pct < 80) return { label: 'SUSPICIOUS', ko: '의심 소견', tone: 'warn' }
  return { label: 'PROBABLE LESION', ko: '병변 가능성 높음', tone: 'bad' }
}

const QUADRANTS: { k: 'UR' | 'UL' | 'LL' | 'LR'; label: string }[] = [
  { k: 'UR', label: '우측 상악' }, { k: 'UL', label: '좌측 상악' },
  { k: 'LL', label: '좌측 하악' }, { k: 'LR', label: '우측 하악' },
]
const FDI_BY_QUAD: Record<'UR' | 'UL' | 'LL' | 'LR', number[]> = {
  UR: [18, 17, 16, 15, 14, 13, 12, 11],
  UL: [21, 22, 23, 24, 25, 26, 27, 28],
  LL: [31, 32, 33, 34, 35, 36, 37, 38],
  LR: [41, 42, 43, 44, 45, 46, 47, 48],
}

function labelForFdi(n: number): string {
  const q = Math.floor(n / 10), p = n % 10
  const quadKo = q === 1 ? '우측 상악' : q === 2 ? '좌측 상악' : q === 3 ? '좌측 하악' : '우측 하악'
  const toothKo = p === 1 ? '중절치' : p === 2 ? '측절치' : p === 3 ? '견치'
    : p === 4 ? '제1소구치' : p === 5 ? '제2소구치'
    : p === 6 ? '제1대구치' : p === 7 ? '제2대구치' : '제3대구치'
  return `${quadKo} ${toothKo}`
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PipelineWizard() {
  const nav = useNavigate()
  const [idx, setIdx] = useState(0)

  // step 0 — registration
  const [name, setName] = useState('')
  const [sex, setSex] = useState<'M' | 'F'>('M')
  const [age, setAge] = useState('')
  const [cc, setCc] = useState('')
  const mrn = useMemo(() => 'MRN-' + String(1000 + Math.floor(Math.random() * 8999)), [])

  // step 1 — tooth
  const [quadrant, setQuadrant] = useState<'UR' | 'UL' | 'LL' | 'LR' | null>('UL')
  const [tooth, setTooth] = useState<number | null>(26)
  const [implantNote, setImplantNote] = useState('')

  // step 2 — mesh files
  const [meshFiles, setMeshFiles] = useState<{ stl: boolean; meta: boolean }>({ stl: false, meta: false })

  // step 3 — seismogram files
  const [waveFiles, setWaveFiles] = useState<{ bin: boolean; dat: boolean }>({ bin: false, dat: false })

  // step 4-6 — simulated progress (per-step gating)
  const [progress, setProgress] = useState(0)
  const [stepDone, setStepDone] = useState<boolean[]>(() => STEPS.map(() => false))
  const timerRef = useRef<number | null>(null)

  // synthesized demo result (inf70 case from design handoff)
  const scenarioTag: ScenarioTag = 'inf70'
  const result = {
    severityPct: 71, locErrMm: 0.28, rhat: 1.028, ess: 223, misfit: '4.4e-3',
    scenarioTag,
  }

  const step = STEPS[idx]
  const last = idx === STEPS.length - 1

  // PHASE 5 stub: replace with real backend API call when ready
  useEffect(() => {
    if (step.kind !== 'process') return
    if (stepDone[idx]) { setProgress(1); return }
    setProgress(0.001)
    let pr = 0
    const totalMs = step.durationMs ?? 3500
    const tickMs = 60
    const inc = (tickMs / totalMs) + 0.005
    timerRef.current = window.setInterval(() => {
      pr += inc + Math.random() * 0.01
      if (pr >= 1) {
        pr = 1
        if (timerRef.current != null) window.clearInterval(timerRef.current)
        setStepDone((s) => { const next = [...s]; next[idx] = true; return next })
      }
      setProgress(pr)
    }, tickMs)
    return () => { if (timerRef.current != null) window.clearInterval(timerRef.current) }
  }, [idx, step.kind, step.durationMs, stepDone])

  // Permissive gating — form steps never block (user can revisit any step);
  // process steps wait for the simulated progress to finish; review is final.
  // The previous strict gating left users stuck on step 0 with an unlit
  // 다음 단계 button when they hadn't typed name/age — confusing UX.
  function canAdvance(): boolean {
    if (step.kind === 'process') {
      return progress >= 1 || stepDone[idx]
    }
    return true
  }

  // Hint shown next to the disabled 다음 단계 button so the user knows why.
  function disabledHint(): string | null {
    if (step.kind === 'process' && !(progress >= 1 || stepDone[idx])) {
      return `${Math.round(progress * 100)}% — 처리 중`
    }
    return null
  }

  function next() {
    // Diagnostic — if a user reports the button "doesn't work", asking them
    // to open DevTools console and click will surface exactly what's
    // happening (e.g., canAdvance returning false on a process step, or
    // the click never reaching this handler at all).
    console.log('[PipelineWizard] next() called — idx:', idx,
      'canAdvance:', canAdvance(),
      'step.kind:', step.kind,
      'progress:', progress,
      'stepDone:', stepDone[idx])
    if (!canAdvance()) return
    if (last) {
      // PHASE 5 stub: when backend creates scan, nav(`/scans/${newScanId}`) instead.
      nav('/')
      return
    }
    setIdx((i) => i + 1)
  }
  const prev = () => idx > 0 && setIdx((i) => i - 1)

  // Build a contextual case summary for the AI sidebar.
  const caseContext = useMemo(() => {
    const parts: string[] = []
    parts.push(`현재 단계: STEP ${step.k} ${step.t} (${step.en})`)
    parts.push(`환자: ${name || '신규 환자'} · MRN ${mrn} · ${sex === 'M' ? '남' : '여'} ${age || '?'}세`)
    if (cc.trim()) parts.push(`주소증: ${cc}`)
    if (tooth) parts.push(`관심 치아: #${tooth} (${labelForFdi(tooth)})`)
    else if (quadrant) parts.push(`관심 분면: ${quadrant}`)
    if (implantNote.trim()) parts.push(`임플란트·보철 특이사항: ${implantNote}`)
    parts.push(`단계 설명: ${step.desc}`)
    return parts.join('\n')
  }, [step, name, mrn, sex, age, cc, tooth, quadrant, implantNote])

  // NUCLEAR OPTION — viewport-fixed footer.
  // Prior attempts (flex-h-full sticky, grid-rows + sticky bottom, plain
  // flex + overflow body) all failed on at least one user monitor. Root
  // cause is brittle: any single mis-applied min-h-0 anywhere in the
  // ancestor chain (Layout <main>, AiSidebar grid track, intrinsic content
  // height of progress strip, subpixel rounding at non-100% DPI) lets the
  // body inflate and pushes the footer below the viewport.
  //
  // Solution: take the footer OUT of the flex/grid chain entirely. Pin it
  // to the bottom of the viewport with position:fixed, offset its left
  // edge by NavRail width (76px) via inline style (bypasses Tailwind class
  // pruning / DPI subpixel issues), and reserve a 96px bottom pad on the
  // body so the last content row never hides under the fixed bar. The
  // footer is now positioned relative to the viewport — independent of
  // every ancestor's height calculation. Cannot fail.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-panel px-6 py-3">
        <div className="h-6 w-6 rounded-md"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-finding-progressed))' }} />
        <span className="text-[13px] font-semibold tracking-tight text-text-strong">새 스캔 파이프라인</span>
        <span className="font-mono text-[10.5px] text-faint">
          {(name || '신규 환자')} · {idx + 1}/{STEPS.length} 단계 · {mrn}
        </span>
        <div className="flex-1" />
        <button onClick={() => nav('/')} title="닫기" className="btn-ghost btn">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step progress */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <StepProgress idx={idx} stepDone={stepDone} />
      </div>

      {/* Body — single scroll container. Bottom padding = footer height
          (~56px) + buffer so the last row of content clears the fixed
          footer on every viewport. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-3 pb-[96px]">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="surface flex min-w-0 flex-col">
            <div className="border-b border-line-soft px-7 pt-6 pb-3">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
                <step.icon className="h-3.5 w-3.5" />
                STEP {step.k} · {step.en}
              </div>
              <h2 className="editorial mt-1.5 text-[28px] leading-tight text-text-strong">{step.t}</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{step.desc}</p>
            </div>

            <div className="px-7 pt-5 pb-7">
              {idx === 0 && <RegisterForm {...{ name, setName, sex, setSex, age, setAge, cc, setCc, mrn }} />}
              {idx === 1 && <ToothPicker {...{ quadrant, setQuadrant, tooth, setTooth, implantNote, setImplantNote }} />}
              {idx === 2 && <MeshUploadPane files={meshFiles} setFiles={setMeshFiles} />}
              {idx === 3 && <WaveUploadPane files={waveFiles} setFiles={setWaveFiles} />}
              {idx === 4 && <ProcessPane step={step} progress={progress} done={stepDone[idx]} visual={<FkFilterViz active={!stepDone[idx]} />} />}
              {idx === 5 && <ProcessPane step={step} progress={progress} done={stepDone[idx]} visual={<LowVelocityViz active={!stepDone[idx]} />} />}
              {idx === 6 && <ProcessPane step={step} progress={progress} done={stepDone[idx]} visual={<McmcViz active={!stepDone[idx]} progress={progress} />} />}
              {idx === 7 && (
                <ReviewPane
                  patientName={name || '신규 환자'}
                  scenarioTag={result.scenarioTag}
                  severityPct={result.severityPct}
                  locErrMm={result.locErrMm}
                  rhat={result.rhat}
                  ess={result.ess}
                  misfit={result.misfit}
                  toothLabel={tooth ? `#${tooth} (${labelForFdi(tooth)})` : '전악 스크리닝'}
                  toothFdi={tooth}
                />
              )}

              {/* Inline action row — ALSO present at the end of every step so the
                  user never depends on the fixed footer being clickable. Some
                  monitor / DPI / extension combinations were intercepting the
                  fixed footer's hit-test; this in-flow row is guaranteed
                  reachable because it scrolls with the body content. */}
              <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={prev}
                  disabled={idx === 0}
                  className="btn disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {idx === 0 ? '이전' : STEPS[idx - 1].t}
                </button>
                <div className="flex items-center gap-3">
                  {!canAdvance() && disabledHint() && (
                    <span className="font-mono text-[10.5px] text-faint">{disabledHint()}</span>
                  )}
                  <button
                    type="button"
                    onClick={next}
                    disabled={!canAdvance()}
                    className="btn btn-primary !px-6 !py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {last ? '완료 · 콘솔에서 보기' : '다음 단계'}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AiSidebar step={step} idx={idx} context={caseContext} />
        </div>
      </div>

      {/* Footer — VIEWPORT-FIXED. Sits above the body via z-30 (modals use
          z-50 so dialogs still cover it). Left offset = NavRail width
          (76px, set inline to bypass Tailwind purge / DPI math). Pinned
          to bottom:0 of the viewport; no parent height math required. */}
      <div
        className="fixed bottom-0 right-0 z-30 flex items-center justify-between border-t border-line bg-panel px-6 py-3 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.18)] pointer-events-auto"
        style={{ left: 76 }}
      >
        <button type="button" onClick={prev} disabled={idx === 0}
          className="btn disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
          {idx === 0 ? '이전' : STEPS[idx - 1].t}
        </button>
        <span className="font-mono text-[10.5px] text-faint">{idx + 1} / {STEPS.length}</span>
        <div className="flex items-center gap-3">
          {!canAdvance() && disabledHint() && (
            <span className="font-mono text-[10.5px] text-faint">{disabledHint()}</span>
          )}
          <button type="button" onClick={next} disabled={!canAdvance()}
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-40">
            {last ? '완료 · 콘솔에서 보기' : '다음 단계'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step progress strip ─────────────────────────────────────────────────────

function StepProgress({ idx, stepDone }: { idx: number; stepDone: boolean[] }) {
  return (
    <div className="flex items-center px-0.5">
      {STEPS.map((s, i) => {
        const done = i < idx || stepDone[i]
        const cur = i === idx
        const dotCls = done
          ? 'bg-good text-white border-good'
          : cur
            ? 'bg-accent-soft border-accent text-accent-strong'
            : 'border-line text-faint bg-transparent'
        const labelCls = cur ? 'font-semibold text-text-strong' : done ? 'text-text' : 'text-faint'
        return (
          <div key={i} className="flex min-w-0 flex-shrink items-center">
            <div className="flex flex-shrink-0 items-center gap-2">
              <div className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] font-mono text-[11px] font-bold ${dotCls}`}>
                {done ? <Check className="h-3 w-3" /> : s.k}
              </div>
              <span className={`whitespace-nowrap text-[11px] ${labelCls}`}>{s.t}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-2.5 min-w-[10px] flex-1 ${done ? 'bg-good' : 'bg-line'}`} style={{ height: 1.5 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Form pieces ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</span>
      {children}
    </label>
  )
}

function RegisterForm({
  name, setName, sex, setSex, age, setAge, cc, setCc, mrn,
}: {
  name: string; setName: (s: string) => void
  sex: 'M' | 'F'; setSex: (s: 'M' | 'F') => void
  age: string; setAge: (s: string) => void
  cc: string; setCc: (s: string) => void
  mrn: string
}) {
  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
        <Field label="이름">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="환자 이름" className="wiz-input" autoFocus />
        </Field>
        <Field label="성별">
          <div className="flex gap-1.5">
            {(['M', 'F'] as const).map((k) => (
              <button key={k} onClick={() => setSex(k)}
                className={`h-[38px] flex-1 rounded-[9px] border text-[12px] font-semibold ${
                  sex === k ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-panel text-muted'
                }`}>
                {k === 'M' ? '남' : '여'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="나이">
          <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))}
            placeholder="45" className="wiz-input" inputMode="numeric" />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="주소증 (Chief complaint)">
          <input value={cc} onChange={(e) => setCc(e.target.value)}
            placeholder="예) 우측 어금니 부위 잇몸 출혈·불편감" className="wiz-input" />
        </Field>
      </div>

      <div className="surface-flat mt-5 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">신규 MRN</span>
          <span className="font-mono text-[12px] font-semibold text-text-strong">{mrn}</span>
          <span className="ml-auto text-[10.5px] text-faint">자동 생성 · 저장 시 확정</span>
        </div>
      </div>

      <style>{`
        .wiz-input {
          width: 100%; height: 38px; padding: 0 12px;
          border-radius: 9px; border: 1px solid var(--color-line);
          background: var(--color-panel); color: var(--color-text);
          font-size: 13px; outline: none;
          transition: border-color 160ms var(--ease-out), background-color 160ms var(--ease-out);
        }
        .wiz-input:focus { border-color: var(--color-accent-line); background: var(--color-panel-2); }
        .wiz-input::placeholder { color: var(--color-faint); }
      `}</style>
    </div>
  )
}

function ToothPicker({
  quadrant, setQuadrant, tooth, setTooth, implantNote, setImplantNote,
}: {
  quadrant: 'UR' | 'UL' | 'LL' | 'LR' | null
  setQuadrant: (q: 'UR' | 'UL' | 'LL' | 'LR' | null) => void
  tooth: number | null
  setTooth: (n: number | null) => void
  implantNote: string
  setImplantNote: (s: string) => void
}) {
  const fdiList = quadrant ? FDI_BY_QUAD[quadrant] : []
  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">분면</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUADRANTS.map((q) => (
          <button key={q.k}
            onClick={() => { setQuadrant(q.k); setTooth(null) }}
            className={`flex flex-col items-start gap-0.5 rounded-[10px] border px-3 py-2.5 text-left ${
              quadrant === q.k ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-accent-line'
            }`}>
            <span className={`font-mono text-[10.5px] font-bold ${quadrant === q.k ? 'text-accent-strong' : 'text-muted'}`}>{q.k}</span>
            <span className={`text-[12px] ${quadrant === q.k ? 'font-semibold text-text-strong' : 'text-text'}`}>{q.label}</span>
          </button>
        ))}
      </div>

      {quadrant && (
        <>
          <div className="mt-5 mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">치아 (FDI)</div>
          <div className="flex flex-wrap gap-1.5">
            {fdiList.map((n) => (
              <button key={n} onClick={() => setTooth(n)}
                className={`flex h-9 w-12 items-center justify-center rounded-[8px] border font-mono text-[12px] font-semibold ${
                  tooth === n ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-text hover:border-accent-line'
                }`}>
                {n}
              </button>
            ))}
          </div>

          {tooth && (
            <div className="surface-flat mt-5 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-accent-soft font-mono text-[11px] font-bold text-accent-strong">#{tooth}</div>
                <div>
                  <div className="text-[12.5px] font-semibold text-text-strong">{labelForFdi(tooth)}</div>
                  <div className="font-mono text-[10.5px] text-muted">관심 영역 · 역산 시 사전확률 가중</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <Field label="임플란트 · 보철 특이사항 (선택)">
          <input value={implantNote} onChange={(e) => setImplantNote(e.target.value)}
            placeholder="예) #26 임플란트, #36 PFM 크라운"
            className="wiz-input" />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11.5px] text-muted">
        <button onClick={() => setTooth(null)} className="chip">위치 미지정 · 전악 스크리닝</button>
      </div>

      <style>{`
        .wiz-input {
          width: 100%; height: 38px; padding: 0 12px;
          border-radius: 9px; border: 1px solid var(--color-line);
          background: var(--color-panel); color: var(--color-text);
          font-size: 13px; outline: none;
          transition: border-color 160ms var(--ease-out), background-color 160ms var(--ease-out);
        }
        .wiz-input:focus { border-color: var(--color-accent-line); background: var(--color-panel-2); }
        .wiz-input::placeholder { color: var(--color-faint); }
      `}</style>
    </div>
  )
}

// ── Upload panes (step 02 mesh, step 03 wave) ───────────────────────────────

function MeshUploadPane({
  files, setFiles,
}: {
  files: { stl: boolean; meta: boolean }
  setFiles: (s: { stl: boolean; meta: boolean }) => void
}) {
  const both = files.stl && files.meta
  return (
    <div className="max-w-2xl">
      <ToothScanViz active={!both} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {/* PHASE 5 stub: replace with real file picker / signed upload when backend is ready */}
        <Dropzone label="intraoral_scan.stl" hint="3D 표면 메시 (~5 MB)"
          done={files.stl} onClick={() => setFiles({ ...files, stl: true })} />
        <Dropzone label="mesh_metadata" hint="scan landmarks · 정합 좌표계"
          done={files.meta} onClick={() => setFiles({ ...files, meta: true })} />
      </div>

      <button onClick={() => setFiles({ stl: true, meta: true })}
        className="mt-3 chip text-[10.5px]">
        임의 데이터로 대체 (표준 악궁 모형 로드)
      </button>

      {both && (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-good">
          <Check className="h-3.5 w-3.5" /> 메시 · 메타 정합 완료 · 격자 변환 준비됨.
        </div>
      )}
      {!both && (
        <div className="mt-4 text-[11.5px] text-faint">
          STL과 메타데이터가 모두 업로드되어야 다음 단계로 진행할 수 있습니다.
        </div>
      )}
    </div>
  )
}

function WaveUploadPane({
  files, setFiles,
}: {
  files: { bin: boolean; dat: boolean }
  setFiles: (s: { bin: boolean; dat: boolean }) => void
}) {
  const both = files.bin && files.dat
  return (
    <div className="max-w-2xl">
      <SeismogramViz active={!both} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Dropzone label="seismogram.bin" hint="100 ch × 75,000 step · float32"
          done={files.bin} onClick={() => setFiles({ ...files, bin: true })} />
        <Dropzone label="measurement_metadata.dat" hint="geometry · dt · num_recv"
          done={files.dat} onClick={() => setFiles({ ...files, dat: true })} />
      </div>

      <button onClick={() => setFiles({ bin: true, dat: true })}
        className="mt-3 chip text-[10.5px]">
        임의 데이터로 대체 (inf70 synthetic case 로드)
      </button>

      {both && (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-good">
          <Check className="h-3.5 w-3.5" /> 두 파일은 동일 측정 세션의 쌍으로 확인되었습니다.
        </div>
      )}
      {!both && (
        <div className="mt-4 text-[11.5px] text-faint">
          두 파일이 모두 업로드되어야 다음 단계로 진행할 수 있습니다.
        </div>
      )}
    </div>
  )
}

function Dropzone({
  label, hint, done, onClick,
}: { label: string; hint: string; done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-[12px] px-4 py-5"
      style={{
        border: `1.5px dashed ${done ? 'var(--color-good)' : 'var(--color-line)'}`,
        background: done
          ? 'color-mix(in srgb, var(--color-good) 8%, transparent)'
          : 'color-mix(in srgb, var(--color-panel-2) 28%, transparent)',
      }}>
      {done ? <Check className="h-5 w-5 text-good" /> : <Upload className="h-5 w-5 text-muted" />}
      <span className={`text-[12.5px] font-bold ${done ? 'text-good' : 'text-text'}`}>
        {done ? `${label} 업로드됨` : label}
      </span>
      <span className="font-mono text-[10px] text-faint text-center">{hint}</span>
    </button>
  )
}

// ── Process pane (steps 04, 05, 06) ────────────────────────────────────────

function ProcessPane({
  step, progress, done, visual,
}: {
  step: Step
  progress: number
  done: boolean
  visual: React.ReactNode
}) {
  return (
    <div className="max-w-2xl">
      {visual}

      <div className="mt-5 flex flex-col gap-2">
        {step.bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[12.5px] text-text">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-accent-soft font-mono text-[10px] font-bold text-accent-strong">{i + 1}</span>
            {b}
          </div>
        ))}
      </div>

      <div className="mt-6">
        {/* PHASE 5 stub: replace with real backend API call when ready */}
        <ProgressBar label={done ? `${step.t} 완료` : `${step.t} 처리 중`} progress={progress} done={done} />
      </div>
    </div>
  )
}

function ProgressBar({ label, progress, done }: { label: string; progress: number; done: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)
  const barColor = done ? 'var(--color-good)' : 'var(--color-accent)'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-[11.5px] font-semibold ${done ? 'text-good' : 'text-accent-strong'}`}>{label}</span>
        <span className="font-mono text-[11px] text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full transition-[width] duration-100 ease-out"
          style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  )
}

// ── Per-step SVG animations ────────────────────────────────────────────────

function VizFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="surface-flat relative overflow-hidden"
      style={{ height: 280 }}>
      <div className="absolute left-3 top-2 z-10 font-mono text-[9.5px] uppercase tracking-wider text-faint">
        {label}
      </div>
      {children}
    </div>
  )
}

// Step 02 — tooth scan with scanline
function ToothScanViz({ active }: { active: boolean }) {
  return (
    <VizFrame label="3D mesh acquisition · scanline">
      <svg viewBox="0 0 560 260" className="h-full w-full">
        <defs>
          <linearGradient id="tooth-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-panel-2)" />
            <stop offset="100%" stopColor="var(--color-panel)" />
          </linearGradient>
          <linearGradient id="scan-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--color-accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* tooth silhouette (molar-ish) */}
        <g transform="translate(280 145)">
          <path d="M -70 -50 C -80 -85 -55 -100 -30 -95 C -10 -100 10 -100 30 -95 C 55 -100 80 -85 70 -50 C 75 -20 65 25 50 55 C 40 75 20 85 5 80 C -5 85 -20 80 -30 65 C -55 60 -75 30 -75 -10 C -78 -25 -75 -38 -70 -50 Z"
            fill="url(#tooth-grad)" stroke="var(--color-line)" strokeWidth="1.5" />
          {/* cusps */}
          <ellipse cx="-32" cy="-55" rx="14" ry="10" fill="none" stroke="var(--color-line-soft)" strokeWidth="1" />
          <ellipse cx="32" cy="-55" rx="14" ry="10" fill="none" stroke="var(--color-line-soft)" strokeWidth="1" />
          <ellipse cx="0" cy="-30" rx="10" ry="8" fill="none" stroke="var(--color-line-soft)" strokeWidth="1" />
          {/* root hint */}
          <path d="M -30 65 L -25 95 M 5 80 L 5 100 M 30 60 L 35 95"
            stroke="var(--color-line)" strokeWidth="1.2" fill="none" opacity="0.6" />
          {/* mesh grid overlay */}
          <g opacity="0.35" stroke="var(--color-accent-line)" strokeWidth="0.6" fill="none">
            <path d="M -60 -40 L 60 -40 M -65 -20 L 65 -20 M -70 0 L 70 0 M -68 20 L 68 20 M -55 40 L 55 40 M -40 60 L 40 60" />
            <path d="M -40 -80 L -40 70 M -20 -90 L -20 75 M 0 -95 L 0 80 M 20 -90 L 20 75 M 40 -80 L 40 70" />
          </g>
        </g>

        {/* scanline */}
        {active && (
          <rect x="0" y="0" width="560" height="6" fill="url(#scan-grad)">
            <animate attributeName="y" from="-10" to="260" dur="2.4s" repeatCount="indefinite" />
          </rect>
        )}

        {/* corner markers */}
        <g stroke="var(--color-accent)" strokeWidth="1.2" fill="none" opacity="0.7">
          <path d="M 16 220 L 16 236 L 32 236" />
          <path d="M 544 220 L 544 236 L 528 236" />
          <path d="M 16 36 L 16 20 L 32 20" />
          <path d="M 544 36 L 544 20 L 528 20" />
        </g>
      </svg>
    </VizFrame>
  )
}

// Step 03 — animated seismogram trace (scrolling)
function SeismogramViz({ active }: { active: boolean }) {
  // Pre-generate 3 traces — sine × Gaussian envelope, sampled.
  const traces = useMemo(() => {
    const ts: { d: string; y: number }[] = []
    for (let row = 0; row < 4; row++) {
      const yc = 50 + row * 50
      const phase = row * 0.7
      const env = (x: number) => Math.exp(-Math.pow((x - 280) / 90, 2))
      let d = `M 0 ${yc}`
      for (let x = 0; x <= 560; x += 4) {
        const k = 0.08 + row * 0.01
        const amp = 22 * env(x)
        const y = yc + amp * Math.sin(x * k + phase)
        d += ` L ${x} ${y.toFixed(1)}`
      }
      ts.push({ d, y: yc })
    }
    return ts
  }, [])

  return (
    <VizFrame label="seismogram preview · 4 / 100 ch">
      <svg viewBox="0 0 560 260" className="h-full w-full">
        <defs>
          <linearGradient id="seis-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-panel)" stopOpacity="1" />
            <stop offset="8%" stopColor="var(--color-panel)" stopOpacity="0" />
            <stop offset="92%" stopColor="var(--color-panel)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-panel)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* grid */}
        <g stroke="var(--color-line-soft)" strokeWidth="0.5">
          {[40, 80, 120, 160, 200].map((y) => (
            <line key={y} x1="0" y1={y} x2="560" y2={y} />
          ))}
          {[80, 160, 240, 320, 400, 480].map((x) => (
            <line key={x} x1={x} y1="20" x2={x} y2="240" />
          ))}
        </g>

        {/* traces */}
        <g>
          {traces.map((t, i) => (
            <g key={i}>
              <text x="6" y={t.y - 18} className="font-mono" fontSize="9"
                fill="var(--color-faint)">ch {(i + 1) * 25}</text>
              <path d={t.d} fill="none"
                stroke={i === 1 ? 'var(--color-accent)' : 'var(--color-text)'}
                strokeWidth={i === 1 ? 1.4 : 1}
                opacity={i === 1 ? 1 : 0.7}>
                {active && (
                  <animateTransform attributeName="transform" type="translate"
                    from="560 0" to="-560 0" dur="3.6s" repeatCount="indefinite" />
                )}
              </path>
              {/* second copy for seamless scroll */}
              <path d={t.d} fill="none"
                stroke={i === 1 ? 'var(--color-accent)' : 'var(--color-text)'}
                strokeWidth={i === 1 ? 1.4 : 1}
                opacity={i === 1 ? 1 : 0.7}
                transform="translate(560 0)">
                {active && (
                  <animateTransform attributeName="transform" type="translate"
                    from="0 0" to="-1120 0" dur="3.6s" repeatCount="indefinite" />
                )}
              </path>
            </g>
          ))}
        </g>

        {/* edge fade */}
        <rect x="0" y="0" width="560" height="260" fill="url(#seis-fade)" />

        {/* legend */}
        <g>
          <rect x="430" y="226" width="120" height="22" rx="4"
            fill="var(--color-panel)" opacity="0.85" />
          <text x="440" y="241" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">30 kHz Ricker · dt = 4 ns</text>
        </g>
      </svg>
    </VizFrame>
  )
}

// Step 04 — f-k heatmap with sweeping mask
function FkFilterViz({ active }: { active: boolean }) {
  // Pre-built heatmap grid 28x14
  const cells = useMemo(() => {
    const out: { x: number; y: number; v: number }[] = []
    const cols = 28, rows = 14
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fk = Math.abs((c - cols / 2) / (cols / 2))
        const ky = Math.abs((r - rows / 2) / (rows / 2))
        const surface = Math.exp(-Math.pow((Math.abs(fk - ky * 0.7)) * 2.4, 2)) * 0.9
        const bulk = Math.exp(-Math.pow((fk - 0.15) * 3, 2)) * 0.45
        const noise = Math.random() * 0.12
        out.push({ x: c, y: r, v: Math.min(1, surface + bulk + noise) })
      }
    }
    return { cells: out, cols, rows }
  }, [])

  const cellW = 560 / cells.cols
  const cellH = 220 / cells.rows
  const colorFor = (v: number) => {
    // accent at low, finding at high — non-linear
    const t = Math.pow(v, 0.8)
    if (t < 0.25) return `color-mix(in srgb, var(--color-panel-2) ${100 - t * 200}%, var(--color-accent) ${t * 200}%)`
    if (t < 0.65) return `color-mix(in srgb, var(--color-accent) ${100 - (t - 0.25) * 200}%, var(--color-warn) ${(t - 0.25) * 200}%)`
    return `color-mix(in srgb, var(--color-warn) ${100 - (t - 0.65) * 280}%, var(--color-bad) ${(t - 0.65) * 280}%)`
  }

  return (
    <VizFrame label="frequency–wavenumber plane · velocity fan mask">
      <svg viewBox="0 0 560 260" className="h-full w-full">
        {/* heatmap */}
        <g transform="translate(0 30)">
          {cells.cells.map((c, i) => (
            <rect key={i}
              x={c.x * cellW} y={c.y * cellH}
              width={cellW + 0.6} height={cellH + 0.6}
              fill={colorFor(c.v)} opacity="0.92" />
          ))}
        </g>

        {/* axes */}
        <g stroke="var(--color-line)" strokeWidth="0.8" fill="none">
          <line x1="0" y1="250" x2="560" y2="250" />
          <line x1="0" y1="30" x2="0" y2="250" />
        </g>
        <text x="540" y="244" textAnchor="end" className="font-mono" fontSize="9.5"
          fill="var(--color-muted)">k →</text>
        <text x="8" y="42" className="font-mono" fontSize="9.5"
          fill="var(--color-muted)">f ↑</text>

        {/* velocity fan mask (sweeping wedge that fades the surface-wave region) */}
        <g>
          <defs>
            <linearGradient id="fan-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-panel)" stopOpacity="0" />
              <stop offset="60%" stopColor="var(--color-panel)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--color-panel)" stopOpacity="0.85" />
            </linearGradient>
            <clipPath id="fan-clip">
              <polygon points="0,250 560,30 560,250" />
            </clipPath>
          </defs>
          <polygon points="0,250 560,30 560,250"
            fill="url(#fan-grad)" stroke="var(--color-bad)" strokeWidth="1.2"
            strokeDasharray="3 3" opacity="0.85" />
          <text x="475" y="225" textAnchor="end"
            className="font-mono" fontSize="9.5" fill="var(--color-bad)">surface-wave mask</text>
          {active && (
            <g clipPath="url(#fan-clip)">
              <rect x="-40" y="20" width="60" height="240"
                fill="var(--color-accent)" opacity="0.35">
                <animate attributeName="x" from="-40" to="560" dur="2.6s" repeatCount="indefinite" />
              </rect>
            </g>
          )}
        </g>

        {/* legend */}
        <g transform="translate(370 4)">
          <rect width="180" height="22" rx="4"
            fill="var(--color-panel)" opacity="0.88" />
          <text x="8" y="15" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">2D FFT · velocity fan filter</text>
        </g>
      </svg>
    </VizFrame>
  )
}

// Step 05 — polar arc of 100 receivers, a few light up red
function LowVelocityViz({ active }: { active: boolean }) {
  const N = 100
  // Pre-build receivers on arc
  const recv = useMemo(() => {
    const arr: { x: number; y: number; ang: number; isCand: boolean; idx: number }[] = []
    const cx = 280, cy = 180, R = 130
    const candIdx = new Set([8, 9, 10, 11, 45, 46, 47, 76, 77])
    for (let i = 0; i < N; i++) {
      const ang = Math.PI + (Math.PI * i) / (N - 1) // upper arc, π → 2π
      const x = cx + R * Math.cos(ang)
      const y = cy + R * Math.sin(ang)
      arr.push({ x, y, ang, isCand: candIdx.has(i), idx: i })
    }
    return arr
  }, [])

  // simulated rays from a hot candidate to other receivers
  const rays = useMemo(() => {
    const cx = 280, cy = 180
    const focal = { x: cx - 60, y: cy - 80 } // virtual lesion focus
    return [recv[8], recv[10], recv[46], recv[77]].map((r) => ({
      x1: r.x, y1: r.y, x2: focal.x, y2: focal.y,
    }))
  }, [recv])

  return (
    <VizFrame label="low-velocity energy map · 100 receivers">
      <svg viewBox="0 0 560 260" className="h-full w-full">
        {/* arch silhouette */}
        <path d="M 80 200 Q 280 30 480 200"
          fill="none" stroke="var(--color-line)" strokeWidth="1.5" strokeDasharray="2 4" />
        <text x="280" y="225" textAnchor="middle"
          className="font-mono" fontSize="9.5"
          fill="var(--color-faint)">dental arch · receivers along inner surface</text>

        {/* energy focus halo */}
        <g>
          <circle cx="220" cy="100" r="32"
            fill="var(--color-bad)" opacity="0.18">
            {active && (
              <animate attributeName="r" values="22;36;22" dur="2.4s" repeatCount="indefinite" />
            )}
          </circle>
          <circle cx="220" cy="100" r="6"
            fill="var(--color-bad)" opacity="0.85" />
          <text x="220" y="78" textAnchor="middle"
            className="font-mono" fontSize="9.5"
            fill="var(--color-bad)">candidate voxel</text>
        </g>

        {/* rays from candidate receivers to focus */}
        {active && rays.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            stroke="var(--color-bad)" strokeWidth="0.9" opacity="0.55"
            strokeDasharray="2 3">
            <animate attributeName="opacity" values="0.15;0.75;0.15"
              dur={`${1.6 + i * 0.25}s`} repeatCount="indefinite" />
          </line>
        ))}

        {/* receivers */}
        {recv.map((r) => (
          <circle key={r.idx} cx={r.x} cy={r.y}
            r={r.isCand ? 3.6 : 2.2}
            fill={r.isCand ? 'var(--color-bad)' : 'var(--color-accent)'}
            opacity={r.isCand ? 0.95 : 0.55}>
            {r.isCand && active && (
              <animate attributeName="opacity" values="0.4;1;0.4"
                dur={`${1.2 + (r.idx % 5) * 0.15}s`} repeatCount="indefinite" />
            )}
          </circle>
        ))}

        {/* legend */}
        <g transform="translate(380 8)">
          <rect width="170" height="38" rx="5"
            fill="var(--color-panel)" opacity="0.85" />
          <circle cx="14" cy="14" r="3" fill="var(--color-accent)" />
          <text x="24" y="17" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">normal receiver</text>
          <circle cx="14" cy="30" r="3.6" fill="var(--color-bad)" />
          <text x="24" y="33" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">high low-vel energy</text>
        </g>
      </svg>
    </VizFrame>
  )
}

// Step 06 — particles converging
function McmcViz({ active, progress }: { active: boolean; progress: number }) {
  const N = 36
  // Pre-randomize initial particle positions and target offsets.
  const particles = useMemo(() => {
    const arr: { sx: number; sy: number; tx: number; ty: number; delay: number }[] = []
    for (let i = 0; i < N; i++) {
      const a = (i * 137.5) % 360 * (Math.PI / 180)
      const r = 70 + (i % 6) * 8
      arr.push({
        sx: 280 + r * Math.cos(a),
        sy: 130 + r * Math.sin(a),
        tx: 280 + (Math.random() - 0.5) * 14,
        ty: 130 + (Math.random() - 0.5) * 14,
        delay: (i % 12) * 0.08,
      })
    }
    return arr
  }, [])

  // ease: 0 → 1 over progress, with mid-bulge for "exploration"
  const t = Math.max(0, Math.min(1, progress))
  const conv = t * t  // accelerating convergence

  return (
    <VizFrame label="Metropolis-Hastings walkers · 1,000 steps">
      <svg viewBox="0 0 560 260" className="h-full w-full">
        {/* target ring (posterior mode) */}
        <circle cx="280" cy="130" r="48"
          fill="none" stroke="var(--color-accent-line)" strokeWidth="1"
          strokeDasharray="3 4" opacity="0.6" />
        <circle cx="280" cy="130" r="22"
          fill="var(--color-accent)" opacity="0.10" />
        <circle cx="280" cy="130" r="4"
          fill="var(--color-accent)" opacity="0.9" />

        {/* particles */}
        {particles.map((p, i) => {
          const x = p.sx + (p.tx - p.sx) * conv
          const y = p.sy + (p.ty - p.sy) * conv
          const opacity = 0.35 + 0.55 * conv
          return (
            <g key={i}>
              {/* trajectory hint line at higher progress */}
              {conv > 0.3 && (
                <line x1={p.sx} y1={p.sy} x2={x} y2={y}
                  stroke="var(--color-accent)" strokeWidth="0.4" opacity={0.06 + 0.18 * conv} />
              )}
              <circle cx={x} cy={y} r={2.3} fill="var(--color-accent)" opacity={opacity}>
                {active && (
                  <animate attributeName="cx" values={`${x};${x + (Math.random() - 0.5) * 6};${x}`}
                    dur={`${0.6 + p.delay}s`} repeatCount="indefinite" />
                )}
                {active && (
                  <animate attributeName="cy" values={`${y};${y + (Math.random() - 0.5) * 6};${y}`}
                    dur={`${0.6 + p.delay}s`} repeatCount="indefinite" />
                )}
              </circle>
            </g>
          )
        })}

        {/* labels */}
        <text x="280" y="220" textAnchor="middle"
          className="font-mono" fontSize="9.5" fill="var(--color-faint)">
          posterior samples → lesion (x, y, z, r)
        </text>

        {/* legend */}
        <g transform="translate(370 8)">
          <rect width="180" height="38" rx="5"
            fill="var(--color-panel)" opacity="0.85" />
          <circle cx="14" cy="14" r="3" fill="var(--color-accent)" />
          <text x="24" y="17" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">walker (n = {N})</text>
          <circle cx="14" cy="30" r="3" fill="none"
            stroke="var(--color-accent-line)" strokeDasharray="2 2" />
          <text x="24" y="33" className="font-mono" fontSize="9.5"
            fill="var(--color-muted)">95% credible region</text>
        </g>

        {/* convergence indicator */}
        <g transform="translate(20 18)">
          <text x="0" y="0" className="font-mono" fontSize="10"
            fill="var(--color-accent-strong)">
            R̂ ≈ {(1.18 - 0.16 * conv).toFixed(3)} · ESS {Math.round(60 + 200 * conv)}
          </text>
        </g>
      </svg>
    </VizFrame>
  )
}

// ── Review pane ────────────────────────────────────────────────────────────

function ReviewPane({
  patientName, scenarioTag, severityPct, locErrMm, rhat, ess, misfit, toothLabel, toothFdi,
}: {
  patientName: string; scenarioTag: ScenarioTag
  severityPct: number; locErrMm: number; rhat: number; ess: number; misfit: string
  toothLabel: string; toothFdi: number | null
}) {
  const v = verdict(severityPct)
  const pillCls = v.tone === 'good' ? 'pill-good' : v.tone === 'bad' ? 'pill-bad' : 'pill-warn'
  const dotCls = v.tone === 'good' ? 'bg-good' : v.tone === 'bad' ? 'bg-bad' : 'bg-warn'
  const scenarioLabel = scenarioTag === 'healthy' ? '정상' : scenarioTag === 'inf70' ? '염증 70%' : '염증 80%'
  const borderColor =
    v.tone === 'bad' ? 'color-mix(in srgb, var(--color-bad) 32%, transparent)'
    : v.tone === 'warn' ? 'color-mix(in srgb, var(--color-warn) 32%, transparent)'
    : 'color-mix(in srgb, var(--color-good) 32%, transparent)'
  const bgColor =
    v.tone === 'bad' ? 'color-mix(in srgb, var(--color-bad) 6%, transparent)'
    : v.tone === 'warn' ? 'color-mix(in srgb, var(--color-warn) 6%, transparent)'
    : 'color-mix(in srgb, var(--color-good) 6%, transparent)'

  return (
    <div className="max-w-2xl">
      <div className="grid items-stretch gap-3 rounded-[14px] border px-5 py-5"
        style={{ borderColor, background: bgColor, gridTemplateColumns: 'auto 1fr auto' }}>
        <SeverityDial pct={severityPct} tone={v.tone} />
        <div className="min-w-0 self-center">
          <span className={`pill ${pillCls}`}>
            <span className={`status-dot ${dotCls}`} />
            {v.label} · {v.ko}
          </span>
          <div className="editorial mt-2 text-[22px] leading-tight text-text-strong">{patientName}</div>
          <div className="mt-0.5 text-[12.5px] text-muted">{toothLabel}</div>
          <div className="mt-1 font-mono text-[10.5px] text-faint">
            loc err <span className="text-text">{locErrMm.toFixed(2)} mm</span>
            <span className="mx-1.5">·</span>
            R̂ <span className="text-text">{rhat.toFixed(3)}</span>
            <span className="mx-1.5">·</span>
            scenario <span className="text-text">{scenarioLabel}</span>
          </div>
        </div>
        <ToothDiagram fdi={toothFdi} tone={v.tone} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Severity" value={`${severityPct}`} unit="%" tone={severityPct >= 80 ? 'bad' : severityPct >= 50 ? 'warn' : 'good'} />
        <Kpi label="Loc err" value={locErrMm.toFixed(2)} unit="mm" tone={locErrMm <= 0.3 ? 'good' : 'warn'} />
        <Kpi label="R̂" value={rhat.toFixed(3)} unit="" tone={rhat < 1.05 ? 'good' : 'warn'} />
        <Kpi label="ESS" value={String(ess)} unit="/1000" tone={ess >= 200 ? 'good' : 'warn'} />
      </div>

      <div className="surface-flat mt-3 flex items-center gap-3 px-3.5 py-2.5 text-[11.5px]">
        <FileBox className="h-3.5 w-3.5 text-muted" />
        <span className="text-muted">best misfit</span>
        <span className="font-mono font-semibold text-text-strong">{misfit}</span>
        <span className="mx-2 text-faint">·</span>
        <span className="text-muted">scenario_tag</span>
        <span className="font-mono font-semibold text-accent-strong">{scenarioTag}</span>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">권고 액션</div>
        <div className="flex flex-col gap-2">
          {recommendedActions(severityPct).map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-[10px] border px-3.5 py-2.5 ${
              a.tone === 'bad' ? 'border-bad/30 bg-bad/[0.05]'
              : a.tone === 'warn' ? 'border-warn/30 bg-warn/[0.05]'
              : 'border-good/30 bg-good/[0.05]'
            }`}>
              <div className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                a.tone === 'bad' ? 'bg-bad' : a.tone === 'warn' ? 'bg-warn' : 'bg-good'
              }`} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-text-strong">{a.t}</div>
                <div className="text-[11.5px] text-muted">{a.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface Action { t: string; d: string; tone: 'good' | 'warn' | 'bad' }
function recommendedActions(sev: number): Action[] {
  if (sev >= 80) return [
    { t: '전문의 의뢰', d: '치주과 의뢰 — 정밀 검사 및 치료 계획 수립', tone: 'bad' },
    { t: '임상 검진', d: '해당 부위 프로빙 깊이·출혈 지수 확인', tone: 'warn' },
    { t: '재촬영 권고', d: '4주 후 추적 스캔으로 진행 양상 확인', tone: 'warn' },
  ]
  if (sev >= 50) return [
    { t: '임상 검토', d: '대면 검진으로 시각적 소견 교차 확인', tone: 'warn' },
    { t: '추적 관찰', d: '8–12주 간격 재스캔 권고', tone: 'warn' },
  ]
  return [{ t: '경과 관찰', d: '정기 검진 주기 유지 — 추가 조치 불필요', tone: 'good' }]
}

function Kpi({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-bad'
  return (
    <div className="surface-flat px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-mono text-[20px] font-semibold ${cls}`}>{value}</span>
        {unit && <span className="font-mono text-[10.5px] text-muted">{unit}</span>}
      </div>
    </div>
  )
}

function SeverityDial({ pct, tone }: { pct: number; tone: 'good' | 'warn' | 'bad' }) {
  const size = 86, stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const color = tone === 'bad' ? 'var(--color-bad)' : tone === 'warn' ? 'var(--color-warn)' : 'var(--color-good)'
  return (
    <div className="relative flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-[22px] font-bold leading-none text-text-strong">{pct}</span>
        <span className="font-mono text-[9px] text-faint">/ 100</span>
      </div>
    </div>
  )
}

// Mini tooth diagram with lesion overlay (review pane)
function ToothDiagram({ fdi, tone }: { fdi: number | null; tone: 'good' | 'warn' | 'bad' }) {
  const lesionColor = tone === 'bad' ? 'var(--color-bad)' : tone === 'warn' ? 'var(--color-warn)' : 'var(--color-good)'
  return (
    <div className="surface-flat flex flex-col items-center justify-center" style={{ width: 110 }}>
      <svg viewBox="0 0 80 100" width={80} height={92}>
        <defs>
          <radialGradient id="lesion-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={lesionColor} stopOpacity="0.75" />
            <stop offset="100%" stopColor={lesionColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* crown */}
        <path d="M 14 30 C 10 12 26 4 40 8 C 54 4 70 12 66 30 C 70 50 60 65 50 70 C 42 76 38 76 30 70 C 20 65 10 50 14 30 Z"
          fill="var(--color-panel-2)" stroke="var(--color-line)" strokeWidth="1.2" />
        {/* roots */}
        <path d="M 26 70 L 22 92 M 40 72 L 40 95 M 54 70 L 58 92"
          fill="none" stroke="var(--color-line)" strokeWidth="1.2" />
        {/* lesion glow */}
        <circle cx="46" cy="58" r="14" fill="url(#lesion-glow)" />
        <circle cx="46" cy="58" r="4" fill={lesionColor} opacity="0.95" />
      </svg>
      <div className="mt-1 font-mono text-[9.5px] text-faint">
        {fdi ? `#${fdi}` : 'arch'}
      </div>
    </div>
  )
}

// ── AI sidebar with working askClaude integration ──────────────────────────

function AiSidebar({ step, idx, context }: { step: Step; idx: number; context: string }) {
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset reply when step changes — replies belong to a step.
  useEffect(() => { setReply(null); setError(null); setQuestion('') }, [idx])

  async function ask() {
    const q = question.trim() || `이 단계(${step.t})에서 임상의가 가장 먼저 확인해야 할 점은 무엇인가요?`
    setLoading(true); setError(null); setReply(null)
    try {
      const r = await askClaude({
        context,
        mode: 'doctor',
        question: q,
      })
      setReply(r)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'AI 호출 실패'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
      <div className="surface flex-shrink-0 px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-[6px]"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-finding-progressed))' }}>
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <span className="text-[11.5px] font-bold text-text-strong">AI 가이드</span>
          <span className="ml-auto font-mono text-[9.5px] text-faint">STEP {step.k}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-text">{step.ai}</p>

        <div className="mt-3 flex flex-col gap-1.5">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="이 단계에 대해 추가로 묻고 싶은 점을 입력하세요…"
            rows={2}
            className="ai-q-input"
          />
          <button onClick={ask} disabled={loading}
            className="btn btn-primary justify-center text-[11px] disabled:cursor-not-allowed disabled:opacity-60">
            {loading
              ? <><Loader2 className="h-3 w-3 animate-spin" /> 응답 생성 중…</>
              : <><Send className="h-3 w-3" /> AI에게 더 묻기</>}
          </button>
        </div>

        {(reply || error) && (
          <div className="mt-3 rounded-[8px] border px-3 py-2.5"
            style={{
              borderColor: error
                ? 'color-mix(in srgb, var(--color-bad) 32%, transparent)'
                : 'var(--color-accent-line)',
              background: error
                ? 'color-mix(in srgb, var(--color-bad) 5%, transparent)'
                : 'color-mix(in srgb, var(--color-accent) 5%, transparent)',
            }}>
            {error ? (
              <div className="text-[11.5px] text-bad">{error}</div>
            ) : (
              <div className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-text">{reply}</div>
            )}
          </div>
        )}

        <style>{`
          .ai-q-input {
            width: 100%; padding: 8px 10px;
            border-radius: 8px; border: 1px solid var(--color-line);
            background: var(--color-panel); color: var(--color-text);
            font-size: 11.5px; line-height: 1.4; outline: none; resize: none;
            font-family: inherit;
            transition: border-color 160ms var(--ease-out);
          }
          .ai-q-input:focus { border-color: var(--color-accent-line); background: var(--color-panel-2); }
          .ai-q-input::placeholder { color: var(--color-faint); }
        `}</style>
      </div>

      <div className="surface flex-shrink-0 px-4 py-3.5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-wider text-faint">이 단계에서 확인할 것</div>
        <ul className="flex flex-col gap-1.5">
          {step.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[11.5px] text-text">
              <span className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface mt-auto flex-shrink-0 px-4 py-3">
        <div className="font-mono text-[9.5px] uppercase tracking-wider text-faint">파이프라인 위치</div>
        <div className="mt-1 font-mono text-[11px] text-muted">
          <span className="text-accent-strong">{idx + 1}</span>
          <span className="text-faint"> / {STEPS.length}</span>
          <span className="mx-1.5 text-faint">·</span>
          <span className="text-text">{step.en}</span>
        </div>
      </div>
    </aside>
  )
}

