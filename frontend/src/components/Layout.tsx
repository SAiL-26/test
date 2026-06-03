import { Link, NavLink, Outlet, useLocation, useNavigate, useMatch } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Layers, Activity, Sparkles, BookOpen, GitCompareArrows, TrendingUp,
  Clock, Target, LogOut, Smartphone, Home,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { fetchPatients } from '../api/endpoints'
import ThemeToggle from './ThemeToggle'
import useRouteTheme from '../lib/useRouteTheme'

/**
 * Layout — app shell rebuilt against the design handoff (console/views.jsx → Shell).
 * 76px left NavRail · top bar (title · sub · patient switcher slot · theme · logout)
 * The 'console / timeline / story' nav items are contextual (scoped to a patient/scan)
 * so they only appear when a route match supplies the id.
 */
interface RailItem {
  to: string
  label: string
  icon: typeof Layers
  /** match an extra route segment to also light up this item */
  alsoMatch?: RegExp
}
const RAIL_ITEMS: RailItem[] = [
  { to: '/',          label: '환자',     icon: Layers, alsoMatch: /^\/patients\/\d+$/ },
  { to: '/scans/new', label: '새 스캔', icon: Sparkles },
  { to: '/compare',   label: '비교',     icon: GitCompareArrows },
  { to: '/runs',      label: '이력',     icon: Clock },
  { to: '/eval',      label: '평가',     icon: Target },
  { to: '/lab',       label: '연구실',   icon: BookOpen },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  useRouteTheme()

  // contextual nav: light up Console icon when on /scans/:id
  const onScan = useMatch('/scans/:id/*')
  const onTimeline = useMatch('/patients/:id/timeline')

  function onLogout() { logout(); nav('/login') }

  const patientsQ = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    enabled: !!user,
    staleTime: 30_000,
  })
  const urgentCount = (patientsQ.data ?? [])
    .filter((p) => (p.latest_severity ?? 0) >= 0.8).length

  const { title, sub } = pageTitle(loc.pathname)

  return (
    <div className="grid h-full grid-cols-[76px_1fr] grid-rows-[58px_1fr] bg-bg">
      {/* ============== NAV RAIL ============== */}
      <nav
        aria-label="주 내비게이션"
        className="col-start-1 row-span-2 flex flex-col items-center border-r border-line bg-panel py-3"
      >
        <button
          onClick={() => nav('/intro')}
          title="홈 (모드 선택)"
          aria-label="홈 — 모드 선택으로 이동"
          className="mb-3.5 h-[34px] w-[34px] rounded-[9px] border-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent), var(--color-finding-progressed))',
          }}
        />

        <div className="flex w-full flex-1 flex-col items-center gap-1">
          {RAIL_ITEMS.map((it) => {
            const Icon = it.icon
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                title={it.label}
                aria-label={it.label}
                className={({ isActive }) => {
                  const matched = isActive || (it.alsoMatch && it.alsoMatch.test(loc.pathname))
                  return (
                    'relative flex h-[52px] w-[60px] flex-col items-center justify-center gap-[3px] rounded-[11px] transition ' +
                    (matched
                      ? 'bg-accent-soft text-accent-strong'
                      : 'text-muted hover:bg-panel-2 hover:text-text')
                  )
                }}
              >
                <Icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
                <span className="text-[9.5px] font-medium">{it.label}</span>
                {it.to === '/' && urgentCount > 0 && (
                  <span className="absolute right-[10px] top-[7px] inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-bad px-1 text-[9px] font-bold text-white">
                    {urgentCount}
                  </span>
                )}
              </NavLink>
            )
          })}

          {/* contextual rail items — appear only when scoped */}
          {onScan && (
            <NavLink
              to={onScan.pathnameBase}
              end
              title="콘솔"
              className={({ isActive }) =>
                'relative flex h-[52px] w-[60px] flex-col items-center justify-center gap-[3px] rounded-[11px] transition ' +
                (isActive
                  ? 'bg-accent-soft text-accent-strong'
                  : 'text-muted hover:bg-panel-2 hover:text-text')
              }
            >
              <Activity className="h-[19px] w-[19px]" strokeWidth={1.6} />
              <span className="text-[9.5px] font-medium">콘솔</span>
            </NavLink>
          )}
          {onTimeline && (
            <NavLink
              to={onTimeline.pathname}
              end
              title="경과"
              className="relative flex h-[52px] w-[60px] flex-col items-center justify-center gap-[3px] rounded-[11px] bg-accent-soft text-accent-strong"
            >
              <TrendingUp className="h-[19px] w-[19px]" strokeWidth={1.6} />
              <span className="text-[9.5px] font-medium">경과</span>
            </NavLink>
          )}
        </div>

        {/* mobile preview shortcut */}
        <button
          onClick={() => nav('/m')}
          title="환자용 앱 미리보기"
          className="mb-2 flex h-[44px] w-[60px] flex-col items-center justify-center gap-1 rounded-[11px] text-muted hover:bg-panel-2 hover:text-text"
        >
          <Smartphone className="h-[16px] w-[16px]" strokeWidth={1.6} />
          <span className="text-[9px]">모바일</span>
        </button>

        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-panel-2 text-[12px] font-bold text-accent"
          title={user?.full_name ?? ''}
        >
          {(user?.full_name ?? '?').slice(0, 1)}
        </div>
      </nav>

      {/* ============== TOP BAR ============== */}
      <header className="col-start-2 row-start-1 flex items-center gap-3 border-b border-line bg-panel px-[22px] z-30">
        <Link to="/intro" className="flex items-center gap-2" title="홈으로">
          <Home className="h-[14px] w-[14px] text-muted" strokeWidth={1.8} />
        </Link>
        <span className="text-[14px] font-bold tracking-tight text-text-strong whitespace-nowrap">
          {title}
        </span>
        {sub && <span className="font-mono text-[10.5px] text-faint">{sub}</span>}

        <div className="flex-1" />

        {user && (
          <>
            <span className="text-[11px] text-muted">
              <span className="text-text-strong">{user.full_name}</span>
              <span className="mx-1.5 text-faint">·</span>
              <span>{user.role === 'doctor' ? 'doctor' : 'patient'}</span>
            </span>
            <ThemeToggle />
            <button onClick={onLogout} title="로그아웃" className="btn btn-ghost">
              <LogOut className="h-3 w-3" />
            </button>
          </>
        )}
      </header>

      {/* ============== MAIN ============== */}
      <main
        id="main-content"
        className="col-start-2 row-start-2 overflow-hidden"
        tabIndex={-1}
      >
        <Outlet />
      </main>
    </div>
  )
}

function pageTitle(path: string): { title: string; sub?: string } {
  if (path === '/' || /^\/patients\/?$/.test(path)) return { title: '환자 트리아지' }
  if (/^\/patients\/\d+\/timeline/.test(path)) return { title: '병변 경과 분석', sub: 'timeline' }
  if (/^\/patients\/\d+\/compare/.test(path)) return { title: '케이스 비교', sub: 'compare' }
  if (/^\/patients\/\d+/.test(path)) return { title: '환자 상세' }
  if (path === '/scans/new') return { title: '새 스캔 파이프라인', sub: '6-step wizard' }
  if (/^\/scans\/\d+\/story/.test(path)) return { title: '작동 원리', sub: 'how it works' }
  if (/^\/scans\/\d+/.test(path)) {
    const id = path.match(/^\/scans\/(\d+)/)?.[1]
    return { title: '임상 콘솔', sub: id ? `scan-${id.padStart(4, '0')}` : undefined }
  }
  if (path === '/runs') return { title: '스캔 이력' }
  if (path === '/eval') return { title: '평가 · 시나리오' }
  if (path === '/lab') return { title: '심층 분석 모드', sub: 'research' }
  if (path === '/compare') return { title: '케이스 비교' }
  return { title: '' }
}
