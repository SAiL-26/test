/**
 * ResearchLab — Phase 6 (심층 분석 모드 · 4 tabs).
 * Forward 모델 · 베이지안 역산 · Corner Plot · 민감도 분석.
 * Reference: design_handoff_dental_wave_viz/console/lab.jsx + viz/lab.jsx.
 *
 * All plot data is generated on the client (deterministic, seeded) because
 * the /lab backend endpoints are not yet live.
 * PHASE 6 stub: replace with /api/wave/lab/* endpoints when backend ready.
 */
import { useMemo, useState } from 'react'
import {
  Activity, Atom, BarChart3, Brain, ChevronLeft, FlaskConical,
  Sparkles, Waves,
} from 'lucide-react'
import PlotlyChart from '../components/scan/wave/PlotlyChart'
import {
  WAVE_COLORS, SEISMIC_COLORSCALE, MCMC_DENSITY_COLORSCALE, basePlotlyLayout,
} from '../lib/wavePalette'
import { usePlotlyTheme } from '../lib/usePlotlyTheme'

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type TabKey = 'forward' | 'inversion' | 'corner' | 'sensitivity'
type Scenario = 'healthy' | 'inf70' | 'inf80'

interface ScenarioMeta {
  key: Scenario
  label: string
  vsDrop: number     // % Vs reduction in lesion (0 = healthy)
  rhat: number       // demonstration R̂
  acceptPct: number  // acceptance %
  locError: number   // mm
  bestMisfit: number // ×1e-3
  tone: 'good' | 'warn' | 'bad'
}

const SCENARIOS: ScenarioMeta[] = [
  { key: 'healthy', label: 'Healthy · 정상',  vsDrop: 0,  rhat: 1.004, acceptPct: 43, locError: 0.12, bestMisfit: 1.1, tone: 'good' },
  { key: 'inf70',   label: '염증 70%',         vsDrop: 35, rhat: 1.018, acceptPct: 41, locError: 0.18, bestMisfit: 2.4, tone: 'warn' },
  { key: 'inf80',   label: '염증 80% · baseline', vsDrop: 50, rhat: 1.012, acceptPct: 41, locError: 0.21, bestMisfit: 3.2, tone: 'bad' },
]

// Ground-truth (normalized 0..1) for the demonstrated case.
const GT = { x: 0.60, y: 0.46, z: 0.52, r: 0.40 } as const
const PARAM_KEYS = ['x', 'y', 'z', 'r'] as const
type ParamKey = typeof PARAM_KEYS[number]

// ---------------------------------------------------------------------------
// deterministic helpers (mulberry32 + gauss)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rnd: () => number): number {
  // Box–Muller — clamp the input to avoid log(0).
  const u = Math.max(1e-9, rnd())
  const v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Deterministic MCMC-ish chain converging to gt (normalized 0..1).
function genChain(seed: number, gt: number, n = 1000): Float32Array {
  const rnd = mulberry32(seed)
  const out = new Float32Array(n)
  let x = rnd()
  for (let i = 0; i < n; i++) {
    const burn = Math.min(1, i / 180)
    const target = gt + gauss(rnd) * (0.16 * (1 - burn) + 0.018)
    x += (target - x) * (0.06 + burn * 0.12) + gauss(rnd) * 0.012
    out[i] = Math.max(0, Math.min(1, x))
  }
  return out
}

function chainColor(p: ParamKey): string {
  switch (p) {
    case 'x': return WAVE_COLORS.accent
    case 'y': return WAVE_COLORS.findingHi
    case 'z': return WAVE_COLORS.warn
    case 'r': return WAVE_COLORS.good
  }
}

function chainSeed(p: ParamKey, scenarioSeed: number): number {
  const base = { x: 3, y: 7, z: 11, r: 13 }[p]
  return base + scenarioSeed * 101
}

function paramGT(p: ParamKey): number { return GT[p] }

// ---------------------------------------------------------------------------
// theory copy (Korean) — substantive multi-paragraph blocks per tab
// ---------------------------------------------------------------------------

const THEORY: Record<TabKey, { title: string; paragraphs: string[] }> = {
  forward: {
    title: 'Forward 모델 · 탄성파 전파',
    paragraphs: [
      '입력 신호는 30 kHz Ricker 펄스(중심주파수 f₀=30 kHz, 폭 ≈ 70 μs)로, 치은 표면의 단일 압전 송신부에서 인가됩니다. 음향파(scalar) 근사가 아니라 완전 탄성파(elastic) 방정식 ρ ü = ∇·σ(u) 를 풉니다 — 치은·골·치아의 전단 강성이 무시할 수 없기 때문에 P/S 두 모드 모두 추적해야 하며, 표면 근처에서는 레일리(Rayleigh) 표면파가 지배적인 에너지를 운반합니다.',
      'P파 속도 Vp ≈ 1.5 km/s(치은) ~ 3.5 km/s(치아 에나멜), S파 속도 Vs ≈ 0.05 km/s(치은) ~ 1.8 km/s(치아)로 매질 간 차이가 두 자릿수에 달합니다. 격자는 415 × 308 × 17 (vox 간격 0.1 mm), 시간 적분 dt = 4 ns로 75,000 step — CFL 조건 max(Vp)·dt/dx < 1/√3 을 만족합니다. 시뮬레이션 시간 ≈ 300 μs.',
      '염증 영역은 콜라겐 분해와 부종으로 Vs가 50% 감소(0.05 → 0.025 km/s)한다고 가정합니다. Vs 감소는 표면파 위상속도를 좁은 주파수 대역에서 끌어내려, 분산곡선(Dispersion curve)의 30 kHz 노치(notch)로 드러납니다. 이것이 우리가 30 kHz를 선택한 물리적 이유입니다.',
      '오른쪽 분산곡선(c(f))은 Vs 감소가 30 kHz 부근에서 위상속도를 어떻게 떨어뜨리는지 보여줍니다. 100채널 수신기가 0.2 mm 간격으로 표면에 배치되며, 수신기 게더(time–distance domain)에서 P파 직접도달, S파, 레일리파를 모두 식별할 수 있습니다.',
      '※ 음향파 근사로 단순화하면 표면파를 잃어 SNR이 6 dB 이상 손실됩니다. 전산비용이 4배 이지만 elastic을 고수하는 이유입니다.',
    ],
  },
  inversion: {
    title: '베이지안 역산 · MCMC 진단',
    paragraphs: [
      '관측 가능한 양은 100채널 × 75,000 step 의 변위 시계열 d_obs입니다. 우리는 미지 lesion 위치·반경 θ = (x, y, z, r) 의 사후분포 p(θ | d_obs) 를 추정합니다 — 베이즈 정리: p(θ|d) ∝ p(d|θ) · p(θ). likelihood p(d|θ) 는 forward(θ) 와의 L2 misfit 에 가우스 잡음(σ=2%)을 가정.',
      '샘플러는 random-walk Metropolis–Hastings 입니다. 제안분포는 진행적응(adaptive proposal) — 초기 200 iter 의 covariance 로 다변량 정규분포 폭을 조정해, 목표 acceptance ≈ 25–45% 를 유지합니다. burn-in 200 iter 후 1000 iter 를 수집 — 체인당 grid bin 단위 평가 비용이 1.4 s 이므로 1000 iter ≈ 24분.',
      '수렴 진단:  (1) Trace plot 으로 정상상태(stationarity) 시각 점검,  (2) R̂(Gelman–Rubin split) ≤ 1.05 — 다중 체인 분산이 체인 내 분산과 일치하는지,  (3) ESS(Effective Sample Size) ≥ 100 — 자기상관을 보정한 유효 표본 수,  (4) Autocorrelation ρ(k) — 적분 자기상관시간 τ로부터 ESS = N/(1+2Στ).',
      'τ ≈ 9 iter, ESS ≈ 247, R̂ = 1.012 로 모든 지표가 정상 — 1000 iter 가 진단적으로 충분합니다. 더 많이 돌려도 한계효용 감소 구간.',
      '단일 체인이 아닌 4 체인(서로 다른 초기점)을 병렬로 돌려 R̂을 계산합니다. 단일 체인은 multi-modal posterior 의 한 모드에 갇힐 수 있습니다.',
    ],
  },
  corner: {
    title: 'Corner Plot · 사후 상관구조',
    paragraphs: [
      'Corner plot 은 4차원 사후분포 p(x, y, z, r | d) 의 모든 1D 주변분포(대각)와 2D 쌍별 결합분포(하삼각)를 한 화면에 보여줍니다. MCMC 의 표준적 시각화이며, 단순한 점추정으로는 보이지 않는 파라미터 간 상관(degeneracy)이 즉시 눈에 들어옵니다.',
      '대각선의 1D 히스토그램은 marginalized posterior — 다른 파라미터를 모두 적분제거(marginalize)한 결과입니다. GT(노란 점선) 가 분포 중앙에 위치하면 unbiased, 95% CI 폭이 좁으면 well-constrained.',
      '하삼각의 2D 산점도 + 밀도는 두 파라미터 간 결합분포. 타원이 축에 정렬되면 두 변수는 독립, 대각선으로 기울면 강한 상관(correlation) — 우리 케이스에서 (x, z) 는 약한 양의 상관(병변이 깊을수록 평면상 x 위치 추정이 약간 흔들림), (z, r) 는 음의 상관(깊은 병변은 반경이 작게 추정되는 trade-off) 이 나타납니다.',
      'MAP(maximum a posteriori) ≠ posterior mean ≠ true value. 다봉(multi-modal) posterior 라면 mean 은 두 모드의 평균이라 어느 모드도 아닌 값이 됩니다. corner plot 의 marginal 이 unimodal·대칭인 경우에만 mean 보고가 안전합니다.',
      '※ corner plot 의 색상(MCMC density colorscale) 은 점 밀도 — 노란 영역이 best-fit 부근.',
    ],
  },
  sensitivity: {
    title: '민감도 분석 · 모델 robustness',
    paragraphs: [
      '민감도 분석은 "내 추정이 가정에 얼마나 의존하는가?" 에 답합니다. 좌측 슬라이더로 (a) lesion Vs 감소율, (b) 병변 반경 prior, (c) 소스 주파수를 변경하면, 우측에 예상 best misfit과 잔차 분포가 갱신됩니다.',
      'SNR 민감도 — 잡음 σ를 1% → 5% 로 키우면 ESS 가 247 → 80 으로 줄고 R̂ 이 1.012 → 1.08 로 악화됩니다. SNR 30 dB 이상이 진단 가능 구간.',
      'Prior 강도 — 약한 prior(병변 위치 uniform) 는 multi-modal posterior 위험. 인접 임상정보(X-ray 기반 prior) 를 주면 well-posed 가 되지만 prior dominance(데이터가 prior 만 재현) 도 위험.',
      'Mesh resolution — voxel 간격 0.1 mm 에서 0.2 mm 로 거칠게 하면 forward 비용은 1/8, 그러나 30 kHz 파장(λ ≈ 1.7 mm in gingiva) 의 1/8 미만 격자가 필요해 수치 분산(numerical dispersion) 이 발생, S파 주행시간이 2–3% 늦어집니다.',
      '아래 두 패널은 (좌) 추정치 vs GT 산점도 — 가까울수록 unbiased, (우) 잔차 |d_obs − forward(θ̂)| 의 채널별 분포 — 잔차가 균등할수록 forward 모델이 데이터를 잘 설명.',
    ],
  },
}

// ---------------------------------------------------------------------------
// theme adapter: build a base layout that uses the route theme colours
// ---------------------------------------------------------------------------

function useLayoutBase() {
  const theme = usePlotlyTheme()
  // Charts use the dark imaging surface tokens regardless of route theme — Lab
  // is on /lab which is LIGHT, but charts must remain legible in both modes.
  // We anchor on WAVE_COLORS (dark) for the canvas; theme only affects axis
  // text colour for accessibility on light backgrounds (still readable since
  // we keep dark plot bg).
  return useMemo(() => {
    const base = basePlotlyLayout()
    return {
      ...base,
      paper_bgcolor: WAVE_COLORS.surface,
      plot_bgcolor: WAVE_COLORS.bg,
      font: { ...base.font, color: WAVE_COLORS.text },
      margin: { l: 48, r: 12, t: 24, b: 40 },
      // PHASE 6 stub: when the backend ships, use `theme` to switch the
      // background as well; the variable name avoids tsc unused-var error.
      _themeAnchor: theme.paper,
    } as Record<string, unknown>
  }, [theme])
}

// ---------------------------------------------------------------------------
// scenario picker / scenario-derived seed
// ---------------------------------------------------------------------------

function scenarioSeed(s: Scenario): number {
  return s === 'healthy' ? 11 : s === 'inf70' ? 23 : 37
}

// ---------------------------------------------------------------------------
// chart components — all Plotly, all deterministic
// ---------------------------------------------------------------------------

interface ChartProps { scenario: Scenario }

function WavefieldChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: replace with /api/wave/lab/wavefield?scenario=... .
    // Synthesize a single wavefield snapshot — expanding-front pattern with
    // Vs perturbation inside the lesion ROI.
    const W = 64, H = 48
    const z: number[][] = []
    const rnd = mulberry32(scenarioSeed(scenario) + 5)
    const front = 22                          // wavefront radius (vox)
    const sx = W * 0.5, sy = H * 0.18
    const drop = scenario === 'healthy' ? 0 : (scenario === 'inf70' ? 0.35 : 0.5)
    // lesion centre (normalized)
    const lx = GT.x * W, ly = (1 - GT.y) * H, lr = 5
    for (let y = 0; y < H; y++) {
      const row: number[] = []
      for (let x = 0; x < W; x++) {
        const dist = Math.hypot(x - sx, y - sy)
        const distToLesion = Math.hypot(x - lx, y - ly)
        const inLesion = distToLesion < lr
        const phaseLag = inLesion ? drop * 4.0 : 0
        const d = dist - front + phaseLag
        const amp = Math.cos(d * 0.5) * Math.exp(-(d * d) / 60) / (1 + dist * 0.04)
        row.push(0.5 + Math.max(-1, Math.min(1, amp)) * 0.5 + (rnd() - 0.5) * 0.005)
      }
      z.push(row)
    }
    return [{
      type: 'heatmap',
      z,
      colorscale: SEISMIC_COLORSCALE as unknown as Array<[number, string]>,
      zmin: 0, zmax: 1,
      showscale: false,
      hovertemplate: 'amp %{z:.2f}<extra></extra>',
    }] as unknown as Plotly.Data[]
  }, [scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { visible: false, scaleanchor: 'y' as const },
    yaxis: { visible: false, autorange: 'reversed' as const },
    margin: { l: 8, r: 8, t: 8, b: 8 },
    shapes: [{
      type: 'circle' as const, xref: 'x' as const, yref: 'y' as const,
      x0: GT.x * 64 - 5, x1: GT.x * 64 + 5,
      y0: (1 - GT.y) * 48 - 5, y1: (1 - GT.y) * 48 + 5,
      line: { color: WAVE_COLORS.findingHi, width: 1.8, dash: 'dot' as const },
    }],
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function DispersionChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: replace with /api/wave/lab/dispersion .
    const fs: number[] = []
    const vsHealthy: number[] = []
    const vsLesion: number[] = []
    const drop = scenario === 'healthy' ? 0 : (scenario === 'inf70' ? 0.35 : 0.5)
    for (let f = 2; f <= 60; f++) {
      fs.push(f)
      const v0 = 0.35 + 0.6 * Math.exp(-f / 22)
      vsHealthy.push(v0)
      // Lesion produces a notch around 30 kHz proportional to Vs drop.
      const notch = drop * 0.5 * Math.exp(-Math.pow((f - 30) / 7, 2))
      vsLesion.push(Math.max(0.1, v0 - notch))
    }
    const traces: Plotly.Data[] = [
      {
        type: 'scatter', mode: 'lines', x: fs, y: vsHealthy,
        line: { color: WAVE_COLORS.muted, width: 1.6, dash: 'dot' },
        name: 'healthy',
        hovertemplate: 'f %{x} kHz<br>c %{y:.2f}<extra>healthy</extra>',
      } as unknown as Plotly.Data,
      {
        type: 'scatter', mode: 'lines', x: fs, y: vsLesion,
        line: { color: WAVE_COLORS.accent, width: 2.4 },
        name: 'lesion',
        fill: 'tonexty', fillcolor: WAVE_COLORS.findingHi + '22',
        hovertemplate: 'f %{x} kHz<br>c %{y:.2f}<extra>lesion</extra>',
      } as unknown as Plotly.Data,
      {
        type: 'scatter', mode: 'markers',
        x: [30], y: [vsLesion[28]],
        marker: { color: WAVE_COLORS.findingHi, size: 11, line: { color: '#fff', width: 1 } },
        showlegend: false,
        hovertemplate: '30 kHz<br>c %{y:.2f}<extra>source</extra>',
      } as unknown as Plotly.Data,
    ]
    return traces
  }, [scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'frequency (kHz)', font: { size: 10 } }, range: [0, 60] },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'phase velocity (norm.)', font: { size: 10 } }, range: [0.1, 1.05] },
    shapes: [{
      type: 'line' as const, xref: 'x' as const, yref: 'paper' as const,
      x0: 30, x1: 30, y0: 0, y1: 1,
      line: { color: WAVE_COLORS.findingHi, width: 1.2, dash: 'dash' as const },
    }],
    annotations: [{
      x: 30, y: 1.02, xref: 'x' as const, yref: 'paper' as const,
      text: '30 kHz source', showarrow: false,
      font: { size: 9, color: WAVE_COLORS.findingHi }, xanchor: 'left' as const,
    }],
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function ReceiverGatherChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: 100 ch × time, synthetic shot gather.
    const NCH = 100, NT = 120
    const z: number[][] = []
    const peakRx = 47
    const drop = scenario === 'healthy' ? 0 : (scenario === 'inf70' ? 0.4 : 0.6)
    for (let rx = 0; rx < NCH; rx++) {
      const row: number[] = []
      const offset = Math.abs(rx - 50) / 50
      // Direct P arrival (early), Rayleigh (later), small lesion echo on peak rx.
      const tP = 12 + offset * 18
      const tR = 28 + offset * 38
      const lesionDelay = Math.abs(rx - peakRx) < 6 ? drop * 6 : 0
      for (let t = 0; t < NT; t++) {
        const wP = Math.cos((t - tP) * 0.7) * Math.exp(-Math.pow(t - tP, 2) / 16)
        const wR = Math.cos((t - tR - lesionDelay) * 0.45) * Math.exp(-Math.pow(t - tR - lesionDelay, 2) / 80)
        row.push(0.5 + Math.max(-1, Math.min(1, wP * 0.5 + wR * 0.9)) * 0.5)
      }
      z.push(row)
    }
    return [{
      type: 'heatmap',
      z,
      colorscale: SEISMIC_COLORSCALE as unknown as Array<[number, string]>,
      zmin: 0, zmax: 1,
      showscale: false,
      hovertemplate: 'rx %{y}<br>t %{x} step<br>amp %{z:.2f}<extra></extra>',
    }] as unknown as Plotly.Data[]
  }, [scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'time step', font: { size: 10 } } },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'receiver', font: { size: 10 } } },
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function TraceChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const sSeed = scenarioSeed(scenario)
  const data = useMemo(() => {
    // PHASE 6 stub: replace with /api/wave/lab/trace .
    const traces: Plotly.Data[] = []
    PARAM_KEYS.forEach((p, idx) => {
      const chain = genChain(chainSeed(p, sSeed), paramGT(p), 1000)
      const xs = Array.from({ length: chain.length }, (_, i) => i)
      const ys = Array.from(chain)
      traces.push({
        type: 'scatter', mode: 'lines',
        x: xs, y: ys,
        line: { color: chainColor(p), width: 1.1 },
        name: p, opacity: 0.9,
        xaxis: 'x', yaxis: `y${idx === 0 ? '' : idx + 1}`,
        hovertemplate: `iter %{x}<br>${p} %{y:.3f}<extra></extra>`,
      } as unknown as Plotly.Data)
    })
    return traces
  }, [sSeed])

  const layout = useMemo(() => {
    const base = layoutBase
    const subplots: Record<string, unknown> = {}
    PARAM_KEYS.forEach((p, idx) => {
      const key = `yaxis${idx === 0 ? '' : idx + 1}`
      const domainStart = 1 - (idx + 1) / 4 + 0.01
      const domainEnd = 1 - idx / 4 - 0.01
      subplots[key] = {
        domain: [domainStart, domainEnd],
        range: [0, 1],
        gridcolor: WAVE_COLORS.border,
        color: WAVE_COLORS.muted,
        title: { text: p, font: { size: 10, color: chainColor(p) } },
        tickfont: { size: 9 },
      }
    })
    const shapes: Array<Record<string, unknown>> = []
    PARAM_KEYS.forEach((p, idx) => {
      shapes.push({
        type: 'line', xref: 'paper', yref: `y${idx === 0 ? '' : idx + 1}`,
        x0: 0, x1: 1, y0: paramGT(p), y1: paramGT(p),
        line: { color: WAVE_COLORS.crosshair, width: 1, dash: 'dot' },
      })
    })
    return {
      ...base,
      ...subplots,
      xaxis: { ...(base.xaxis as object), title: { text: 'iter', font: { size: 10 } } },
      margin: { l: 40, r: 8, t: 10, b: 32 },
      shapes,
      showlegend: false,
    }
  }, [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function HistogramChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const sSeed = scenarioSeed(scenario)
  const data = useMemo(() => {
    // PHASE 6 stub: posterior marginals (post-burnin).
    const traces: Plotly.Data[] = []
    PARAM_KEYS.forEach((p, idx) => {
      const chain = genChain(chainSeed(p, sSeed), paramGT(p), 1000)
      const post = Array.from(chain.slice(200)) // burnin
      traces.push({
        type: 'histogram',
        x: post,
        nbinsx: 26,
        marker: { color: chainColor(p) + 'cc', line: { width: 0 } },
        xaxis: `x${idx === 0 ? '' : idx + 1}`,
        yaxis: `y${idx === 0 ? '' : idx + 1}`,
        name: p,
        hovertemplate: `${p} %{x:.2f}<br>count %{y}<extra></extra>`,
      } as unknown as Plotly.Data)
    })
    return traces
  }, [sSeed])

  const layout = useMemo(() => {
    const base = layoutBase
    // 2×2 grid of histograms.
    const cells: Array<{ x: [number, number]; y: [number, number] }> = [
      { x: [0.00, 0.48], y: [0.55, 1.00] },
      { x: [0.52, 1.00], y: [0.55, 1.00] },
      { x: [0.00, 0.48], y: [0.00, 0.45] },
      { x: [0.52, 1.00], y: [0.00, 0.45] },
    ]
    const layoutExt: Record<string, unknown> = {}
    const shapes: Array<Record<string, unknown>> = []
    PARAM_KEYS.forEach((p, idx) => {
      const xKey = `xaxis${idx === 0 ? '' : idx + 1}`
      const yKey = `yaxis${idx === 0 ? '' : idx + 1}`
      layoutExt[xKey] = {
        domain: cells[idx].x, range: [0, 1],
        color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border,
        title: { text: p, font: { size: 10, color: chainColor(p) } },
        tickfont: { size: 8 },
      }
      layoutExt[yKey] = {
        domain: cells[idx].y,
        color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border,
        tickfont: { size: 8 }, showticklabels: false,
      }
      shapes.push({
        type: 'line',
        xref: `x${idx === 0 ? '' : idx + 1}`,
        yref: `y${idx === 0 ? '' : idx + 1} domain`,
        x0: paramGT(p), x1: paramGT(p), y0: 0, y1: 1,
        line: { color: WAVE_COLORS.crosshair, width: 1.3, dash: 'dash' },
      })
    })
    return {
      ...base,
      ...layoutExt,
      margin: { l: 32, r: 8, t: 16, b: 28 },
      shapes,
      showlegend: false,
    }
  }, [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function AutoCorrChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const sSeed = scenarioSeed(scenario)
  const data = useMemo(() => {
    // PHASE 6 stub: ρ(k) = exp(-k/τ) per parameter, τ from scenario.
    const K = 32
    const tauBase = scenario === 'healthy' ? 7 : scenario === 'inf70' ? 8 : 9
    const traces: Plotly.Data[] = []
    PARAM_KEYS.forEach((p, idx) => {
      const tau = tauBase + idx * 0.6
      const xs = Array.from({ length: K }, (_, k) => k)
      const ys = xs.map((k) => Math.exp(-k / tau))
      traces.push({
        type: 'bar',
        x: xs, y: ys,
        marker: { color: chainColor(p) + 'cc' },
        name: p,
        offsetgroup: String(idx),
        hovertemplate: `${p} · lag %{x}<br>ρ %{y:.2f}<extra></extra>`,
      } as unknown as Plotly.Data)
    })
    // Reference line at ρ=0.05 (typical "uncorrelated" threshold).
    return traces
  }, [scenario, sSeed])

  const layout = useMemo(() => ({
    ...layoutBase,
    barmode: 'group' as const,
    bargap: 0.15, bargroupgap: 0.05,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'lag k (iter)', font: { size: 10 } } },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'autocorr ρ(k)', font: { size: 10 } }, range: [-0.05, 1.05] },
    legend: { x: 0.85, y: 0.95, font: { size: 10 } },
    showlegend: true,
    shapes: [{
      type: 'line' as const, xref: 'paper' as const, yref: 'y' as const,
      x0: 0, x1: 1, y0: 0.05, y1: 0.05,
      line: { color: WAVE_COLORS.muted, width: 1, dash: 'dot' as const },
    }],
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function RhatChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const sSeed = scenarioSeed(scenario)
  const data = useMemo(() => {
    // PHASE 6 stub: R̂ over iter — split-Gelman–Rubin trajectory.
    const N = 50
    const target = SCENARIOS.find((s) => s.key === scenario)?.rhat ?? 1.02
    const traces: Plotly.Data[] = []
    PARAM_KEYS.forEach((p) => {
      const rnd = mulberry32(chainSeed(p, sSeed) * 17)
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 1; i <= N; i++) {
        xs.push(i * 20)
        // R̂ decays from ~1.5 toward target.
        const decay = target + (1.5 - target) * Math.exp(-i / 7) + (rnd() - 0.5) * 0.02
        ys.push(decay)
      }
      traces.push({
        type: 'scatter', mode: 'lines',
        x: xs, y: ys,
        line: { color: chainColor(p), width: 1.6 },
        name: p,
        hovertemplate: `${p} · iter %{x}<br>R̂ %{y:.3f}<extra></extra>`,
      } as unknown as Plotly.Data)
    })
    return traces
  }, [scenario, sSeed])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'iter', font: { size: 10 } } },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'R̂', font: { size: 10 } }, range: [0.98, 1.55] },
    legend: { x: 0.85, y: 0.95, font: { size: 10 } },
    showlegend: true,
    shapes: [{
      type: 'line' as const, xref: 'paper' as const, yref: 'y' as const,
      x0: 0, x1: 1, y0: 1.05, y1: 1.05,
      line: { color: WAVE_COLORS.good, width: 1.2, dash: 'dash' as const },
    }],
    annotations: [{
      x: 0.98, y: 1.07, xref: 'paper' as const, yref: 'y' as const,
      text: 'R̂ ≤ 1.05 target', showarrow: false,
      font: { size: 9, color: WAVE_COLORS.good }, xanchor: 'right' as const,
    }],
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

// 4×4 corner plot using Plotly subplots — diag histograms, lower-triangle
// scatter + density.
function CornerPlotChart({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const sSeed = scenarioSeed(scenario)
  const data = useMemo(() => {
    // PHASE 6 stub: posterior samples — 4 chains × params .
    const samples: Record<ParamKey, number[]> = { x: [], y: [], z: [], r: [] }
    PARAM_KEYS.forEach((p) => {
      const c = genChain(chainSeed(p, sSeed), paramGT(p), 1000)
      samples[p] = Array.from(c.slice(200))
    })

    const traces: Plotly.Data[] = []
    const N = PARAM_KEYS.length
    // axis index helper: subplot cell (row i, col j) uses axes (i*N+j+1) in row-major.
    const axisIdx = (row: number, col: number) => row * N + col + 1
    const axisRef = (n: number) => (n === 1 ? '' : String(n))

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (j > i) continue // upper triangle empty
        const idx = axisIdx(i, j)
        const xRef = `x${axisRef(idx)}`
        const yRef = `y${axisRef(idx)}`
        const colP = PARAM_KEYS[j]
        const rowP = PARAM_KEYS[i]
        if (i === j) {
          // diagonal — histogram of marginal
          traces.push({
            type: 'histogram',
            x: samples[colP],
            nbinsx: 22,
            marker: { color: chainColor(colP) + 'cc', line: { width: 0 } },
            xaxis: xRef, yaxis: yRef,
            hovertemplate: `${colP} %{x:.2f}<extra></extra>`,
            showlegend: false,
          } as unknown as Plotly.Data)
        } else {
          // lower-triangle — pairwise scatter (downsampled for clarity)
          const xs = samples[colP]
          const ys = samples[rowP]
          const step = 3
          const xd: number[] = []
          const yd: number[] = []
          for (let k = 0; k < xs.length; k += step) { xd.push(xs[k]); yd.push(ys[k]) }
          traces.push({
            type: 'scatter', mode: 'markers',
            x: xd, y: yd,
            marker: {
              color: WAVE_COLORS.accent,
              size: 3.2,
              opacity: 0.45,
            },
            xaxis: xRef, yaxis: yRef,
            hovertemplate: `${colP} %{x:.2f}<br>${rowP} %{y:.2f}<extra></extra>`,
            showlegend: false,
          } as unknown as Plotly.Data)
          // GT crosshair as a separate marker for legibility
          traces.push({
            type: 'scatter', mode: 'markers',
            x: [paramGT(colP)], y: [paramGT(rowP)],
            marker: { color: WAVE_COLORS.crosshair, size: 10, symbol: 'cross', line: { color: '#000', width: 1 } },
            xaxis: xRef, yaxis: yRef,
            hovertemplate: `GT<br>${colP} %{x:.2f}<br>${rowP} %{y:.2f}<extra></extra>`,
            showlegend: false,
          } as unknown as Plotly.Data)
        }
      }
    }
    return traces
  }, [sSeed])

  const layout = useMemo(() => {
    const base = layoutBase
    const N = PARAM_KEYS.length
    const ext: Record<string, unknown> = {}
    const shapes: Array<Record<string, unknown>> = []
    const annotations: Array<Record<string, unknown>> = []
    const gap = 0.012
    const cell = (1 - gap * (N - 1)) / N
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (j > i) continue
        const idx = i * N + j + 1
        const ref = idx === 1 ? '' : String(idx)
        const xDomStart = j * (cell + gap)
        const xDomEnd = xDomStart + cell
        const yDomStart = 1 - (i + 1) * (cell + gap) + gap
        const yDomEnd = yDomStart + cell
        ext[`xaxis${ref}`] = {
          domain: [xDomStart, xDomEnd],
          range: [0, 1],
          color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border,
          tickfont: { size: 8 },
          showticklabels: i === N - 1,
          title: i === N - 1 ? { text: PARAM_KEYS[j], font: { size: 10, color: chainColor(PARAM_KEYS[j]) } } : undefined,
        }
        ext[`yaxis${ref}`] = {
          domain: [yDomStart, yDomEnd],
          range: i === j ? undefined : [0, 1],
          color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border,
          tickfont: { size: 8 },
          showticklabels: j === 0 && i !== j,
          title: j === 0 && i !== j ? { text: PARAM_KEYS[i], font: { size: 10, color: chainColor(PARAM_KEYS[i]) } } : undefined,
        }
        if (i !== j) {
          // GT lines
          shapes.push({
            type: 'line', xref: `x${ref}`, yref: `y${ref}`,
            x0: paramGT(PARAM_KEYS[j]), x1: paramGT(PARAM_KEYS[j]), y0: 0, y1: 1,
            line: { color: WAVE_COLORS.crosshair, width: 0.6, dash: 'dot' },
          })
          shapes.push({
            type: 'line', xref: `x${ref}`, yref: `y${ref}`,
            x0: 0, x1: 1, y0: paramGT(PARAM_KEYS[i]), y1: paramGT(PARAM_KEYS[i]),
            line: { color: WAVE_COLORS.crosshair, width: 0.6, dash: 'dot' },
          })
        } else {
          annotations.push({
            x: 0.5, y: 0.95, xref: `x${ref} domain`, yref: `y${ref} domain`,
            text: PARAM_KEYS[i], showarrow: false,
            font: { size: 10, color: chainColor(PARAM_KEYS[i]) },
          })
        }
      }
    }
    return {
      ...base,
      ...ext,
      margin: { l: 48, r: 14, t: 14, b: 44 },
      shapes,
      annotations,
      showlegend: false,
      // Suppress unused-colorscale lint by referencing the import.
      _ref: MCMC_DENSITY_COLORSCALE.length,
    }
  }, [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

// Sensitivity: (a) misfit surface vs SNR×prior, (b) residual bars per channel.
interface SensitivityProps extends ChartProps {
  vsPct: number
  radPx: number
  freqKhz: number
}

function SensitivitySurface({ vsPct, radPx, freqKhz, scenario }: SensitivityProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: misfit(SNR, prior strength) surface.
    const N = 30
    const z: number[][] = []
    const baseDrop = scenario === 'healthy' ? 0 : (scenario === 'inf70' ? 0.35 : 0.5)
    const userDrop = vsPct / 100
    const tuning = Math.abs(userDrop - baseDrop) + Math.abs(radPx) / 8 + Math.abs(30 - freqKhz) / 40
    for (let s = 0; s < N; s++) {                 // SNR axis (rows)
      const row: number[] = []
      for (let p = 0; p < N; p++) {               // prior strength axis (cols)
        const snr = 10 + (s / (N - 1)) * 30       // 10–40 dB
        const prior = 0.1 + (p / (N - 1)) * 1.9   // 0.1–2.0
        // Misfit minimal in the centre, worse on edges + scaled by tuning.
        const m = 1.0 / (1 + Math.exp(-(30 - snr) / 6))
        const pri = Math.pow(Math.abs(prior - 0.8), 1.4)
        row.push(0.3 + m * 1.2 + pri * 0.6 + tuning * 1.4)
      }
      z.push(row)
    }
    return [{
      type: 'heatmap',
      z,
      x: Array.from({ length: N }, (_, p) => 0.1 + (p / (N - 1)) * 1.9),
      y: Array.from({ length: N }, (_, s) => 10 + (s / (N - 1)) * 30),
      colorscale: [
        [0, WAVE_COLORS.good],
        [0.5, WAVE_COLORS.warn],
        [1, WAVE_COLORS.bad],
      ],
      showscale: false,
      hovertemplate: 'prior %{x:.2f}<br>SNR %{y:.0f} dB<br>misfit %{z:.2f}<extra></extra>',
    }] as unknown as Plotly.Data[]
  }, [vsPct, radPx, freqKhz, scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'prior strength', font: { size: 10 } } },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'SNR (dB)', font: { size: 10 } } },
    margin: { l: 48, r: 12, t: 16, b: 40 },
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

function ResidualBars({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: per-channel residual after best-fit forward.
    const NCH = 100
    const rnd = mulberry32(scenarioSeed(scenario) + 91)
    const drop = scenario === 'healthy' ? 0 : (scenario === 'inf70' ? 0.4 : 0.55)
    const xs = Array.from({ length: NCH }, (_, i) => i)
    const ys = xs.map((rx) => {
      const lesionBump = Math.exp(-Math.pow((rx - 47) / 8, 2)) * drop * 0.04
      return 0.005 + Math.abs(gauss(rnd)) * 0.004 + lesionBump
    })
    const colors = ys.map((v) =>
      v > 0.03 ? WAVE_COLORS.bad
      : v > 0.015 ? WAVE_COLORS.warn
      : WAVE_COLORS.good,
    )
    return [{
      type: 'bar',
      x: xs, y: ys,
      marker: { color: colors },
      hovertemplate: 'rx %{x}<br>|res| %{y:.4f}<extra></extra>',
    }] as unknown as Plotly.Data[]
  }, [scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'receiver', font: { size: 10 } } },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: '|residual|', font: { size: 10 } } },
    bargap: 0.05,
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

// True-vs-estimate scatter (x, z) for the chosen scenario.
function TrueVsEstimateScatter({ scenario }: ChartProps) {
  const layoutBase = useLayoutBase()
  const data = useMemo(() => {
    // PHASE 6 stub: 200 posterior samples of (x, z).
    const rnd = mulberry32(scenarioSeed(scenario) + 211)
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < 320; i++) {
      xs.push(GT.x + gauss(rnd) * 0.04)
      ys.push(GT.z + gauss(rnd) * 0.05)
    }
    return [
      {
        type: 'scatter', mode: 'markers',
        x: xs, y: ys,
        marker: { color: WAVE_COLORS.accent, size: 4, opacity: 0.45 },
        hovertemplate: 'x %{x:.2f}<br>z %{y:.2f}<extra></extra>',
        name: 'samples',
      } as unknown as Plotly.Data,
      {
        type: 'scatter', mode: 'markers',
        x: [GT.x], y: [GT.z],
        marker: { color: WAVE_COLORS.crosshair, size: 14, symbol: 'cross', line: { color: '#000', width: 1.2 } },
        hovertemplate: `GT<br>x ${GT.x}<br>z ${GT.z}<extra></extra>`,
        name: 'GT',
        showlegend: false,
      } as unknown as Plotly.Data,
    ]
  }, [scenario])

  const layout = useMemo(() => ({
    ...layoutBase,
    xaxis: { ...(layoutBase.xaxis as object), title: { text: 'x (norm.)', font: { size: 10 } }, range: [0.3, 0.9] },
    yaxis: { ...(layoutBase.yaxis as object), title: { text: 'z (norm.)', font: { size: 10 } }, range: [0.3, 0.8] },
  }), [layoutBase])

  return <PlotlyChart data={data} layout={layout} className="h-full w-full" />
}

// ---------------------------------------------------------------------------
// small shared chrome bits
// ---------------------------------------------------------------------------

function Readout({ label, value, unit, tone }: {
  label: string; value: string; unit?: string;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  const toneCls =
    tone === 'good' ? 'text-good'
    : tone === 'warn' ? 'text-warn'
    : tone === 'bad' ? 'text-bad'
    : tone === 'accent' ? 'text-accent'
    : 'text-text'
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft py-1.5">
      <span className="text-[10.5px] text-muted whitespace-nowrap">{label}</span>
      <span className={`font-mono text-[11.5px] font-semibold ${toneCls} whitespace-nowrap`}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-faint">{unit}</span>}
      </span>
    </div>
  )
}

function PanelCard({ title, ko, children, className }: {
  title: string; ko?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(60,45,25,0.04),0_6px_18px_rgba(60,45,25,0.05)] ${className ?? ''}`}>
      <header className="flex items-baseline gap-2 border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2">
        <span className="text-[12px] font-semibold text-text-strong">{title}</span>
        {ko && <span className="text-[10.5px] text-muted">· {ko}</span>}
      </header>
      <div className="min-h-0 flex-1 p-1">
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// AI 이론 해설 — floating bottom-right panel
// ---------------------------------------------------------------------------

const AI_BLURBS: Record<TabKey, string> = {
  forward: '이 탭은 forward 모델 — 즉 "lesion 가설 θ 가 주어졌을 때 100채널 시계열 d 를 예측하는" 시뮬레이션 단계입니다. 좌측 wavefield 에서 30 kHz Ricker 펄스가 송신부에서 퍼져 나가며, lesion 영역(노란 점선) 에 닿으면 위상 지연이 발생합니다. 우측 dispersion curve 는 이 지연을 주파수 도메인에서 본 모습 — 30 kHz 부근에 노치가 보이면 lesion 가설이 데이터를 설명할 수 있다는 뜻입니다. 음향파(scalar) 가 아닌 elastic 방정식을 푸는 이유는 표면파의 SNR 기여 때문입니다.',
  inversion: '베이지안 역산은 forward 의 역방향 — d 가 주어졌을 때 θ 의 사후분포 p(θ|d) 를 추정합니다. 좌측 trace plot 은 4개 파라미터(x, y, z, r) 의 1000 iter 체인이 모두 정상상태에 도달했는지 보여줍니다. 우측 autocorr/R̂ 차트로 진단: τ ≈ 9, ESS ≈ 247, R̂ < 1.05 모두 통과. 1000 iter 가 진단적으로 충분한 길이임을 확인할 수 있습니다.',
  corner: 'Corner plot 은 사후분포의 모든 결합 구조를 한 화면에 보여주는 표준 시각화입니다. 대각선은 marginal posterior, 하삼각은 pairwise scatter — 노란 ✕ 표시가 ground truth 입니다. (z, r) 쌍에 약한 음의 상관이 보이는데, 이는 깊은 병변일수록 작은 반경으로 보상되는 trade-off — 30 kHz 단일 주파수 데이터의 한계입니다. multi-frequency 데이터로 풀 수 있습니다.',
  sensitivity: '민감도 분석은 가정의 robustness 를 검증합니다. 좌측 히트맵에서 SNR × prior 강도 축으로 misfit 의 valley(녹색) 가 어디인지 — 우리 베이스라인 (SNR 30 dB, prior 0.8) 은 valley 안쪽 입니다. SNR 이 20 dB 이하로 떨어지면 misfit 이 빠르게 악화 — 이게 임상 SNR 요구사항의 근거입니다. 우측 잔차 분포가 채널별로 균등하면 forward 모델이 잘 작동.',
}

function AiPanel({ tab }: { tab: TabKey }) {
  // PHASE 11: wire to Claude API for live Q&A.
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel shadow-[0_8px_28px_rgba(60,45,25,0.12)] transition-colors hover:border-accent-line"
        title="AI 이론 해설 열기"
      >
        <Sparkles size={18} className="text-accent" />
      </button>
    )
  }
  return (
    <aside className="fixed bottom-6 right-6 z-30 flex h-[400px] w-[320px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_8px_28px_rgba(60,45,25,0.15)]">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-finding-progressed">
          <Sparkles size={12} className="text-white" />
        </div>
        <span className="text-[12px] font-semibold text-text-strong">AI 이론 해설</span>
        <span className="pill pill-accent ml-1 text-[9px]">{THEORY[tab].title.split('·')[0].trim()}</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-[11px] text-muted hover:text-text"
          title="닫기"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-auto px-3 py-3 text-[11.5px] leading-relaxed text-text">
        {AI_BLURBS[tab]}
        <div className="mt-3 rounded-md border border-line-soft bg-panel-2/50 p-2 text-[10px] text-muted">
          ※ 본 해설은 이론 컨텍스트 보조용입니다. AI 응답은 참고용입니다.
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-3 py-2 text-[10.5px] text-faint">
        <span className="status-dot bg-accent" /> 이론 해설
      </footer>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// main component
// ---------------------------------------------------------------------------

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'forward',     label: 'Forward 모델',  icon: Waves },
  { key: 'inversion',   label: '베이지안 역산', icon: Activity },
  { key: 'corner',      label: '사후 코너',     icon: BarChart3 },
  { key: 'sensitivity', label: '민감도 분석',   icon: Atom },
]

export default function ResearchLab() {
  const [tab, setTab] = useState<TabKey>('forward')
  const [scenario, setScenario] = useState<Scenario>('inf80')
  const [showTheory, setShowTheory] = useState(true)
  const [vsPct, setVsPct] = useState(50)
  const [radPx, setRadPx] = useState(0)
  const [freqKhz, setFreqKhz] = useState(30)

  const meta = SCENARIOS.find((s) => s.key === scenario)!
  const liveMisfit = useMemo(() => {
    const tuning = Math.abs(vsPct / 100 - meta.vsDrop / 100) + Math.abs(radPx) / 8 + Math.abs(30 - freqKhz) / 40
    return (meta.bestMisfit * (1 + tuning * 0.6)).toFixed(1)
  }, [vsPct, radPx, freqKhz, meta])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      {/* header --------------------------------------------------------- */}
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line bg-panel px-5">
        <button
          onClick={() => history.back()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-muted hover:border-accent-line hover:text-text"
          title="이전 화면"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-roi to-accent" />
        <h1 className="editorial text-[18px] font-normal text-text-strong leading-tight">심층 분석 모드</h1>
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-roi border border-roi/30 rounded px-1.5 py-0.5">
          THEORETICAL · DEEP
        </span>
        <span className="font-mono text-[10px] text-faint">
          case 1 · {meta.label}
        </span>
        <div className="flex-1" />
        {/* scenario picker */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 p-0.5">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setScenario(s.key)}
              className={`px-2.5 py-1 text-[10.5px] font-medium rounded ${scenario === s.key ? 'bg-panel text-text-strong shadow-sm' : 'text-muted hover:text-text'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowTheory((v) => !v)}
          className={`btn ${showTheory ? 'btn-primary' : ''}`}
          title="이론 해설 토글"
        >
          <Brain size={13} />
          이론 해설
        </button>
        <span className="flex items-center gap-1 text-[10px] text-warn">
          <span className="status-dot bg-warn" />
          backend 연동 예정
        </span>
      </header>

      {/* tab bar -------------------------------------------------------- */}
      <div className="tabbar flex-shrink-0 px-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? 'active' : ''}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon size={12} className={tab === key ? 'text-accent' : ''} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* body ----------------------------------------------------------- */}
      <div className="flex min-h-0 flex-1">
        {/* left rail — readouts + theory. Narrower default (240 px) so the
            chart grid keeps usable width on 1280–1440 px laptops; widens at
            xl+ where headroom returns. */}
        <aside className="flex w-[240px] flex-shrink-0 flex-col gap-4 overflow-auto border-r border-line bg-panel p-4 xl:w-[280px]">
          {/* readouts */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Forward 모델</div>
            <Readout label="grid" value="415×308×17" />
            <Readout label="voxel pitch" value="0.1" unit="mm" />
            <Readout label="source freq" value="30" unit="kHz" />
            <Readout label="timesteps" value="75,000" />
            <Readout label="dt" value="4" unit="ns" />
            <Readout label="receivers" value="100" />
            <Readout label="Vs gingiva" value="0.05" unit="km/s" />
            <Readout
              label="Vs lesion"
              value={(0.05 * (1 - meta.vsDrop / 100)).toFixed(3)}
              unit="km/s"
              tone={meta.tone}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">역산 진단</div>
            <Readout label="chain length" value="1,000" />
            <Readout label="acceptance" value={String(meta.acceptPct)} unit="%" tone="good" />
            <Readout
              label="R̂ split"
              value={meta.rhat.toFixed(3)}
              tone={meta.rhat <= 1.05 ? 'good' : 'warn'}
            />
            <Readout label="ESS" value={String(247 - meta.vsDrop)} unit="/1k" tone="good" />
            <Readout label="autocorr τ" value="≈9" unit="iter" />
            <Readout label="loc error" value={meta.locError.toFixed(2)} unit="mm" tone="accent" />
            <Readout label="best misfit" value={`${meta.bestMisfit.toFixed(1)}e-3`} />
          </div>

          {/* theory panel — only on this tab */}
          {showTheory && (
            <div className="rounded-lg border border-line bg-panel-2/40 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <FlaskConical size={12} className="text-accent" />
                <span className="text-[11px] font-bold text-text-strong">이론 해설</span>
              </div>
              <div className="mb-2 text-[10.5px] font-semibold text-accent">{THEORY[tab].title}</div>
              <div className="space-y-2 text-[10.5px] leading-relaxed text-text">
                {THEORY[tab].paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* tab content ------------------------------------------------- */}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
          {tab === 'forward' && (
            <div
              className="grid h-full min-h-[min(640px,80vh)] grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr] xl:grid-rows-[1fr_1fr]"
            >
              <PanelCard title="Wavefield" ko="30 kHz Ricker · 단일 스냅샷">
                <WavefieldChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="Dispersion" ko="phase velocity vs frequency">
                <DispersionChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="Receiver Gather" ko="100ch × 75,000 step" className="col-span-1">
                <ReceiverGatherChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="Residual" ko="채널별 |d_obs − forward(θ̂)|">
                <ResidualBars scenario={scenario} />
              </PanelCard>
            </div>
          )}

          {tab === 'inversion' && (
            <div className="grid h-full min-h-[min(640px,80vh)] grid-cols-1 gap-3 xl:grid-cols-2 xl:grid-rows-[1fr_1fr]">
              <PanelCard title="MCMC Trace" ko="체인 트레이스 · GT 점선">
                <TraceChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="Marginals" ko="사후 주변분포 (post-burnin)">
                <HistogramChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="Autocorrelation" ko="ρ(k) · 적분 자기상관시간 τ">
                <AutoCorrChart scenario={scenario} />
              </PanelCard>
              <PanelCard title="R̂ Convergence" ko="split Gelman–Rubin · 목표 ≤ 1.05">
                <RhatChart scenario={scenario} />
              </PanelCard>
            </div>
          )}

          {tab === 'corner' && (
            <PanelCard title="Posterior Corner Plot" ko="(x, y, z, r) 사후분포 · 대각=marginal, 하단=pairwise" className="h-full min-h-[min(600px,75vh)]">
              <CornerPlotChart scenario={scenario} />
            </PanelCard>
          )}

          {tab === 'sensitivity' && (
            <div
              className="grid h-full min-h-[min(600px,75vh)] grid-cols-1 gap-3 xl:grid-cols-[280px_1fr_1fr] xl:grid-rows-[1fr_1fr]"
            >
              {/* sliders + misfit readout */}
              <section className="flex flex-col gap-3 overflow-auto rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(60,45,25,0.04),0_6px_18px_rgba(60,45,25,0.05)] xl:row-span-2">
                <div className="text-[12px] font-semibold text-text-strong">파라미터 스윕</div>
                <div className="text-[10.5px] text-muted">forward 재시뮬 · backend 연동 예정</div>

                <SliderRow label="염증 Vs 감소율" value={vsPct} set={setVsPct} min={20} max={70} step={5} unit="%" />
                <SliderRow label="병변 반경 보정" value={radPx} set={setRadPx} min={-4} max={4} step={1} unit=" vox" />
                <SliderRow label="소스 주파수" value={freqKhz} set={setFreqKhz} min={20} max={40} step={1} unit=" kHz" />

                <div className="mt-2 rounded-lg border border-line bg-panel-2/60 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-muted">예상 best misfit</div>
                  <div className="font-mono text-[28px] font-bold text-warn leading-tight">{liveMisfit}e-3</div>
                </div>
                <div className="text-[10.5px] leading-relaxed text-faint">
                  ※ 실제 forward 재계산은 backend 에서 grid bin 을 swap 합니다. 현재는 민감도 추정만 표시.
                </div>
              </section>

              <PanelCard title="Misfit Surface" ko="SNR × prior strength">
                <SensitivitySurface vsPct={vsPct} radPx={radPx} freqKhz={freqKhz} scenario={scenario} />
              </PanelCard>
              <PanelCard title="True vs Estimate" ko="(x, z) 사후 산점도">
                <TrueVsEstimateScatter scenario={scenario} />
              </PanelCard>
              <PanelCard title="Residual / Channel" ko="screening surface · |residual|" className="xl:col-span-2">
                <ResidualBars scenario={scenario} />
              </PanelCard>
            </div>
          )}
        </main>
      </div>

      <AiPanel tab={tab} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SliderRow helper
// ---------------------------------------------------------------------------

interface SliderRowProps {
  label: string
  value: number
  set: (v: number) => void
  min: number
  max: number
  step: number
  unit?: string
}

function SliderRow({ label, value, set, min, max, step, unit }: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-text">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => set(+e.target.value)}
        className="w-full accent-accent"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// declare global Plotly namespace for the synthetic Data type cast above.
// ---------------------------------------------------------------------------

declare const Plotly: { Data: unknown; Layout: unknown }
export type { Plotly as _PlotlyForResearchLab }
