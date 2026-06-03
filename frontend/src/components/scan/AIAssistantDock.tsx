import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, RotateCw, AlertCircle } from 'lucide-react'
import type { ScanDetail } from '../../api/types'
import { askClaude, type ChatMessage } from '../../api/ai'

/**
 * AIAssistantDock — Claude case-context dock.
 * Mirrors design handoff console/dock.jsx → AIAssistant.
 * Phase 11 wires the real Anthropic Claude API via /api/ai/chat backend proxy.
 * Doctor and patient personas both supported.
 */

interface Props {
  scan: ScanDetail
  mode?: 'doctor' | 'patient'
}

const QUICK_DOCTOR = [
  '이 병변은 무엇인가요?',
  '권장 치료 방침은?',
  '감별 진단 목록',
  '환자 설명용 쉬운 요약',
]
const QUICK_PATIENT = [
  '내 검사 결과를 쉽게 설명해줘',
  '이거 위험한 건가요?',
  '집에서 뭘 조심해야 하나요?',
  '다음에 뭘 해야 하나요?',
]

interface Msg { role: 'user' | 'ai' | 'error'; text: string }

export default function AIAssistantDock({ scan, mode = 'doctor' }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastQ, setLastQ] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)

  const quick = mode === 'patient' ? QUICK_PATIENT : QUICK_DOCTOR

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [msgs, busy])

  async function ask(q: string) {
    if (!q.trim() || busy) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setBusy(true)
    setLastQ(q)
    try {
      const context = caseContext(scan)
      const history: ChatMessage[] = msgs
        .filter((m) => m.role !== 'error')
        .map((m) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }))
      const reply = await askClaude({
        context,
        mode,
        history,
        question: q,
      })
      setMsgs((m) => [...m, { role: 'ai', text: reply }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      setMsgs((m) => [...m, { role: 'error', text: msg }])
    } finally {
      setBusy(false)
    }
  }

  function retry() {
    if (!lastQ || busy) return
    // Drop the most recent error bubble then re-ask
    setMsgs((m) => m.filter((x, i) => !(x.role === 'error' && i === m.length - 1)))
    ask(lastQ)
  }

  const patientPct = scan.detection ? Math.round(scan.detection.severity_score * 100) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-3">
        <div
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px]"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-finding-progressed))' }}
        >
          <Sparkles className="h-[15px] w-[15px] text-white" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-text-strong">AI 임상 어시스턴트</div>
          <div className="text-[9.5px] text-faint">Claude · 케이스 컨텍스트 자동 연동</div>
        </div>
        <span className="flex items-center gap-1.5 text-[9.5px] text-good">
          <span className="status-dot" style={{ background: 'var(--color-good)' }} />
          online
        </span>
      </div>

      {/* messages */}
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-auto p-3.5 flex flex-col gap-2.5"
      >
        {msgs.length === 0 && (
          <div className="m-auto text-center text-faint">
            <div className="px-2 text-[12px] leading-[1.6] text-muted">
              현재 케이스
              <b className="mx-1 text-text">
                {scan.patient_name ?? `환자 ${scan.patient_id}`}
                {patientPct != null && <span> · {patientPct}%</span>}
              </b>
              를 분석해 드립니다.
              <br />
              아래 질문을 누르거나 직접 물어보세요.
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          const isLastError = m.role === 'error' && i === msgs.length - 1
          return (
            <div
              key={i}
              className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {m.role === 'error' ? (
                <div className="flex max-w-[92%] items-start gap-2 rounded-[12px] border border-bad/40 bg-bad/8 px-3 py-2 text-[12px] leading-[1.6] text-bad">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">AI 응답 실패</div>
                    <div className="mt-0.5 text-[11.5px] text-text/85">{m.text}</div>
                    {isLastError && lastQ && (
                      <button
                        onClick={retry}
                        className="mt-2 inline-flex items-center gap-1 rounded-[6px] border border-bad/40 bg-panel px-2 py-1 text-[11px] font-semibold text-bad hover:bg-bad/10"
                      >
                        <RotateCw className="h-3 w-3" />
                        다시 시도
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    'max-w-[86%] rounded-[12px] px-3 py-2 text-[12px] leading-[1.6] ' +
                    (m.role === 'user'
                      ? 'bg-accent text-white rounded-br-[3px]'
                      : 'border border-divider bg-panel-2/80 text-text rounded-bl-[3px]')
                  }
                >
                  {m.role === 'ai' ? <Rich text={m.text} /> : m.text}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className="status-dot animate-pulse"
              style={{ background: 'var(--color-accent)', width: 7, height: 7 }}
            />
            분석 중…
          </div>
        )}
      </div>

      {/* quick prompts + input */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={busy}
              className="chip chip-active disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(input) }}
            placeholder="병변·치료에 대해 물어보세요…"
            className="flex-1 rounded-[9px] border border-line bg-panel-2/55 px-3 py-2 text-[12px] text-text outline-none focus:border-accent-line"
          />
          <button
            onClick={() => ask(input)}
            disabled={busy || !input.trim()}
            className={
              'flex w-10 shrink-0 items-center justify-center rounded-[9px] border-0 cursor-pointer transition ' +
              (input.trim() && !busy
                ? 'bg-accent text-white'
                : 'bg-panel-2 text-faint cursor-not-allowed')
            }
          >
            <Send className="h-[15px] w-[15px]" strokeWidth={1.8} />
          </button>
        </div>
        <div className="mt-1.5 text-center text-[9px] text-faint">
          AI 응답은 참고용입니다
        </div>
      </div>
    </div>
  )
}

/** Build case context string for Claude prompt. Mirrors viz/data.js caseContext(). */
function caseContext(scan: ScanDetail): string {
  const det = scan.detection
  const pct = det ? Math.round(det.severity_score * 100) : null
  const verdict =
    pct == null ? '판정 보류'
    : pct < 20 ? 'NEGATIVE / 정상 소견'
    : pct < 50 ? 'EQUIVOCAL / 경계성'
    : pct < 80 ? 'SUSPICIOUS / 의심 소견'
    : 'PROBABLE LESION / 병변 가능성 높음'
  const loc = det
    ? `x${det.estimate_x_mm.toFixed(1)} y${det.estimate_y_mm.toFixed(1)} z${det.estimate_z_mm.toFixed(1)}mm`
    : '없음'
  const scn = scan.scenario_tag === 'healthy' ? '정상' : scan.scenario_tag === 'inf70' ? '염증 70%' : '염증 80%'

  return [
    `[케이스] ${scan.patient_name ?? '환자 ' + scan.patient_id}, scan-${scan.id}.`,
    `30 kHz 탄성파 치은 스크리닝 결과 — 병변 심각도 ${pct ?? '—'}% (${verdict}).`,
    `시나리오: ${scn}. 추정 위치: 좌표 ${loc}.`,
    det
      ? `MCMC 진단: 후보 수신기 #${det.candidate_recv_idx}, 잔차 ${det.candidate_residual.toExponential(2)}, 모델 ${det.model_version}.`
      : '',
  ].filter(Boolean).join(' ')
}

/** Minimal markdown-ish renderer for AI replies. */
function Rich({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((ln, i) => {
        if (/^\s*---+\s*$/.test(ln)) return <hr key={i} className="my-1.5 border-divider" />
        const h = ln.match(/^(#{1,4})\s+(.*)$/)
        if (h) {
          const lvl = h[1].length
          return (
            <div
              key={i}
              className={'font-bold tracking-[-0.01em] text-text-strong ' + (lvl <= 1 ? 'mt-2 text-[13.5px]' : 'mt-1.5 text-[12.5px]')}
            >
              {h[2]}
            </div>
          )
        }
        const isBullet = /^\s*[-•*]\s+/.test(ln)
        const isNum = /^\s*\d+[.)]\s+/.test(ln)
        const numMatch = ln.match(/^\s*(\d+)/)
        const content = ln.replace(/^\s*[-•*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '')
        if (!ln.trim()) return <div key={i} className="h-1" />
        return (
          <div key={i} className="mb-1 flex gap-1.5 leading-[1.6]">
            {(isBullet || isNum) && (
              <span className="shrink-0 text-accent">{isNum ? `${numMatch?.[1] ?? ''}.` : '·'}</span>
            )}
            <span>{renderInline(content)}</span>
          </div>
        )
      })}
    </>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((s, j) =>
    s.startsWith('**') && s.endsWith('**')
      ? <strong key={j} className="font-bold text-text-strong">{s.slice(2, -2)}</strong>
      : <span key={j}>{s}</span>
  )
}
