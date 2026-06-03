import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, Sparkles, Bell, ChevronRight } from 'lucide-react'
import { fetchPatients } from '../api/endpoints'
import ThemeToggle from '../components/ThemeToggle'
import { applyTheme } from '../components/ThemeToggle'
import { setManualThemeFlag } from '../lib/useRouteTheme'

/**
 * Intro — editorial cover with three entries.
 * Mirrors design handoff "치과 통합 콘솔 - 통합 프로토타입.html" → Intro().
 * Three modes: 임상 콘솔 / 심층 분석 / 환자용 앱.
 */
export default function Intro() {
  const nav = useNavigate()

  // Intro is always Clinical Light (editorial cover surface)
  useEffect(() => {
    setManualThemeFlag(false)
    applyTheme('light')
  }, [])

  const patientsQ = useQuery({ queryKey: ['patients'], queryFn: fetchPatients, staleTime: 60_000 })
  // Pick the most severe live case for the right-side hero
  const hero = (patientsQ.data ?? [])
    .filter((p) => p.latest_severity != null)
    .sort((a, b) => (b.latest_severity ?? 0) - (a.latest_severity ?? 0))[0]
  const pct = hero?.latest_severity != null ? Math.round(hero.latest_severity * 100) : null
  const verdict = pct == null
    ? { label: '—', tone: 'muted' as const, ko: '판정 보류' }
    : pct < 20 ? { label: 'NEGATIVE', tone: 'good' as const, ko: '정상 소견' }
    : pct < 50 ? { label: 'EQUIVOCAL', tone: 'warn' as const, ko: '경계성' }
    : pct < 80 ? { label: 'SUSPICIOUS', tone: 'warn' as const, ko: '의심 소견' }
    : { label: 'PROBABLE LESION', tone: 'bad' as const, ko: '병변 가능성 높음' }

  return (
    <div className="relative h-full overflow-hidden bg-bg text-text">
      {/* dot grid is from body bg — explicit here too for stand-alone surface */}
      <header className="relative z-10 flex h-[60px] items-center gap-3 px-8">
        <Mark />
        <span className="text-[13.5px] font-bold tracking-tight text-text-strong">Dental Wave Viz</span>
        <span className="font-mono text-[10.5px] text-faint">30 kHz 탄성파 치은 스크리닝</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      {/* Below 1280 px the right-hand hero crowds the editorial copy; stack
          vertically there and only switch to two columns at xl. */}
      <div className="relative z-10 grid h-[calc(100%-60px)] grid-cols-1 items-center gap-8 overflow-auto px-6 pb-14 pt-2 sm:px-10 xl:grid-cols-[1.05fr_1fr] xl:gap-10 xl:overflow-hidden xl:px-14">
        {/* LEFT — editorial copy + entry cards */}
        <div className="animate-[fade-in_0.32s_var(--ease-out)_both]">
          <div className="font-mono text-[12px] uppercase tracking-[0.22em] text-accent">
            비침습 치은 병변 스크리닝
          </div>
          <h1 className="editorial mt-3.5 text-[58px] font-semibold leading-[1.05] tracking-[-0.025em] text-text-strong">
            잇몸의 안쪽을,<br />
            <span className="editorial-i">소리</span>로 듣다
          </h1>
          <p className="mt-5 max-w-[450px] text-[14.5px] leading-[1.7] text-muted">
            치아 표면에 가한 30 kHz 탄성파를 100개의 수신기가 0.3 ms 동안 기록하고, 베이지안 역산으로 병변의 위치를 추정합니다.
          </p>

          <div className="mt-6 flex flex-col gap-3 max-w-[540px]">
            <EntryCard
              primary
              icon={<Activity className="h-[21px] w-[21px] text-white" strokeWidth={1.8} />}
              title="임상 콘솔"
              desc="의사·환자용 — 검토·진단·기록"
              onClick={() => nav('/')}
            />
            <EntryCard
              icon={<Sparkles className="h-[21px] w-[21px] text-white" strokeWidth={1.8} />}
              gradient="linear-gradient(135deg, var(--color-roi), var(--color-accent))"
              title="심층 분석 모드"
              desc="이론·물리·역산 심층 분석 (연구)"
              onClick={() => nav('/lab')}
            />
            <EntryCard
              icon={<Bell className="h-[21px] w-[21px] text-white" strokeWidth={1.8} />}
              gradient="linear-gradient(135deg, var(--color-finding-progressed), var(--color-warn))"
              title="환자용 앱 (모바일)"
              desc="쉬운 결과 설명 · 경과 · AI Q&A"
              onClick={() => nav('/m')}
            />
          </div>

          <div className="mt-5 font-mono text-[11px] text-faint">
            김주영 · Dr. Kim · 치주과
          </div>
        </div>

        {/* RIGHT — living case card */}
        <HeroCase pct={pct} verdict={verdict} patientName={hero?.full_name} />
      </div>
    </div>
  )
}

function EntryCard({
  icon, gradient, title, desc, onClick, primary,
}: {
  icon: React.ReactNode
  gradient?: string
  title: string
  desc: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        'group flex items-center gap-3.5 rounded-[14px] p-4 text-left transition ' +
        (primary
          ? 'bg-accent text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--color-accent)_24%,transparent)] hover:bg-accent-strong'
          : 'border border-line bg-panel hover:border-accent-line hover:bg-elevated')
      }
    >
      <div
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: primary ? 'rgba(255,255,255,0.18)' : (gradient ?? 'var(--color-accent)') }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={'text-[15px] font-bold ' + (primary ? 'text-white' : 'text-text-strong')}>
          {title}
        </div>
        <div className={'mt-0.5 text-[11.5px] ' + (primary ? 'text-white/85' : 'text-muted')}>
          {desc}
        </div>
      </div>
      <ChevronRight
        className={'h-[18px] w-[18px] shrink-0 ' + (primary ? 'text-white' : 'text-faint')}
        strokeWidth={1.8}
      />
    </button>
  )
}

function HeroCase({
  pct, verdict, patientName,
}: {
  pct: number | null
  verdict: { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; ko: string }
  patientName?: string
}) {
  const toneClass = verdict.tone === 'good'
    ? 'text-good'
    : verdict.tone === 'warn'
    ? 'text-warn'
    : verdict.tone === 'bad'
    ? 'text-bad'
    : 'text-muted'
  const pillClass = verdict.tone === 'good'
    ? 'pill-good'
    : verdict.tone === 'warn'
    ? 'pill-warn'
    : verdict.tone === 'bad'
    ? 'pill-bad'
    : 'pill-muted'

  return (
    <Link
      to={patientName ? '/' : '/intro'}
      className="relative block h-[min(540px,80%)] animate-[fade-in_0.4s_var(--ease-out)_both] overflow-hidden rounded-[20px] border border-line shadow-[var(--shadow-pop)]"
      style={{
        background: 'radial-gradient(120% 90% at 50% 10%, var(--color-panel-2), var(--color-bg))',
      }}
    >
      {/* Live MCMC particle field — canvas 2D, severity-driven concentration. */}
      <McmcBackdrop severity={pct} />

      <div className="absolute left-5 top-[18px] max-w-[52%]">
        <div className="font-mono text-[10px] tracking-[0.1em] text-faint">최근 케이스</div>
        <div className="mt-0.5 text-[20px] font-bold text-text-strong">
          {patientName ?? '대기 중'}
        </div>
        <div className="text-[11px] text-muted">{pct != null ? `severity ${pct}%` : '데이터 없음'}</div>
      </div>

      <div className="absolute right-5 top-[18px] text-right">
        <div className={'editorial text-[56px] font-semibold leading-none ' + toneClass}>
          {pct ?? '—'}
          {pct != null && <span className="text-[20px]">%</span>}
        </div>
        <span className={'pill mt-1 ' + pillClass}>
          <span className="status-dot" style={{ background: 'currentColor' }} />
          {verdict.label}
        </span>
      </div>

      <div className="absolute inset-x-5 bottom-[18px] flex justify-between font-mono text-[10px] text-faint">
        <span>{patientName ? '열어보기 →' : '환자 데이터 없음'}</span>
        <span>{verdict.ko}</span>
      </div>
    </Link>
  )
}

/**
 * Live MCMC particle field — canvas 2D, ~60fps via rAF.
 * ~100 particles random-walk near a "posterior mean". High severity = tighter
 * concentration, lower = scattered. Trails via per-frame semi-transparent
 * overlay. Pulsing accent glow + ground-truth crosshair. Honors reduced-motion.
 */
function McmcBackdrop({ severity }: { severity: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const css = getComputedStyle(document.documentElement)
    const colP = css.getPropertyValue('--color-finding-progressed').trim() || '#c2410c'
    const colA = css.getPropertyValue('--color-accent').trim() || '#0f766e'
    const colB = css.getPropertyValue('--color-bg').trim() || '#fafaf7'
    const withA = (c: string, a: number) => {
      if (c.startsWith('#')) {
        const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1)
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
        return `rgba(${r},${g},${b},${a})`
      }
      return `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`
    }

    const sev = Math.max(0, Math.min(1, (severity ?? 50) / 100))
    const spread = 90 - sev * 55                    // high sev → tight cluster
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ps: { x: number; y: number; vx: number; vy: number }[] = []
    let W = 0, H = 0, cx = 0, cy = 0

    const fit = () => {
      const r = canvas.getBoundingClientRect()
      W = r.width; H = r.height
      canvas.width = Math.max(1, Math.floor(W * dpr))
      canvas.height = Math.max(1, Math.floor(H * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W * 0.5; cy = H * 0.58
      if (ps.length === 0) {
        for (let i = 0; i < 100; i++) ps.push({
          x: cx + (Math.random() - 0.5) * spread * 2,
          y: cy + (Math.random() - 0.5) * spread * 1.7, vx: 0, vy: 0,
        })
      }
    }
    fit()

    const frame = (t: number) => {
      ctx.fillStyle = withA(colB, 0.18); ctx.fillRect(0, 0, W, H)
      // pulsing accent glow at posterior mean
      const pulse = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.0018))
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, spread * 1.8)
      gr.addColorStop(0, withA(colA, 0.32 * pulse)); gr.addColorStop(1, withA(colA, 0))
      ctx.fillStyle = gr
      ctx.beginPath(); ctx.arc(cx, cy, spread * 1.8, 0, Math.PI * 2); ctx.fill()
      // particle walk (OU pull + brownian + rare jump = Metropolis-flavor)
      ctx.fillStyle = colP
      const pull = 0.012 + sev * 0.018
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        p.vx += (cx - p.x) * pull + (Math.random() - 0.5) * 0.85
        p.vy += (cy - p.y) * pull + (Math.random() - 0.5) * 0.85
        p.vx *= 0.86; p.vy *= 0.86
        if (Math.random() < 0.004) {
          p.vx += (Math.random() - 0.5) * 8; p.vy += (Math.random() - 0.5) * 8
        }
        p.x += p.vx; p.y += p.vy
        const d = Math.hypot(p.x - cx, p.y - cy)
        ctx.globalAlpha = Math.max(0.18, 0.85 - d / (spread * 2.4))
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      // crosshair = ground truth, slightly offset from posterior mean
      ctx.strokeStyle = colA; ctx.lineWidth = 1; ctx.globalAlpha = 0.65
      const gx = cx + 18, gy = cy - 12
      ctx.beginPath()
      ctx.moveTo(gx - 9, gy); ctx.lineTo(gx + 9, gy)
      ctx.moveTo(gx, gy - 9); ctx.lineTo(gx, gy + 9); ctx.stroke()
      ctx.globalAlpha = 0.35
      ctx.beginPath(); ctx.arc(gx, gy, 4, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 1
    }

    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      ctx.fillStyle = colB; ctx.fillRect(0, 0, W, H); frame(0)
    } else {
      const loop = (t: number) => { frame(t); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [severity])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-80" aria-hidden />
}

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <rect
        x="0.5" y="0.5" width="25" height="25" rx="7"
        fill="url(#mark-grad)"
      />
      <defs>
        <linearGradient id="mark-grad" x1="0" y1="0" x2="26" y2="26">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-finding-progressed)" />
        </linearGradient>
      </defs>
    </svg>
  )
}
