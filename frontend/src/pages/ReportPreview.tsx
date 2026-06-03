import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ChevronLeft, FileDown } from 'lucide-react'
import { fetchScan } from '../api/endpoints'
import { generateClinicalReport } from '../lib/reportPdf'
import { applyTheme } from '../components/ThemeToggle'
import { setManualThemeFlag } from '../lib/useRouteTheme'
import type { ScanDetail } from '../api/types'

/**
 * ReportPreview — A4-sized clinical report (Phase 12).
 *
 * Renders the clinical letter as HTML in the browser. The Korean Noto Sans KR
 * loaded for the whole app means `window.print()` produces a real PDF (Save as
 * PDF in the print dialog) with proper Korean glyphs — no font embedding needed
 * versus the legacy jsPDF path. The English jsPDF fallback is kept for
 * doctors who want a one-click direct download.
 *
 * Mirrors design handoff "임상 리포트 - PDF 레이아웃.html".
 * Route: /scans/:id/report (light, no Layout chrome).
 */
export default function ReportPreview() {
  const { id } = useParams<{ id: string }>()
  const sid = Number(id)
  const nav = useNavigate()

  useEffect(() => {
    setManualThemeFlag(false)
    applyTheme('light')
  }, [])

  const scanQ = useQuery({
    queryKey: ['scan', sid],
    queryFn: () => fetchScan(sid),
    enabled: Number.isFinite(sid),
  })

  if (scanQ.isLoading) {
    return <div className="flex h-screen items-center justify-center text-muted">리포트 로딩 중…</div>
  }
  if (scanQ.error || !scanQ.data) {
    return <div className="flex h-screen items-center justify-center text-bad">스캔을 불러올 수 없습니다.</div>
  }

  const scan = scanQ.data

  return (
    <div className="min-h-screen w-full bg-bg py-8">
      {/* Floating toolbar — not printed */}
      <div className="noprint fixed left-4 top-4 z-10 flex flex-col gap-2">
        <button onClick={() => nav(`/scans/${scan.id}`)} className="btn">
          <ChevronLeft className="h-3 w-3" />
          콘솔로
        </button>
      </div>
      <div className="noprint fixed right-4 top-4 z-10 flex flex-col gap-2">
        <button onClick={() => window.print()} className="btn btn-primary">
          <Printer className="h-3 w-3" />
          인쇄 · PDF 저장
        </button>
        <button
          onClick={() => generateClinicalReport({ scan, trace: undefined, caseLabel: scan.scenario_tag })}
          className="btn"
          title="영문 한 페이지 PDF (한글 미지원)"
        >
          <FileDown className="h-3 w-3" />
          영문 PDF
        </button>
      </div>

      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff; }
          .a4-page { width: auto; min-height: auto; margin: 0; box-shadow: none; padding: 0; }
          .noprint { display: none !important; }
        }
      `}</style>

      <ReportPage scan={scan} />
    </div>
  )
}

function ReportPage({ scan }: { scan: ScanDetail }) {
  const det = scan.detection
  const score = det?.severity_score ?? null
  const pct = score == null ? null : Math.round(score * 100)
  const verdict = pct == null
    ? { label: '—', ko: '판정 보류', tone: 'muted' as const }
    : pct < 20 ? { label: 'NEGATIVE', ko: '정상 소견', tone: 'good' as const }
    : pct < 50 ? { label: 'EQUIVOCAL', ko: '경계성', tone: 'warn' as const }
    : pct < 80 ? { label: 'SUSPICIOUS', ko: '의심 소견', tone: 'warn' as const }
    : { label: 'PROBABLE LESION', ko: '병변 가능성 높음', tone: 'bad' as const }
  const scn = scan.scenario_tag === 'healthy' ? '정상' : scan.scenario_tag === 'inf70' ? '염증 70%' : '염증 80%'
  const toneColor =
    verdict.tone === 'good' ? '#1E9A66' :
    verdict.tone === 'warn' ? '#C9791A' :
    verdict.tone === 'bad' ? '#D6483E' :
    '#626C73'
  const reportId = `WAV-${String(scan.id).padStart(5, '0')}-${new Date().getFullYear()}`

  return (
    <div
      className="a4-page mx-auto bg-white"
      style={{
        width: 794, minHeight: 1123, padding: '52px 56px 40px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        fontFamily: "Inter, 'Noto Sans KR', sans-serif",
        color: '#1b232a',
      }}
    >
      {/* ===== Letterhead ===== */}
      <header
        className="flex items-end justify-between border-b border-[#e6e0d4] pb-4"
        style={{ borderBottomWidth: 2 }}
      >
        <div>
          <div
            className="flex items-center gap-2"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.2em', color: '#0E8E86', textTransform: 'uppercase' }}
          >
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: 'linear-gradient(135deg, #0E8E86, #DC3A77)' }}
            />
            Dental Wave Viz
          </div>
          <h1
            className="mt-2"
            style={{ fontFamily: 'Newsreader, serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: '#161E24' }}
          >
            임상 스크리닝 리포트
          </h1>
          <div className="mt-1 text-[12px] text-[#586069]">
            30 kHz 탄성파 전파 · 베이지안 역산
          </div>
        </div>
        <div className="text-right" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#9aa0a2' }}>
          <div>Report {reportId}</div>
          <div className="mt-0.5">{new Date().toISOString().slice(0, 10)} KST</div>
        </div>
      </header>

      {/* ===== Patient block ===== */}
      <section className="mt-6 grid grid-cols-[1.2fr_1fr] gap-6">
        <div>
          <SubLabel>환자 정보</SubLabel>
          <Row label="이름"        value={scan.patient_name ?? `pt-${scan.patient_id}`} />
          <Row label="환자 번호"   value={`pt-${String(scan.patient_id).padStart(4, '0')}`} mono />
          <Row label="스캔 번호"   value={`scan-${String(scan.id).padStart(4, '0')}`} mono />
          <Row label="스캔 일자"   value={scan.scan_date} mono />
          <Row label="시나리오"    value={scn} />
        </div>
        <div>
          <SubLabel>판정 요약</SubLabel>
          <VerdictDial pct={pct} color={toneColor} label={verdict.label} ko={verdict.ko} />
        </div>
      </section>

      {/* ===== Inversion / KPIs ===== */}
      <section className="mt-7">
        <SubLabel>검사 지표</SubLabel>
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="병변 심각도" value={pct == null ? '—' : String(pct)} unit="%" />
          <Kpi label="후보 수신기"  value={det ? `#${det.candidate_recv_idx}` : '—'} />
          <Kpi label="잔차 (RMS)"  value={det ? det.candidate_residual.toExponential(2) : '—'} />
          <Kpi label="모델"        value={det?.model_version ?? '—'} small />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Kpi label="추정 X"      value={det ? det.estimate_x_mm.toFixed(2) : '—'} unit="mm" />
          <Kpi label="추정 Y"      value={det ? det.estimate_y_mm.toFixed(2) : '—'} unit="mm" />
          <Kpi label="추정 Z"      value={det ? det.estimate_z_mm.toFixed(2) : '—'} unit="mm" />
        </div>
      </section>

      {/* ===== Assessment ===== */}
      <section className="mt-7">
        <SubLabel>평가 · 권고</SubLabel>
        <div className="rounded-lg border border-[#e6e0d4] p-4">
          <div className="text-[12px] leading-[1.7]" style={{ color: '#1b232a' }}>
            {pct == null && (
              <>아직 분석 결과가 산출되지 않았습니다. 파이프라인 재실행 후 다시 확인해 주세요.</>
            )}
            {pct != null && pct < 20 && (
              <>30 kHz 탄성파 스크리닝 결과 음속 이상 미검출. 치은 조직 정상 범위. 정기 검진 주기 유지를 권장합니다.</>
            )}
            {pct != null && pct >= 20 && pct < 50 && (
              <>경계성 음속 이상 가능성이 확인되었습니다. 8–12주 간격 재스캔 권고. 임상 시진·치주 평가로 교차 확인하십시오.</>
            )}
            {pct != null && pct >= 50 && pct < 80 && (
              <>의심 소견. 4주 내 추적 스캔 권고. 프로빙 깊이·출혈 지수 확인 및 보조 영상 검사를 고려하십시오.</>
            )}
            {pct != null && pct >= 80 && (
              <>병변 가능성이 높은 음속 이상 패턴이 검출되었습니다. 치주과 전문의 의뢰 및 정밀 검사 · 치료 계획 수립을 권장합니다.</>
            )}
          </div>
        </div>
      </section>

      {/* ===== Signature ===== */}
      <section className="mt-8 flex items-end justify-between border-t border-[#e6e0d4] pt-4">
        <div>
          <SubLabel>판독 의사</SubLabel>
          <div className="mt-2 text-[14px] font-semibold">김주영 · Dr. Kim</div>
          <div className="text-[11px] text-[#586069]">치주과 · doctor@demo.com</div>
        </div>
        <div className="text-right">
          <div className="mt-2 text-[10px] text-[#9aa0a2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            서명 _____________________
          </div>
          <div className="text-[10px] text-[#9aa0a2]">발행일 {new Date().toISOString().slice(0, 10)}</div>
        </div>
      </section>

      {/* ===== Disclaimer ===== */}
      <footer className="mt-6 rounded border border-[#e6e0d4] bg-[#fbf8f0] p-3 text-[10px] leading-[1.6] text-[#586069]">
        임상 최종 판단은 면허 의사의 직접 검진에 따라야 합니다.
      </footer>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[#0E8E86]"
      style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
    >
      {children}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f0ebe0] py-1.5">
      <span className="text-[11.5px] text-[#586069]">{label}</span>
      <span
        className="text-[12px] font-semibold text-[#1b232a]"
        style={mono ? { fontFamily: 'JetBrains Mono, monospace' } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

function Kpi({ label, value, unit, small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className="rounded border border-[#e6e0d4] bg-[#fbf8f0] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.08em] text-[#9aa0a2]">{label}</div>
      <div
        className={small ? 'mt-0.5 text-[11px]' : 'mt-0.5 text-[18px]'}
        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#1b232a' }}
      >
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-[#586069]">{unit}</span>}
      </div>
    </div>
  )
}

function VerdictDial({ pct, color, label, ko }: { pct: number | null; color: string; label: string; ko: string }) {
  const size = 130
  const r = (size - 16) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const offset = circ * (1 - v / 100)
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} stroke="#f0ebe0" strokeWidth={10} fill="none" />
        <circle
          cx={cx} cy={cy} r={r}
          stroke={color} strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy + 6} textAnchor="middle" fontFamily="Newsreader, serif" fontSize={36} fontWeight={600} fill={color}>
          {pct ?? '—'}
        </text>
        {pct != null && (
          <text x={cx} y={cy + 24} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#9aa0a2">%</text>
        )}
      </svg>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color, fontWeight: 700 }}>{label}</div>
        <div className="mt-1 text-[16px] font-semibold text-[#161E24]">{ko}</div>
      </div>
    </div>
  )
}
