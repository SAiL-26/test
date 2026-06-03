import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileDown, PenLine } from 'lucide-react'
import type { ScanDetail } from '../../api/types'

/**
 * ChartSheet — SOAP clinical note (Subjective / Objective / Assessment / Plan).
 * Per design handoff console/dock.jsx → ChartSheet.
 * Editable in-place via contentEditable. PDF/save buttons stub; Phase 12 wires PDF.
 */

interface Props {
  scan: ScanDetail
}

export default function ChartSheet({ scan }: Props) {
  const det = scan.detection
  const score = det?.severity_score ?? null
  const pct = score == null ? null : Math.round(score * 100)
  const verdict = pct == null
    ? { label: '—', tone: 'muted' as const }
    : pct < 20 ? { label: 'NEGATIVE', tone: 'good' as const }
    : pct < 50 ? { label: 'EQUIVOCAL', tone: 'warn' as const }
    : pct < 80 ? { label: 'SUSPICIOUS', tone: 'warn' as const }
    : { label: 'PROBABLE LESION', tone: 'bad' as const }

  const initial = useMemo(() => buildChart(scan, pct), [scan.id, pct])
  const [s, setS] = useState(initial.s)
  const [o, setO] = useState(initial.o)
  const [a, setA] = useState(initial.a)
  const [p, setP] = useState(initial.p)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* letterhead */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel-2/55 px-3.5 py-3">
        <div>
          <div className="text-[13px] font-bold text-text-strong">
            임상 기록지
            <span className="ml-1.5 text-[10px] font-medium text-faint">· Clinical Note</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            {scan.patient_name ?? `환자 ${scan.patient_id}`} · scan-{String(scan.id).padStart(4, '0')} · {scan.scan_date}
          </div>
        </div>
        <span className={`pill pill-${verdict.tone}`}>
          <span className="status-dot" style={{ background: 'currentColor' }} />
          {verdict.label}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3.5">
        <Field tag="S" label="주소증 (Subjective)" value={s} onInput={setS} />
        <Field tag="O" label="객관적 소견 (Objective)" value={o} onInput={setO} rows={2} />
        <Field tag="A" label="평가 · 진단 (Assessment)" value={a} onInput={setA} rows={2} />
        <Field tag="P" label="치료 계획 (Plan)" value={p} onInput={setP} rows={3} />

        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-faint">
            김주영 · Dr. Kim · 치주과 · {scan.scan_date}
          </span>
          <div className="flex gap-2">
            <Link
              to={`/scans/${scan.id}/report`}
              className="btn"
              title="A4 리포트 미리보기 (한글 PDF 저장)"
            >
              <FileDown className="h-3 w-3" />
              PDF
            </Link>
            <button
              className="btn btn-primary"
              title="서명 후 저장 (백엔드 연결 예정)"
            >
              <PenLine className="h-3 w-3" />
              서명 · 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  tag, label, value, onInput, rows,
}: { tag: string; label: string; value: string; onInput: (v: string) => void; rows?: number }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-accent-soft font-mono text-[10px] font-bold text-accent-strong">
          {tag}
        </span>
        <span className="text-[11px] font-bold tracking-[0.02em] text-text">{label}</span>
      </div>
      <div
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onInput((e.target as HTMLDivElement).innerText)}
        className="whitespace-pre-wrap rounded-lg border border-line bg-panel-2/55 px-2.5 py-2 text-[12px] leading-[1.6] text-text outline-none focus:border-accent-line"
        style={{ minHeight: rows ? rows * 18 : 36 }}
      >
        {value}
      </div>
    </div>
  )
}

function buildChart(scan: ScanDetail, pct: number | null) {
  const det = scan.detection
  const healthy = pct == null || pct < 20
  const verdict = pct == null
    ? '판정 보류'
    : pct < 20 ? '정상'
    : pct < 50 ? '경계성'
    : pct < 80 ? '의심 소견'
    : '병변 가능성 높음'
  const loc = det
    ? `(${det.estimate_x_mm.toFixed(1)}, ${det.estimate_y_mm.toFixed(1)}, ${det.estimate_z_mm.toFixed(1)})mm`
    : '없음'
  const scn = scan.scenario_tag === 'healthy' ? '정상' : scan.scenario_tag === 'inf70' ? '염증 70%' : '염증 80%'

  return {
    s: healthy
      ? '정기 검진 목적 내원. 특이 자각 증상 없음.'
      : `${scan.notes ?? '환자 호소 — 해당 부위 불편감.'}`,
    o: healthy
      ? `30 kHz 탄성파 스크리닝: 병변 심각도 ${pct ?? '—'}% (${verdict}). 음속 이상 미검출. 치은 출혈지수 정상 범위.`
      : `30 kHz 탄성파 스크리닝: 병변 심각도 ${pct}% (${verdict}). 시나리오 ${scn}. 추정 위치 ${loc}, 후보 수신기 #${det?.candidate_recv_idx ?? '—'} 최대 잔차. 협측 치은 비후 의심.`,
    a: healthy
      ? '특이 소견 없음. 건강한 치주 상태.'
      : `진행성 치주 병변 의심. 염증성 음속 이상(Vs ~50% 감소) 패턴 — 깊은 치주낭 또는 골 흡수 동반 가능성.`,
    p: pct == null || pct < 20
      ? '경과 관찰 — 정기 검진 주기 유지 · 추가 조치 불필요.'
      : pct < 50
      ? '임상 검토 — 대면 검진으로 시각적 소견 교차 확인\n추적 관찰 — 8–12주 간격 재스캔 권고'
      : pct < 80
      ? '임상 검토 — 프로빙 깊이·출혈 지수 확인\n추적 관찰 — 4주 후 재스캔 권고'
      : '전문의 의뢰 — 치주과 의뢰 + 정밀 검사 및 치료 계획 수립\n임상 검진 — 프로빙 깊이·출혈 지수 확인\n재촬영 권고 — 4주 후 추적 스캔',
  }
}
