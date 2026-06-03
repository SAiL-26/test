import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ChevronLeft, ChevronRight, Clock, Download,
  Heart, MessageCircle, RefreshCw, Search, Send, Share2, Sparkles, TrendingUp,
} from 'lucide-react'
import { applyTheme } from '../components/ThemeToggle'
import { setManualThemeFlag } from '../lib/useRouteTheme'
import { fetchPatients, fetchPatient, fetchScans } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { askClaude, type ChatMessage } from '../api/ai'
import type { Patient, Scan, ScenarioTag } from '../api/types'

/**
 * PatientApp — Phase 10 (mobile patient-facing app).
 * Standalone, no Layout chrome. Light theme forced. Max-width 440px (centered).
 * Three bottom-tab sections: 결과 / 경과 / AI Q&A.
 * No Plotly / R3F — inline SVG only for trend chart.
 */

type Tone = 'good' | 'warn' | 'bad' | 'muted'
type TabKey = 'result' | 'progress' | 'ask'

interface FriendlyVerdict {
  label: string   // editorial Korean label
  sub: string     // one-line plain explanation
  band: string    // NEGATIVE / EQUIVOCAL / SUSPICIOUS / PROBABLE LESION
  tone: Tone
}

function friendlyVerdict(pct: number | null): FriendlyVerdict {
  if (pct == null) return { label: '판정 보류', sub: '아직 분석 결과가 없어요.', band: '—', tone: 'muted' }
  if (pct < 20)  return { label: '건강해요',       sub: '특별한 이상이 발견되지 않았어요. 지금처럼 잘 관리해 주세요.', band: 'NEGATIVE',        tone: 'good' }
  if (pct < 50)  return { label: '가볍게 지켜봐요', sub: '약간의 변화가 보이지만 정기 검진 주기를 유지하면 돼요.',     band: 'EQUIVOCAL',       tone: 'warn' }
  if (pct < 80)  return { label: '검진을 권장해요', sub: '가까운 시일 내 진료를 한 번 받아보세요.',                     band: 'SUSPICIOUS',      tone: 'warn' }
  return            { label: '진료가 필요해요',   sub: '전문 진료를 받아보시길 권장합니다.',                          band: 'PROBABLE LESION', tone: 'bad' }
}

const toneText = (t: Tone) => t === 'good' ? 'text-good' : t === 'warn' ? 'text-warn' : t === 'bad' ? 'text-bad' : 'text-muted'
const toneBg   = (t: Tone) => t === 'good' ? 'bg-good'   : t === 'warn' ? 'bg-warn'   : t === 'bad' ? 'bg-bad'   : 'bg-muted'
const tonePill = (t: Tone) => t === 'good' ? 'pill-good' : t === 'warn' ? 'pill-warn' : t === 'bad' ? 'pill-bad' : 'pill-muted'
const toneVar  = (t: Tone) =>
  t === 'good' ? 'var(--color-good)' :
  t === 'warn' ? 'var(--color-warn)' :
  t === 'bad'  ? 'var(--color-finding-progressed)' : 'var(--color-muted)'

function scenarioMeta(s: ScenarioTag): { label: string; tone: Tone } {
  if (s === 'healthy') return { label: '정상',     tone: 'good' }
  if (s === 'inf70')   return { label: '경계 신호', tone: 'warn' }
  return                      { label: '진행 신호', tone: 'bad' }
}

function calcAge(dob: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1
  return a
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  const m = s.slice(0, 10).split('-')
  return m.length === 3 ? `${m[0]}.${m[1]}.${m[2]}` : s
}

const severityPct = (v: number | null | undefined): number | null =>
  v == null ? null : Math.round(v * 100)

// ===========================================================================
// PAGE SHELL
// ===========================================================================

export default function PatientApp() {
  const { patientId } = useParams<{ patientId?: string }>()
  const nav = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('result')
  const queryClient = useQueryClient()
  // 도움(=ask) 탭 미열람 알림 — severity가 50% 이상이고, 사용자가 아직 도움 탭을
  // 열어보지 않았다면 점을 띄운다.
  const [askUnread, setAskUnread] = useState(false)

  useEffect(() => { setManualThemeFlag(false); applyTheme('light') }, [])

  const patientsQ = useQuery({ queryKey: ['patients'], queryFn: fetchPatients, staleTime: 60_000 })

  // Resolve target patient: explicit id wins; else latest scan date.
  const resolvedId = useMemo(() => {
    if (patientId && /^\d+$/.test(patientId)) return Number(patientId)
    const list = patientsQ.data ?? []
    if (list.length === 0) return null
    return [...list].sort((a, b) => (b.latest_scan_date ?? '').localeCompare(a.latest_scan_date ?? ''))[0].id
  }, [patientId, patientsQ.data])

  const patientQ = useQuery({
    queryKey: ['patient', resolvedId],
    queryFn: () => fetchPatient(resolvedId as number),
    enabled: resolvedId != null,
  })
  const scansQ = useQuery({
    queryKey: ['scans', resolvedId],
    queryFn: () => fetchScans(resolvedId as number),
    enabled: resolvedId != null,
  })

  const patient = patientQ.data
  const scans = useMemo<Scan[]>(
    () => [...(scansQ.data ?? [])].sort((a, b) => (b.scan_date ?? '').localeCompare(a.scan_date ?? '')),
    [scansQ.data],
  )

  const avatarChar = patient?.full_name?.[0] ?? user?.full_name?.[0] ?? '환'
  const loading = patientsQ.isLoading || (resolvedId != null && (patientQ.isLoading || scansQ.isLoading))
  const noPatients = !loading && (patientsQ.data?.length ?? 0) === 0
  // Show picker for demo (doctor / staff) when no id supplied & multiple patients.
  const showPicker = !patientId && !loading && (patientsQ.data?.length ?? 0) > 1 && user?.role !== 'patient'

  // Severity-driven help nudge: when patient's severity ≥ 50, mark 도움 unread
  // (until the user actually taps it). Runs once per patient.
  const seenAskRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!patient) return
    const sev = severityPct(patient.latest_severity)
    if (sev != null && sev >= 50 && !seenAskRef.current.has(patient.id)) {
      setAskUnread(true)
    }
  }, [patient])

  const handleTabChange = useCallback(
    (next: TabKey) => {
      if (next === 'ask') {
        setAskUnread(false)
        if (patient) seenAskRef.current.add(patient.id)
      }
      setTab(next)
    },
    [patient],
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patients'] }),
      resolvedId != null
        ? queryClient.invalidateQueries({ queryKey: ['patient', resolvedId] })
        : Promise.resolve(),
      resolvedId != null
        ? queryClient.invalidateQueries({ queryKey: ['scans', resolvedId] })
        : Promise.resolve(),
    ])
  }, [queryClient, resolvedId])

  return (
    <div className="min-h-screen w-full bg-bg text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col bg-panel shadow-[var(--shadow-panel)]">
        <TopBar
          patientName={patient?.full_name}
          age={patient?.dob ? calcAge(patient.dob) : null}
          mrn={patient?.mrn}
          avatar={avatarChar}
          onBack={() => nav('/intro')}
        />

        {showPicker && (
          <PatientPicker
            patients={patientsQ.data ?? []}
            activeId={resolvedId}
            onPick={(id) => nav(`/m/${id}`)}
          />
        )}

        <main className="flex-1 overflow-y-auto pb-[88px]">
          {loading && <LoadingScreen />}
          {noPatients && <EmptyState />}
          {!loading && !noPatients && patient && (
            <>
              {tab === 'result'   && <ResultTab   patient={patient} scans={scans} onRefresh={refresh} />}
              {tab === 'progress' && <ProgressTab patient={patient} scans={scans} />}
              {tab === 'ask'      && <AskTab      patient={patient} scans={scans} />}
            </>
          )}
        </main>

        <BottomNav tab={tab} setTab={handleTabChange} askUnread={askUnread} />
      </div>
    </div>
  )
}

// ===========================================================================
// SHELL PIECES
// ===========================================================================

function TopBar({
  patientName, age, mrn, avatar, onBack,
}: {
  patientName?: string; age: number | null; mrn?: string; avatar: string; onBack: () => void
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur">
      <button onClick={onBack} className="btn-ghost btn !px-2 !py-1" aria-label="돌아가기">
        <ChevronLeft className="h-4 w-4" />
        <span className="text-[12px]">돌아가기</span>
      </button>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="text-right leading-tight">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">안녕하세요</div>
          <div className="text-[13.5px] font-bold text-text-strong">
            {patientName ?? '환자'}
            <span className="ml-1 text-[11px] font-normal text-muted">{age != null ? `· ${age}세` : ''}</span>
          </div>
          {mrn && <div className="font-mono text-[9.5px] text-faint">{mrn}</div>}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-finding-progressed))' }}
        >
          {avatar}
        </div>
      </div>
    </header>
  )
}

function PatientPicker({
  patients, activeId, onPick,
}: { patients: Patient[]; activeId: number | null; onPick: (id: number) => void }) {
  return (
    <div className="border-b border-line bg-panel-2 px-3 py-2">
      <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">데모용 · 환자 전환</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className={'chip whitespace-nowrap ' + (p.id === activeId ? 'chip-active' : '')}
          >
            {p.full_name}
          </button>
        ))}
      </div>
    </div>
  )
}

function BottomNav({
  tab, setTab, askUnread,
}: { tab: TabKey; setTab: (t: TabKey) => void; askUnread: boolean }) {
  const items: { key: TabKey; label: string; Icon: typeof Activity }[] = [
    { key: 'result',   label: '결과',  Icon: Activity },
    { key: 'progress', label: '경과',  Icon: TrendingUp },
    { key: 'ask',      label: '도움',  Icon: Sparkles },
  ]
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-panel/95 backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="flex">
        {items.map(({ key, label, Icon }) => {
          const active = tab === key
          const showDot = key === 'ask' && askUnread && !active
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={'relative flex flex-1 flex-col items-center gap-1 py-2.5 transition ' + (active ? 'text-accent' : 'text-faint hover:text-text')}
            >
              <span className="relative inline-flex">
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.2 : 1.6}
                  fill={active ? 'currentColor' : 'none'}
                  fillOpacity={active ? 0.12 : 0}
                />
                {showDot && (
                  <span
                    aria-label="새 안내가 있습니다"
                    className="absolute -right-1 -top-1 inline-block h-[8px] w-[8px] rounded-full"
                    style={{ background: 'var(--color-finding-progressed)', boxShadow: '0 0 0 2px var(--color-panel)' }}
                  />
                )}
              </span>
              <span className={'text-[10.5px] ' + (active ? 'font-bold' : 'font-medium')}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function LoadingScreen() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="skeleton h-[170px] w-full rounded-[18px]" />
      <div className="skeleton h-[110px] w-full rounded-[18px]" />
      <div className="skeleton h-[110px] w-full rounded-[18px]" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-2">
        <Heart className="h-7 w-7 text-muted" strokeWidth={1.6} />
      </div>
      <div className="mt-4 text-[15px] font-bold text-text-strong">등록된 환자가 없어요</div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        검사 결과가 도착하면 여기에서 확인하실 수 있어요.
      </p>
    </div>
  )
}

// ===========================================================================
// TAB 1 — 결과 (Results)
// ===========================================================================

function ResultTab({
  patient, scans, onRefresh,
}: { patient: Patient; scans: Scan[]; onRefresh: () => Promise<void> }) {
  const [explainOpen, setExplainOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const sev = severityPct(patient.latest_severity)
  const fv = friendlyVerdict(sev)
  const latestScan = scans[0]
  const meta = latestScan ? scenarioMeta(latestScan.scenario_tag) : null
  const heroTint = toneVar(fv.tone)

  // Pull-to-refresh — finger drag near scrollTop=0 pulls a tray; release ≥ threshold → refetch.
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number | null>(null)
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const THRESHOLD = 64

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Only arm pull when scrolled to the very top of the main scroller (= window scrollTop here).
    const main = containerRef.current?.closest('main') as HTMLElement | null
    if (main && main.scrollTop > 2) return
    startYRef.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null || refreshing) return
    const dy = e.touches[0].clientY - startYRef.current
    if (dy > 0) {
      // Dampen — feels rubbery, caps near 90px
      const eased = Math.min(90, dy * 0.55)
      setPullY(eased)
    }
  }
  const onTouchEnd = async () => {
    if (startYRef.current == null) return
    const triggered = pullY >= THRESHOLD
    startYRef.current = null
    if (triggered && !refreshing) {
      setRefreshing(true)
      try { await onRefresh() } catch { /* swallow */ }
      setRefreshing(false)
    }
    setPullY(0)
  }

  async function onShare() {
    const verdict = fv.label
    const dateStr = formatDate(latestScan?.scan_date ?? patient.latest_scan_date)
    const text = `${patient.full_name} 검사 결과 (${dateStr})\n점수 ${sev ?? '—'} · ${verdict}`
    const url = typeof window !== 'undefined' ? window.location.href : ''
    type ShareNav = Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
    }
    const navAny = navigator as ShareNav
    if (navAny.share) {
      try {
        await navAny.share({ title: '검사 결과', text, url })
        return
      } catch {
        // user cancelled → fall through
        return
      }
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        alert('링크가 복사되었습니다')
        return
      } catch { /* no-op */ }
    }
    alert('공유를 지원하지 않는 환경입니다')
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative flex flex-col gap-3.5 px-4 pt-3"
      style={{ transform: `translateY(${pullY}px)`, transition: pullY === 0 ? 'transform 220ms var(--ease-out)' : 'none' }}
    >
      {/* Pull-to-refresh tray */}
      {(pullY > 0 || refreshing) && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] text-muted"
          style={{ top: `${Math.max(0, pullY - 28)}px` }}
        >
          <RefreshCw
            className={'h-3.5 w-3.5 ' + (refreshing ? 'animate-spin text-accent' : '')}
            style={{ transform: refreshing ? 'none' : `rotate(${pullY * 3}deg)` }}
          />
          <span>{refreshing ? '새로고침 중…' : pullY >= THRESHOLD ? '놓아서 새로고침' : '아래로 당겨 새로고침'}</span>
        </div>
      )}

      {/* Top action row — 공유 button */}
      <div className="-mt-1 flex items-center justify-end">
        <button
          onClick={onShare}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1.5 text-[11px] font-medium text-text transition hover:border-accent-line hover:bg-elevated"
          aria-label="공유"
        >
          <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
          공유
        </button>
      </div>

      {/* Hero — friendly verdict + indicator bar */}
      <section
        className="relative overflow-hidden rounded-[22px] border p-5"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${heroTint} 14%, var(--color-panel)), var(--color-panel))`,
          borderColor: `color-mix(in srgb, ${heroTint} 32%, var(--color-line))`,
        }}
      >
        <div className="flex items-center justify-between">
          <span className={'pill ' + tonePill(fv.tone)}>
            <span className={'status-dot ' + toneBg(fv.tone)} />
            {fv.band}
          </span>
          <span className="font-mono text-[10px] tracking-[0.1em] text-faint">
            {formatDate(latestScan?.scan_date ?? patient.latest_scan_date)}
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className={'editorial text-[64px] font-semibold leading-none ' + toneText(fv.tone)}>
            {sev ?? '—'}
          </span>
          {sev != null && (
            <span className={'editorial-i text-[22px] ' + toneText(fv.tone)}>점</span>
          )}
        </div>

        <h1 className="editorial mt-1 text-[26px] font-semibold leading-tight text-text-strong">
          {fv.label}
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">{fv.sub}</p>

        <div className="mt-4">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-panel-2">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${sev ?? 0}%`, background: heroTint, transition: 'width 320ms var(--ease-out)' }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-faint">
            <span>건강</span>
            <span className={toneText(fv.tone)}>병변 가능성 지표 {sev ?? '—'}</span>
            <span>높음</span>
          </div>
        </div>
      </section>

      {/* 이 결과의 의미 — expandable card with friendly metaphor */}
      <section className="rounded-[18px] border border-line bg-panel-2 p-4">
        <button onClick={() => setExplainOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[13px] font-bold text-text-strong">이 결과의 의미</div>
              <div className="text-[11px] text-muted">쉽게 풀어 설명해 드릴게요</div>
            </div>
          </div>
          <ChevronRight className={'h-4 w-4 text-muted transition-transform ' + (explainOpen ? 'rotate-90' : '')} />
        </button>
        {explainOpen && (
          <div className="mt-3 border-t border-line pt-3 text-[12.5px] leading-[1.7] text-text">
            <ExplainBody pct={sev} tone={fv.tone} />
          </div>
        )}
      </section>

      {/* scenario / scan info */}
      {meta && latestScan && (
        <section className="rounded-[18px] border border-line bg-panel p-4">
          <div className="mb-1.5 text-[12.5px] font-bold text-text-strong">검사 정보</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={'pill ' + tonePill(meta.tone)}>{meta.label}</span>
            <span className="chip">{formatDate(latestScan.scan_date)}</span>
            <span className="chip font-mono">scan/{latestScan.id}</span>
          </div>
          {latestScan.notes && (
            <p className="mt-2.5 text-[12px] leading-[1.6] text-muted">{latestScan.notes}</p>
          )}
        </section>
      )}

      {/* 권고 사항 — recommendation cards */}
      <section className="flex flex-col gap-2.5">
        <div className="mt-1 px-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">권고 사항</div>
        {recommendedActions(sev).map((a, i) => (
          <ActionCard
            key={i}
            {...a}
            primary={i === 0}
            onCta={a.cta === '진료 예약하기' ? () => setBookingOpen(true) : undefined}
          />
        ))}
      </section>

      <BookingSheet open={bookingOpen} onClose={() => setBookingOpen(false)} />

      <button
        onClick={() => window.print()}
        className="btn mt-2 !w-full !justify-center !py-3 !text-[12.5px]"
      >
        <Download className="h-4 w-4" />
        결과 PDF 저장 · 인쇄
      </button>

      <div className="mt-2 px-1 pb-4 text-center font-mono text-[10px] leading-[1.6] text-faint">
        최종 판단은 면허 의사의 직접 검진에 따라야 합니다.
      </div>
    </div>
  )
}

/** Bottom-sheet for 진료 예약. tel: + 닫기 buttons. */
function BookingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="진료 예약"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-t-[24px] bg-panel p-5 animate-[fade-in_0.2s_var(--ease-out)_both]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="text-[15px] font-bold text-text-strong">진료 예약</div>
        <div className="mt-0.5 text-[12px] text-muted">담당 의원에 직접 연락해 예약을 진행해주세요.</div>

        <div className="mt-4 rounded-[14px] border border-line bg-panel-2 p-3.5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-faint">담당의</div>
          <div className="mt-0.5 text-[14px] font-bold text-text-strong">김주영 · Dr. Kim</div>
          <div className="text-[12px] text-muted">치주과 전문의</div>
          <div className="mt-3 font-mono text-[13px] text-text">02-1234-5678</div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href="tel:02-1234-5678"
            className="btn btn-primary !w-full !justify-center !py-3"
          >
            전화 걸기
          </a>
          <button
            onClick={onClose}
            className="btn !w-full !justify-center !py-3"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function ExplainBody({ pct, tone }: { pct: number | null; tone: Tone }) {
  if (pct == null) return (
    <>
      <p>아직 분석 결과가 도착하지 않았어요.</p>
      <p className="mt-2 text-muted">새로운 검사가 들어오면 이 자리에서 친절하게 설명해 드릴게요.</p>
    </>
  )
  if (pct >= 80) return (
    <>
      <p>
        음파 검사에서 <b className={toneText(tone)}>잇몸 안쪽 조직</b>이 평소보다 부드러워진 신호가
        강하게 잡혔어요. 염증이 진행됐을 가능성이 있어요.
      </p>
      <p className="mt-2 text-muted">
        비유하자면, 단단한 벽돌 사이에 살짝 무른 부분이 생긴 것 같은 신호예요. 통증이 없어도
        진행될 수 있으니 가까운 시일 내 전문 진료를 권해요.
      </p>
    </>
  )
  if (pct >= 50) return (
    <>
      <p>
        잇몸 안쪽에서 평소와 다른 신호가 일부 잡혔어요. 정상 범위를 약간 벗어난 정도이지만,
        한 번 직접 확인하시는 게 안전해요.
      </p>
      <p className="mt-2 text-muted">
        소리로 듣는 검사라 정확한 원인은 진료에서 확인이 필요해요. 평소처럼 양치·치실을 유지하고,
        가까운 시일 내 검진을 받아보세요.
      </p>
    </>
  )
  if (pct >= 20) return (
    <>
      <p>대부분 정상 범위지만, 약간의 변화가 보여요. 평소처럼 관리하면서 정기 검진 때 함께 확인하면 충분해요.</p>
      <p className="mt-2 text-muted">
        잇몸 건강은 작은 습관으로도 크게 달라져요 — 양치는 부드럽게, 치실은 매일 한 번 정도가 좋아요.
      </p>
    </>
  )
  return (
    <>
      <p>잇몸 안쪽까지 음파로 살펴봤고, 걱정할 만한 신호는 없었어요. 지금처럼 잘 관리해 주세요.</p>
      <p className="mt-2 text-muted">
        깊은 곳까지 살펴보는 검사라, 표면에서는 보이지 않는 부분도 함께 확인했어요. 다음 정기 검진까지
        그대로 유지하시면 됩니다.
      </p>
    </>
  )
}

interface ActionDef {
  title: string
  desc: string
  tone: Tone
  cta?: string
  icon: typeof AlertTriangle
}

function recommendedActions(pct: number | null): ActionDef[] {
  if (pct == null) return []
  if (pct >= 80) return [
    { title: '전문의 의뢰', desc: '치주과 전문 진료 — 정밀 검사 및 치료 계획을 권장합니다.', tone: 'bad', cta: '진료 예약하기', icon: AlertTriangle },
    { title: '임상 검진', desc: '해당 부위 프로빙 깊이·출혈 지수를 직접 확인이 필요해요.', tone: 'warn', icon: Search },
    { title: '재촬영 권고', desc: '4주 후 추적 스캔으로 진행 양상을 확인합니다.', tone: 'muted', icon: Clock },
  ]
  if (pct >= 50) return [
    { title: '임상 검토', desc: '대면 검진으로 시각적 소견을 교차 확인하시는 걸 권해요.', tone: 'warn', cta: '진료 예약하기', icon: Search },
    { title: '추적 관찰', desc: '8–12주 간격 재스캔을 권장합니다.', tone: 'muted', icon: Clock },
  ]
  if (pct >= 20) return [
    { title: '경과 관찰', desc: '정기 검진 주기를 유지하면서 함께 확인합니다.', tone: 'warn', icon: Clock },
  ]
  return [
    { title: '경과 관찰', desc: '정기 검진 주기 유지 — 추가 조치는 필요하지 않아요.', tone: 'good', icon: Heart },
  ]
}

function ActionCard({
  title, desc, tone, cta, icon: Icon, primary, onCta,
}: ActionDef & { primary?: boolean; onCta?: () => void }) {
  const ring = toneVar(tone)
  return (
    <div
      className="rounded-[16px] border p-4"
      style={{
        background: 'var(--color-panel)',
        borderColor: `color-mix(in srgb, ${ring} 28%, var(--color-line))`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${ring} 14%, transparent)` }}
        >
          <Icon className={'h-[18px] w-[18px] ' + toneText(tone)} strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-text-strong">{title}</div>
          <p className="mt-0.5 text-[12px] leading-[1.55] text-muted">{desc}</p>
        </div>
      </div>
      {cta && (
        <button
          onClick={onCta}
          disabled={!onCta}
          className={
            'mt-3 flex w-full items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[12.5px] font-bold transition disabled:opacity-50 ' +
            (primary ? 'btn-primary' : 'border border-line bg-panel-2 text-text hover:bg-elevated')
          }
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
          {cta}
        </button>
      )}
    </div>
  )
}

// ===========================================================================
// TAB 2 — 경과 (Progress)
// ===========================================================================

function ProgressTab({ patient, scans }: { patient: Patient; scans: Scan[] }) {
  // Build synthetic time series — use detection.severity for latest if available,
  // and scenario-tag-derived proxies for older scans (mirrors seed_db.py thresholds).
  const points = useMemo(() => {
    const arr = [...scans].reverse() // oldest first
    return arr.map((s, i) => {
      const isLatest = i === arr.length - 1
      const proxy = s.scenario_tag === 'healthy' ? 5 : s.scenario_tag === 'inf70' ? 62 : s.scenario_tag === 'inf80' ? 89 : 0
      const sev = isLatest && patient.latest_severity != null
        ? Math.round(patient.latest_severity * 100)
        : proxy
      return { id: s.id, date: s.scan_date, scenario: s.scenario_tag, sev }
    })
  }, [scans, patient.latest_severity])

  const curr = points[points.length - 1]
  const prev = points[points.length - 2]
  const delta = curr && prev != null ? curr.sev - prev.sev : null

  if (points.length === 0) return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-2">
        <Clock className="h-7 w-7 text-muted" strokeWidth={1.6} />
      </div>
      <div className="mt-4 text-[14px] font-bold text-text-strong">이번이 첫 검사예요</div>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">
        다음 검사를 받으시면 변화 추이를 여기서 보여드릴게요.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-3">
      <section className="rounded-[18px] border border-line bg-panel p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <div className="text-[13px] font-bold text-text-strong">잇몸 상태 변화</div>
            <div className="text-[11px] text-muted">총 {points.length}회 검사</div>
          </div>
          {delta != null && <DeltaBadge delta={delta} />}
        </div>
        <TrendChart points={points} />
      </section>

      {delta != null && <TrendSummary delta={delta} />}

      <section className="rounded-[18px] border border-line bg-panel">
        <div className="border-b border-line px-4 py-2.5">
          <div className="text-[12.5px] font-bold text-text-strong">검사 이력</div>
        </div>
        <div>
          {[...points].reverse().map((p, i) => (
            <ScanHistoryRow
              key={p.id}
              date={p.date}
              sev={p.sev}
              scenario={p.scenario}
              isLatest={i === 0}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="pill pill-muted">변화 없음</span>
  const worse = delta > 0
  return (
    <span className={'pill ' + (worse ? 'pill-bad' : 'pill-good')}>
      <span className={'status-dot ' + (worse ? 'bg-bad' : 'bg-good')} />
      {worse ? '+' : ''}{delta} 점
    </span>
  )
}

function TrendSummary({ delta }: { delta: number }) {
  if (delta > 5) return (
    <div
      className="rounded-[16px] border p-4"
      style={{
        background:   'color-mix(in srgb, var(--color-finding-progressed) 10%, var(--color-panel))',
        borderColor:  'color-mix(in srgb, var(--color-finding-progressed) 32%, var(--color-line))',
      }}
    >
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-bad" strokeWidth={2} />
        <div className="text-[13px] font-bold text-bad">지난 검사보다 진행됐어요</div>
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-muted">
        지난번보다 신호가 강해졌어요. 진료로 직접 확인하시는 걸 권해요.
      </p>
    </div>
  )
  if (delta < -5) return (
    <div
      className="rounded-[16px] border p-4"
      style={{
        background:   'color-mix(in srgb, var(--color-good) 10%, var(--color-panel))',
        borderColor:  'color-mix(in srgb, var(--color-good) 32%, var(--color-line))',
      }}
    >
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-good" strokeWidth={2} />
        <div className="text-[13px] font-bold text-good">상태가 좋아졌어요</div>
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-muted">
        관리가 잘되고 있어요. 지금처럼 유지해 주세요.
      </p>
    </div>
  )
  return (
    <div className="rounded-[16px] border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-accent" strokeWidth={2} />
        <div className="text-[13px] font-bold text-text-strong">안정적으로 유지되고 있어요</div>
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-muted">
        큰 변화 없이 잘 관리되고 있어요. 지금처럼 유지해 주세요.
      </p>
    </div>
  )
}

function TrendChart({
  points,
}: { points: { id: number; date: string; sev: number; scenario: ScenarioTag }[] }) {
  const W = 380, H = 160, PADX = 20, PADY = 24
  const innerW = W - PADX * 2, innerH = H - PADY * 2
  const xs = (i: number) =>
    points.length === 1 ? PADX + innerW / 2 : PADX + (i / (points.length - 1)) * innerW
  const ys = (v: number) => PADY + (1 - Math.min(100, Math.max(0, v)) / 100) * innerH

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.sev).toFixed(1)}`)
    .join(' ')
  const areaPath = points.length > 1
    ? `${path} L ${xs(points.length - 1).toFixed(1)} ${(PADY + innerH).toFixed(1)} L ${xs(0).toFixed(1)} ${(PADY + innerH).toFixed(1)} Z`
    : ''

  return (
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 50, 80].map((y) => (
          <line key={y} x1={PADX} x2={W - PADX} y1={ys(y)} y2={ys(y)}
            stroke="var(--color-line)" strokeDasharray="2 4" strokeWidth={1} />
        ))}
        <text x={W - PADX} y={ys(80) - 3} textAnchor="end" fontSize="9"
          fill="var(--color-faint)" fontFamily="var(--font-mono)">high 80</text>
        <text x={W - PADX} y={ys(20) - 3} textAnchor="end" fontSize="9"
          fill="var(--color-faint)" fontFamily="var(--font-mono)">ok 20</text>

        {areaPath && <path d={areaPath} fill="url(#trend-area)" />}
        {points.length > 1 && (
          <path d={path} fill="none" stroke="var(--color-accent)"
            strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => {
          const fv = friendlyVerdict(p.sev)
          const color = toneVar(fv.tone)
          const isLast = i === points.length - 1
          return (
            <g key={p.id}>
              <circle cx={xs(i)} cy={ys(p.sev)} r={isLast ? 5.5 : 4}
                fill={color} stroke="var(--color-panel)" strokeWidth={2} />
              {isLast && (
                <text x={xs(i)} y={ys(p.sev) - 10} textAnchor="middle" fontSize="10"
                  fontWeight={700} fill={color} fontFamily="var(--font-mono)">
                  {p.sev}
                </text>
              )}
            </g>
          )
        })}
        {points.length > 0 && (
          <>
            <text x={xs(0)} y={H - 4} textAnchor="start" fontSize="9"
              fill="var(--color-faint)" fontFamily="var(--font-mono)">
              {points[0].date?.slice(2, 10) ?? ''}
            </text>
            {points.length > 1 && (
              <text x={xs(points.length - 1)} y={H - 4} textAnchor="end" fontSize="9"
                fill="var(--color-faint)" fontFamily="var(--font-mono)">
                {points[points.length - 1].date?.slice(2, 10) ?? ''}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  )
}

function ScanHistoryRow({
  date, sev, scenario, isLatest,
}: { date: string; sev: number; scenario: ScenarioTag; isLatest: boolean }) {
  const fv = friendlyVerdict(sev)
  const meta = scenarioMeta(scenario)
  return (
    <div className="flex items-center justify-between border-b border-line-soft px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className={'status-dot ' + toneBg(fv.tone)} />
        <div className="leading-tight">
          <div className="text-[12.5px] font-medium text-text">
            {formatDate(date)}
            {isLatest && (
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-accent">최근</span>
            )}
          </div>
          <div className="text-[10.5px] text-muted">{meta.label}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={'num text-[13px] font-bold ' + toneText(fv.tone)}>{sev}</span>
        <span className="font-mono text-[9px] text-faint">점</span>
      </div>
    </div>
  )
}

// ===========================================================================
// TAB 3 — AI 도움말 (Ask)
// ===========================================================================

type ChatRole = 'user' | 'ai' | 'error'
interface ChatMsg { id: number; role: ChatRole; text: string }

const WELCOME: ChatMsg = {
  id: 0, role: 'ai',
  text: '안녕하세요. 검사 결과에 대해 궁금한 점을 편하게 물어보세요. 아래 예시 질문을 누르시거나 직접 입력하셔도 됩니다.',
}

const SUGGESTED = [
  '이 결과는 무슨 뜻이에요?',
  '병원에 다시 가야 하나요?',
  '어떻게 관리해야 해요?',
  '이 검사는 안전한가요?',
]

/** Build a compact patient case-context string (mirrors AIAssistantDock's pattern). */
function patientCaseContext(patient: Patient, scans: Scan[]): string {
  const pct = severityPct(patient.latest_severity)
  const verdict =
    pct == null ? '판정 보류'
    : pct < 20 ? 'NEGATIVE / 정상 소견'
    : pct < 50 ? 'EQUIVOCAL / 경계성'
    : pct < 80 ? 'SUSPICIOUS / 의심 소견'
    : 'PROBABLE LESION / 병변 가능성 높음'
  const latest = scans[0]
  const scn = latest
    ? (latest.scenario_tag === 'healthy' ? '정상'
      : latest.scenario_tag === 'inf70' ? '염증 70%'
      : '염증 80%')
    : '—'
  const age = patient.dob ? calcAge(patient.dob) : null
  const sexKo = patient.sex === 'M' ? '남' : patient.sex === 'F' ? '여' : '기타'
  return [
    `[케이스] ${patient.full_name}${age != null ? ` (${sexKo} ${age}세)` : ''}, MRN ${patient.mrn}.`,
    `30 kHz 탄성파 치은 스크리닝 — 최근 심각도 ${pct ?? '—'}% (${verdict}).`,
    latest ? `최근 스캔: ${latest.scan_date}, 시나리오 ${scn}.` : '스캔 기록 없음.',
    `총 스캔 ${patient.scan_count}회.`,
    patient.notes ? `메모: ${patient.notes}` : '',
  ].filter(Boolean).join(' ')
}

function AskTab({ patient, scans }: { patient: Patient; scans: Scan[] }) {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(1)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Track mount state so async send() callbacks don't setState after unmount.
  // CRITICAL: set to true in the effect body too — React 18 StrictMode runs
  // mount→cleanup→mount in dev, and without this re-set mountedRef.current
  // stays false after the cleanup, causing the "1번 질문 후 입력 막힘" bug
  // (the finally block's `if (mountedRef.current) setBusy(false)` never fires).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const userMsg: ChatMsg = { id: idRef.current++, role: 'user', text: trimmed }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setBusy(true)
    try {
      const context = patientCaseContext(patient, scans)
      const history: ChatMessage[] = messages
        .filter((m) => m.role !== 'error')
        .map((m) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }))
      const reply = await askClaude({
        context,
        mode: 'patient',
        history,
        question: trimmed,
      })
      if (!mountedRef.current) return
      setMessages((m) => [...m, { id: idRef.current++, role: 'ai', text: reply }])
    } catch (e: unknown) {
      if (!mountedRef.current) return
      const msg = e instanceof Error ? e.message : '응답을 가져오지 못했습니다.'
      setMessages((m) => [
        ...m,
        { id: idRef.current++, role: 'error', text: msg },
      ])
    } finally {
      // ALWAYS clear busy — even on cancellation or sync throw — so the input
      // never gets stuck in the disabled state after a failed send.
      if (mountedRef.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-58px-72px)] flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3 pt-4">
        {messages.map((m) => (
          <ChatBubble key={m.id} msg={m} patientInitial={patient.full_name[0]} />
        ))}
        {busy && <ThinkingBubble />}

        {messages.length === 1 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">예시 질문</div>
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => { void send(q) }}
                disabled={busy}
                className="flex items-center justify-between rounded-[12px] border border-line bg-panel-2 px-3.5 py-2.5 text-left text-[12.5px] text-text transition hover:border-accent-line hover:bg-elevated disabled:opacity-50"
              >
                <span>{q}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 px-1 text-center font-mono text-[10px] leading-[1.6] text-faint">
          AI 응답은 참고용입니다.
        </div>
      </div>

      <div className="border-t border-line bg-panel px-3 py-2">
        <form
          onSubmit={(e) => { e.preventDefault(); void send(input) }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={busy ? '응답을 기다리는 중…' : '궁금한 점을 입력하세요…'}
            className="flex-1 rounded-[12px] border border-line bg-panel-2 px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-accent-line focus:bg-elevated disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="btn-primary btn !rounded-[12px] !px-3 !py-2.5 disabled:opacity-50"
            aria-label="보내기"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function ChatBubble({ msg, patientInitial }: { msg: ChatMsg; patientInitial: string }) {
  if (msg.role === 'user') return (
    <div className="mb-2.5 flex items-end justify-end gap-2">
      <div className="max-w-[78%] rounded-[16px] rounded-br-[6px] bg-accent px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-white shadow-[var(--shadow-panel)]">
        {msg.text}
      </div>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[11px] font-bold text-muted">
        {patientInitial}
      </div>
    </div>
  )
  if (msg.role === 'error') return (
    <div className="mb-2.5 flex items-end gap-2">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bad text-white"
      >
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div
        className="max-w-[78%] rounded-[16px] rounded-bl-[6px] border px-3.5 py-2.5 text-[12.5px] leading-[1.6] text-bad"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-bad) 50%, var(--color-line))',
          background: 'color-mix(in srgb, var(--color-bad) 8%, var(--color-panel-2))',
        }}
      >
        {msg.text}
      </div>
    </div>
  )
  return (
    <div className="mb-2.5 flex items-end gap-2">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-roi), var(--color-accent))' }}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="max-w-[78%] rounded-[16px] rounded-bl-[6px] border border-line bg-panel-2 px-3.5 py-2.5 text-[12.5px] leading-[1.6] text-text">
        <BubbleText text={msg.text} />
      </div>
    </div>
  )
}

/** Render AI text with simple inline bold (**...**) parsing — keeps it lightweight. */
function BubbleText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} className="h-1" />
        const parts = ln.split(/(\*\*[^*]+\*\*)/g)
        return (
          <div key={i} className="mb-1 last:mb-0">
            {parts.map((s, j) =>
              s.startsWith('**') && s.endsWith('**')
                ? <strong key={j} className="font-bold text-text-strong">{s.slice(2, -2)}</strong>
                : <span key={j}>{s}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

function ThinkingBubble() {
  return (
    <div className="mb-2.5 flex items-end gap-2">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-roi), var(--color-accent))' }}
      >
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="flex items-center gap-1 rounded-[16px] rounded-bl-[6px] border border-line bg-panel-2 px-4 py-3">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-muted"
      style={{ animation: 'fade-in 0.9s ease-in-out infinite alternate', animationDelay: `${delay}ms` }}
    />
  )
}
