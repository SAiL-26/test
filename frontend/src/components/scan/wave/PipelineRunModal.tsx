import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check, ChevronRight, FlaskConical, GitBranch, Layers, Loader2,
  Radio, Scan, Settings2, Sliders, Stethoscope, Waves, X,
} from 'lucide-react'
import { fetchScreeningSurface, fetchVelocitySlice, fetchWaveMetadata } from '../../../api/wave'
import type { WaveCaseId } from '../../../api/wave'
import SnapshotGridPane from './SnapshotGridPane'
import ScreeningSurfacePane from './ScreeningSurfacePane'
import StageSlicePreview from './StageSlicePreview'
import LiveMcmcPreview from './LiveMcmcPreview'

interface PipelineStage {
  key: string
  title: string
  subtitle: string
  durationMs: number
  Icon: typeof Scan
  detail: string
  affectsDurationBy?: 'iters' | 'nt'
}

interface RunParams {
  iters: number       // MCMC iterations, 200 - 3000 (default 1000)
  ntSamples: number   // wave NT samples, 25000 / 50000 / 75000
  freqKHz: number     // 25 / 30 / 35 / 40
  radiusNudge: number // -3 .. +3 voxel offset on the inserted lesion radius
}

const DEFAULT_PARAMS: RunParams = {
  iters: 1000,
  ntSamples: 75000,
  freqKHz: 30,
  radiusNudge: 0,
}

const BASE_STAGES: PipelineStage[] = [
  { key: 'register', title: 'CBCT + STL 정합', subtitle: '3D 디지털 모델 통합', durationMs: 1200, Icon: Scan,
    detail: 'CBCT volume과 STL surface를 같은 좌표계로 정렬해 voxel 모델로 변환합니다.' },
  { key: 'segment', title: 'DentalSegmentator 분할', subtitle: 'nnU-Net v2.2 추론', durationMs: 1400, Icon: Layers,
    detail: '치아·치은·치조골을 voxel-wise로 분할하여 각 조직에 음속을 부여합니다.' },
  { key: 'lesion', title: '병변 삽입', subtitle: 'Vs 모델 업데이트', durationMs: 800, Icon: Stethoscope,
    detail: '치은 voxel을 염증값(0.025)으로 부분 치환하여 forward 시뮬레이션 입력을 구성합니다.' },
  { key: 'simulate', title: '탄성파 전파 시뮬레이션', subtitle: '30 kHz Ricker · 시간 적분', durationMs: 4800, Icon: Waves,
    detail: '치아 표면 source에서 가해진 탄성파가 구조를 통과하며 100개 수신기 시계열을 생성합니다.',
    affectsDurationBy: 'nt' },
  { key: 'screen', title: '저속 성분 + 후보 영역', subtitle: '시간 누적 에너지 분석', durationMs: 1600, Icon: Radio,
    detail: '시간축 누적 에너지의 97.5 percentile 이상 voxel을 후보 영역으로 마킹합니다.' },
  { key: 'inverse', title: '국소 역산 (MCMC)', subtitle: 'Metropolis-Hastings', durationMs: 3200, Icon: GitBranch,
    detail: '후보 영역에서 (x, y, z, r) 사후분포를 샘플링하여 최빈값과 최소 misfit 모델을 추정합니다.',
    affectsDurationBy: 'iters' },
]

function buildStages(p: RunParams): PipelineStage[] {
  return BASE_STAGES.map((s) => {
    let dur = s.durationMs
    if (s.affectsDurationBy === 'iters') dur = Math.round(s.durationMs * (p.iters / 1000))
    if (s.affectsDurationBy === 'nt')    dur = Math.round(s.durationMs * (p.ntSamples / 75000))
    return { ...s, durationMs: dur }
  })
}

const TICK_MS = 50

interface Props {
  onClose: () => void
  onComplete: () => void
  caseId: WaveCaseId
}

export default function PipelineRunModal({ onClose, onComplete, caseId }: Props) {
  const [mode, setMode] = useState<'config' | 'running' | 'done'>('config')
  const [params, setParams] = useState<RunParams>(DEFAULT_PARAMS)
  const stages = useMemo(() => buildStages(params), [params])
  const totalMs = useMemo(() => stages.reduce((s, x) => s + x.durationMs, 0), [stages])

  const [elapsedMs, setElapsedMs] = useState(0)
  const startedRef = useRef(0)
  const completedRef = useRef(false)

  // Metadata for the preview embeds
  const meta = useQuery({ queryKey: ['wave', 'metadata'], queryFn: fetchWaveMetadata, staleTime: Infinity })
  const times = meta.data?.snapshotTimes ?? []

  useEffect(() => {
    if (mode !== 'running') return
    startedRef.current = Date.now()
    completedRef.current = false
    setElapsedMs(0)
    const id = setInterval(() => {
      const dt = Date.now() - startedRef.current
      setElapsedMs(dt)
      if (dt >= totalMs && !completedRef.current) {
        completedRef.current = true
        clearInterval(id)
        setTimeout(() => setMode('done'), 400)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [mode, totalMs])

  const { currentIdx, stageElapsed, stageProgress } = useMemo(() => {
    let acc = 0
    for (let i = 0; i < stages.length; i++) {
      const next = acc + stages[i].durationMs
      if (elapsedMs < next) {
        const se = elapsedMs - acc
        return { currentIdx: i, stageElapsed: se, stageProgress: se / stages[i].durationMs }
      }
      acc = next
    }
    return { currentIdx: stages.length, stageElapsed: 0, stageProgress: 1 }
  }, [elapsedMs, stages])

  const totalPct = Math.min(100, (elapsedMs / Math.max(totalMs, 1)) * 100)
  const remainingMs = Math.max(0, totalMs - elapsedMs)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="파이프라인 재실행"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-md animate-[fade-in_0.16s_ease-out_both]"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div className="flex h-full max-h-[840px] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.55)]">

        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-accent-soft/40 to-transparent px-5 py-3">
          <div className="flex items-center gap-3">
            <div className={[
              'flex h-9 w-9 items-center justify-center rounded-full',
              mode === 'done' ? 'bg-good/20 text-good' : 'bg-accent-soft text-accent',
            ].join(' ')}>
              {mode === 'done' ? <Check size={18} /> : mode === 'running' ? <FlaskConical size={18} className="animate-pulse" /> : <Settings2 size={18} />}
            </div>
            <div>
              <div className="text-sm font-semibold text-text-strong">
                {mode === 'config' ? '재계산 — 파라미터 설정' : mode === 'running' ? '분석 재계산 중' : '분석 완료'}
              </div>
              <div className="text-[11px] text-muted">
                {mode === 'config' ? '아래 파라미터 조정 후 실행 시작'
                  : mode === 'running' ? `${stages.length}단계 파이프라인 실행 · case #${caseId}`
                  : `총 ${(totalMs / 1000).toFixed(1)}s 소요 · 모든 단계 정상 종료`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={mode === 'running'}
            title={mode === 'running' ? '실행 중에는 닫을 수 없습니다' : '닫기'}
            className="rounded p-1 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </header>

        {/* CONFIG MODE — split into a scrolling content region + a sticky
            action footer so the 실행 시작 button is ALWAYS visible. The
            previous layout used mt-auto inside an overflow-auto container
            which only pushed buttons to the end of the SCROLL content, not
            the visible viewport — on shorter screens (720px tall laptops,
            split-screen, 1440x900 with browser chrome) the action row sat
            below the fold with no visible scroll affordance. */}
        {mode === 'config' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="grid grid-cols-2 gap-5">
              <ParamCard
                icon={<GitBranch size={14} className="text-accent" />}
                title="MCMC 반복 수"
                subtitle="역산 정확도 vs 소요 시간"
                badge={`${params.iters.toLocaleString()} iter`}
              >
                <input
                  type="range" min={200} max={3000} step={100}
                  value={params.iters}
                  onChange={(e) => setParams((p) => ({ ...p, iters: Number(e.target.value) }))}
                  className="w-full accent-accent"
                />
                <div className="mt-1 flex justify-between text-[9.5px] text-muted">
                  <span>빠름 (200)</span><span>기본 (1000)</span><span>정밀 (3000)</span>
                </div>
              </ParamCard>

              <ParamCard
                icon={<Waves size={14} className="text-accent" />}
                title="시뮬레이션 시간 샘플"
                subtitle="파동 적분 길이 (정확도)"
                badge={`${(params.ntSamples / 1000).toFixed(0)}k step`}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  {[25000, 50000, 75000].map((nt) => (
                    <button
                      key={nt}
                      onClick={() => setParams((p) => ({ ...p, ntSamples: nt }))}
                      className={[
                        'rounded-md border px-2 py-1.5 text-[11px] font-medium transition',
                        params.ntSamples === nt
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-line bg-panel-2 text-muted hover:border-accent/40',
                      ].join(' ')}
                    >
                      {nt / 1000}k
                    </button>
                  ))}
                </div>
              </ParamCard>

              <ParamCard
                icon={<Radio size={14} className="text-accent" />}
                title="중심 주파수"
                subtitle="Ricker pulse"
                badge={`${params.freqKHz} kHz`}
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {[25, 30, 35, 40].map((f) => (
                    <button
                      key={f}
                      onClick={() => setParams((p) => ({ ...p, freqKHz: f }))}
                      className={[
                        'rounded-md border px-2 py-1.5 text-[11px] font-medium transition',
                        params.freqKHz === f
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-line bg-panel-2 text-muted hover:border-accent/40',
                      ].join(' ')}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </ParamCard>

              <ParamCard
                icon={<Sliders size={14} className="text-accent" />}
                title="병변 반경 보정"
                subtitle="가정 병변 크기 ± nudge"
                badge={`${params.radiusNudge >= 0 ? '+' : ''}${params.radiusNudge} voxel`}
              >
                <input
                  type="range" min={-3} max={3} step={1}
                  value={params.radiusNudge}
                  onChange={(e) => setParams((p) => ({ ...p, radiusNudge: Number(e.target.value) }))}
                  className="w-full accent-accent"
                />
                <div className="mt-1 flex justify-between text-[9.5px] text-muted">
                  <span>−3</span><span>0 (기본)</span><span>+3</span>
                </div>
              </ParamCard>
            </div>

            {/* projected runtime */}
            <div className="mt-5 rounded-lg border border-line bg-panel-2/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
                <FlaskConical size={12} /> 예상 실행 시간
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-text-strong">
                  {(totalMs / 1000).toFixed(1)}
                </span>
                <span className="text-xs text-muted">s 예상</span>
                <span className="ml-auto font-mono text-[10.5px] text-muted">
                  iter {params.iters} · NT {params.ntSamples / 1000}k · {params.freqKHz}kHz · r{params.radiusNudge >= 0 ? '+' : ''}{params.radiusNudge}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1">
                {stages.map((s) => (
                  <div key={s.key} className="rounded bg-panel px-1.5 py-1 text-center">
                    <div className="font-mono text-[9.5px] text-muted">{(s.durationMs / 1000).toFixed(1)}s</div>
                    <div className="mt-0.5 truncate text-[9.5px] text-text/70" title={s.title}>{s.title.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </div>

            </div>
            {/* Action row — outside the scrolling region so it is always
                visible regardless of viewport height. */}
            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-line bg-panel-2/60 px-6 py-3">
              <button
                onClick={() => setParams(DEFAULT_PARAMS)}
                className="rounded-md border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-text"
              >
                기본값
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-line bg-panel-2 px-3 py-1.5 text-xs text-text hover:border-accent"
              >
                취소
              </button>
              <button
                onClick={() => setMode('running')}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg hover:bg-accent-strong"
              >
                실행 시작 <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        {/* RUNNING + DONE MODE — stages on the left, live preview on the right */}
        {(mode === 'running' || mode === 'done') && (
          <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] overflow-hidden">
            {/* Left: stages */}
            <div className="min-h-0 overflow-auto border-r border-line px-4 py-3">
              <div className="flex flex-col gap-1.5">
                {stages.map((s, i) => {
                  const done = i < currentIdx || mode === 'done'
                  const active = i === currentIdx && mode === 'running'
                  const pending = i > currentIdx && mode === 'running'
                  const pct = done ? 100 : active ? Math.min(100, (stageElapsed / s.durationMs) * 100) : 0
                  const Icon = s.Icon
                  return (
                    <div
                      key={s.key}
                      className={[
                        'rounded-md border transition-all duration-200',
                        active && 'border-accent bg-accent-soft/40 shadow-[0_0_18px_-8px_var(--color-accent)]',
                        done && !active && 'border-good/30 bg-good/5',
                        pending && 'border-line bg-panel-2/40 opacity-50',
                      ].filter(Boolean).join(' ')}
                    >
                      <div className="flex items-start gap-2.5 p-2.5">
                        <div className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                          active && 'bg-accent text-bg',
                          done && !active && 'bg-good/20 text-good',
                          pending && 'bg-panel-2 text-muted',
                        ].filter(Boolean).join(' ')}>
                          {done ? <Check size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-[11.5px] font-semibold text-text-strong">
                              <span className="mr-1 font-mono text-[9.5px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                              {s.title}
                            </div>
                            <div className="shrink-0 font-mono text-[9.5px] text-muted">
                              {done ? `${(s.durationMs / 1000).toFixed(1)}s ✓`
                                : active ? `${(stageElapsed / 1000).toFixed(1)} / ${(s.durationMs / 1000).toFixed(1)}s`
                                : `est ${(s.durationMs / 1000).toFixed(1)}s`}
                            </div>
                          </div>
                          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-panel-2">
                            <div
                              className={`h-full rounded-full transition-all duration-100 ease-linear ${done ? 'bg-good' : 'bg-accent'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: live preview tied to current stage */}
            <div className="flex min-h-0 flex-col bg-panel-2/30">
              <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-4 py-2 text-[11px]">
                <span className="text-muted">실시간 미리보기</span>
                <span className="font-mono text-[10px] text-text/70">
                  {mode === 'done' ? '최종 결과' : `step ${currentIdx + 1}: ${stages[Math.min(currentIdx, stages.length - 1)]?.title}`}
                </span>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <LivePreview
                  stageKey={mode === 'done' ? 'inverse' : stages[currentIdx]?.key ?? 'inverse'}
                  caseId={caseId}
                  times={times}
                  stageProgress={mode === 'done' ? 1 : stageProgress}
                  targetIters={params.iters}
                />
              </div>
            </div>
          </div>
        )}

        {/* FOOTER (running / done) */}
        {mode !== 'config' && (
          <footer className="border-t border-line bg-panel-2/60 px-5 py-3">
            <div className="mb-2 flex items-baseline justify-between text-[11px]">
              <span className="text-muted">
                전체 진행률 <span className="font-mono text-text">{totalPct.toFixed(0)}%</span>
              </span>
              <span className="font-mono text-muted">
                {mode === 'done' ? (
                  <span className="text-good">완료 · {(totalMs / 1000).toFixed(1)}s</span>
                ) : (
                  <>경과 {(elapsedMs / 1000).toFixed(1)}s · 예상 잔여 <span className="text-accent">{(remainingMs / 1000).toFixed(1)}s</span></>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
              <div
                className={`h-full rounded-full transition-all duration-100 ease-linear ${mode === 'done' ? 'bg-good' : 'bg-gradient-to-r from-accent to-accent-strong'}`}
                style={{ width: `${totalPct}%` }}
              />
            </div>
            {mode === 'done' && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => { setMode('config'); setElapsedMs(0) }}
                  className="rounded border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-text"
                >
                  다시 실행
                </button>
                <button
                  onClick={() => { onComplete(); onClose() }}
                  className="rounded border border-good/40 bg-good/15 px-3 py-1.5 text-xs font-semibold text-good hover:bg-good hover:text-bg"
                >
                  결과 보기 →
                </button>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function ParamCard({
  icon, title, subtitle, badge, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string; badge: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[12.5px] font-semibold text-text">{title}</span>
        </div>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent">{badge}</span>
      </div>
      <div className="mb-2.5 text-[10.5px] text-muted">{subtitle}</div>
      {children}
    </div>
  )
}

function LivePreview({
  stageKey, caseId, times, stageProgress, targetIters,
}: {
  stageKey: string; caseId: WaveCaseId; times: string[]; stageProgress: number; targetIters: number
}) {
  const velocity = useQuery({ queryKey: ['wave', 'velocity', caseId], queryFn: () => fetchVelocitySlice(caseId), staleTime: Infinity })
  const screen   = useQuery({ queryKey: ['wave', 'screening', caseId], queryFn: () => fetchScreeningSurface(caseId), staleTime: Infinity })

  // Stage → preview. Stages 1-3 reuse one slice canvas but with very different
  // visual treatments so the user can see the data moving through the pipeline:
  //  · register → grayscale CBCT-like ramp + STL alignment crosshair sweep
  //  · segment  → tissue label map filling in (bg → gingiva → bone → tooth)
  //  · lesion   → full label map + pulsing inflammation marker at slice center
  // Stages 4-6 unchanged.
  if (stageKey === 'register') return <StageSlicePreview mode="cbct"    data={velocity.data} progress={stageProgress} />
  if (stageKey === 'segment')  return <StageSlicePreview mode="segment" data={velocity.data} progress={stageProgress} />
  if (stageKey === 'lesion')   return <StageSlicePreview mode="lesion"  data={velocity.data} progress={stageProgress} />
  if (stageKey === 'simulate') return <SnapshotGridPane caseId={caseId} times={times} autoplay compact />
  if (stageKey === 'screen')   return <ScreeningSurfacePane data={screen.data} />
  return <LiveMcmcPreview caseId={caseId} progress={stageProgress} targetIters={targetIters} />
}
