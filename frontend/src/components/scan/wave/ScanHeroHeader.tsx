import type { Detection, ScenarioTag } from '../../../api/types'

interface Props {
  patientName: string | null
  patientId: number
  scanId: number
  scanDate: string
  scenarioTag: ScenarioTag
  detection: Detection | null | undefined
}

const SCENARIO_LABEL: Record<ScenarioTag, string> = {
  healthy: '정상',
  inf70:   '염증 70%',
  inf80:   '염증 80%',
}

// Reuters/IIB-style hero header. Big patient name and severity number,
// minimal chrome, a small stylized arch illustration on the right that
// hints at the dental nature without pretending to be diagnostic.
export default function ScanHeroHeader({
  patientName, patientId, scanId, scanDate, scenarioTag, detection,
}: Props) {
  const score = detection?.severity_score
  const pct = score != null ? Math.round(score * 100) : null
  const verdict = pct == null
    ? '—'
    : pct < 20  ? 'NEGATIVE'
    : pct < 50  ? 'EQUIVOCAL'
    : pct < 80  ? 'SUSPICIOUS'
    : 'PROBABLE LESION'

  const tone = pct == null ? 'muted'
    : pct < 20 ? 'good'
    : pct < 50 ? 'warn'
    : pct < 80 ? 'warn'
    : 'bad'

  const toneColor = tone === 'good' ? 'var(--color-good)'
    : tone === 'warn' ? 'var(--color-warn)'
    : tone === 'bad'  ? 'var(--color-bad)'
    : 'var(--color-muted)'

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-line"
      style={{ background: 'linear-gradient(135deg, var(--color-panel) 0%, var(--color-panel-2) 100%)' }}
    >
      {/* faint background arch motif on the right */}
      <svg
        viewBox="0 0 320 180"
        className="absolute right-0 top-0 h-full opacity-[0.12]"
        style={{ width: 'min(56%, 480px)' }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="arch-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="1" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        <g style={{ color: toneColor }}>
          <path
            d="M 30 150 Q 160 -10 290 150"
            fill="none"
            stroke="url(#arch-fade)"
            strokeWidth="1.2"
          />
          <path
            d="M 56 158 Q 160 18 264 158"
            fill="none"
            stroke="url(#arch-fade)"
            strokeWidth="0.8"
          />
          {/* 16 stylized teeth */}
          {Array.from({ length: 16 }).map((_, i) => {
            const t = (i + 0.5) / 16
            const cx = 30 + t * 260
            const arcDip = 150 - Math.sin(t * Math.PI) * 158
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={arcDip}
                rx={i < 3 || i > 12 ? 6.5 : 5}
                ry={i < 3 || i > 12 ? 7.5 : 6}
                fill="currentColor"
                opacity={0.55}
              />
            )
          })}
        </g>
      </svg>

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6 px-6 py-5">
        {/* LEFT — patient & meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <span>pt-{patientId.toString().padStart(4, '0')}</span>
            <span className="h-2.5 w-px bg-line" />
            <span>sc-{scanId.toString().padStart(5, '0')}</span>
            <span className="h-2.5 w-px bg-line" />
            <span>{scanDate}</span>
            <span className="h-2.5 w-px bg-line" />
            <span>{SCENARIO_LABEL[scenarioTag]}</span>
          </div>
          <h1 className="mt-1.5 truncate text-[44px] font-semibold leading-tight tracking-tight text-text-strong">
            {patientName ?? `환자 #${patientId}`}
          </h1>
          {detection && (
            <div className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">
              30 kHz의 떨림이 잇몸 안쪽에서 무엇을 보고 왔는지를, 우리는 이 페이지에 옮겨 적었다.
            </div>
          )}
        </div>

        {/* RIGHT — severity number */}
        {pct != null && (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              lesion severity
            </div>
            <div
              className="mt-0.5 font-mono text-[88px] font-semibold leading-none tracking-tight"
              style={{ color: toneColor }}
            >
              {pct}
              <span className="ml-1 align-baseline text-[24px] font-normal text-muted">%</span>
            </div>
            <div
              className="mt-1 font-mono text-[10.5px] font-semibold tracking-[0.16em]"
              style={{ color: toneColor }}
            >
              {verdict}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
