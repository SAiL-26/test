import { useEffect, useMemo, useRef } from 'react'
import { Activity } from 'lucide-react'
import type { SeismogramGather } from '../../../api/wave'
import { SEISMIC_COLORSCALE } from '../../../lib/wavePalette'
import { RECEIVER_COORDS } from '../../../lib/receiverCoords'

interface Props {
  data: SeismogramGather | undefined
  lineTimeUs?: number
}

// Layout geometry. The Plotly viewport is roughly square so we frame
// everything in normalized [0, 1] space and let CSS handle the actual pixels.
const VIEW = 560
const CX = VIEW / 2
const CY = VIEW / 2 + 24      // shift center a touch down so the arch arc reads
const ARCH_INNER = 78          // inner ring where the arch sits
const ARCH_OUTER = 232         // outer ring for furthest receiver ray tip
const TIME_INNER = ARCH_OUTER  // seismogram radial starts at outer ring
const TIME_OUTER = 258         // and ends near the viewport edge

// Compute angle (radians, math convention: 0 = right, π/2 = top) for each
// receiver based on its physical (x, y) in the Vs model. The arch is roughly
// symmetric around x ≈ 245 with a slight downward bulge. Mapping is from
// linear index 0..99 (which already follows arch order) to angle, but we
// nudge each receiver by its actual model-x offset so the resulting curve
// follows the real anatomy. Result: receiver 0 → ~π (left), receiver 50 →
// π/2 (top), receiver 99 → 0 (right).
function arrangeReceivers() {
  // Use receiver y (long axis) to span angle; rough arch sweep covers π
  // (180°), so map y from [min, max] → [π, 0].
  const ys = RECEIVER_COORDS.map(([y]) => y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeY = Math.max(1, maxY - minY)
  // Use x deviation from arch midline to nudge each receiver radially —
  // farther-out receivers sit slightly closer to the rim, mimicking how the
  // teeth curve on the buccal side. Most x ≈ 247 ± 10.
  const xs = RECEIVER_COORDS.map(([, x]) => x)
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const r0 = (ARCH_INNER + TIME_INNER) / 2
  return RECEIVER_COORDS.map(([y, x], i) => {
    const t = (y - minY) / rangeY
    const theta = Math.PI * (1 - t)               // π → 0 from left to right
    const xDev = x - meanX                        // -10..+10 typical
    const rOffset = xDev * 0.5                    // gentle radial nudge
    return {
      idx: i,
      theta,
      r: r0 + rOffset,
      x: CX + Math.cos(theta) * (r0 + rOffset),
      y: CY - Math.sin(theta) * (r0 + rOffset),
    }
  })
  // Note: the leading 'n' above isn't used in the return — keep it explicit
  // for clarity of intent.
}

// Convert -1..1 amplitude to an RGB color along the SEISMIC scale. The
// colorscale is sparse stops; we interpolate between the closest two.
function amplitudeToRgb(v: number): [number, number, number] {
  const t = (Math.max(-1, Math.min(1, v)) + 1) / 2  // → [0, 1]
  const stops = SEISMIC_COLORSCALE
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      const c0 = hexToRgb(stops[i][1])
      const c1 = hexToRgb(stops[i + 1][1])
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      ]
    }
  }
  return hexToRgb(stops[stops.length - 1][1])
}

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ]
}

export default function PolarSeismogram({ data, lineTimeUs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const receivers = useMemo(arrangeReceivers, [])

  // Pull out the receiver that recorded the loudest peak — used for the
  // "this is the moment" callout overlay.
  const peak = useMemo(() => {
    if (!data?.z) return null
    let best = { r: 0, t: 0, v: 0 }
    for (let ti = 0; ti < data.z.length; ti++) {
      const row = data.z[ti]
      for (let ri = 0; ri < row.length; ri++) {
        const v = Math.abs(row[ri])
        if (v > best.v) best = { r: ri, t: ti, v }
      }
    }
    return {
      receiver: best.r,
      timeUs: data.time_us[best.t] ?? 0,
      amplitude: best.v,
    }
  }, [data])

  // Render the radial seismogram into the canvas. Each receiver gets a thin
  // angular wedge, divided into radial cells by time. Color = amplitude.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data?.z || data.z.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width = VIEW
    const H = canvas.height = VIEW
    ctx.clearRect(0, 0, W, H)

    const nTime = data.z.length
    const nRecv = data.z[0]?.length ?? 0
    if (nTime === 0 || nRecv === 0) return

    // Pre-compute receiver angle bounds. The angular width of each receiver
    // wedge is the gap to its neighbour.
    const sortedByAngle = receivers
      .slice()
      .sort((a, b) => a.theta - b.theta)
    const angleBands = sortedByAngle.map((rcv, i) => {
      const prev = sortedByAngle[Math.max(0, i - 1)]
      const next = sortedByAngle[Math.min(sortedByAngle.length - 1, i + 1)]
      const a0 = (prev.theta + rcv.theta) / 2
      const a1 = (rcv.theta + next.theta) / 2
      return { idx: rcv.idx, a0: Math.min(a0, a1), a1: Math.max(a0, a1) }
    })

    // Draw outer-to-inner so later time wedges paint on top (early time at
    // outer rim). Each receiver's column has nTime cells.
    const radialBand = TIME_OUTER - TIME_INNER
    for (const band of angleBands) {
      const col = band.idx
      for (let ti = 0; ti < nTime; ti++) {
        const v = data.z[ti]?.[col] ?? 0
        const [r, g, b] = amplitudeToRgb(v)
        // map time index → radius. ti=0 (earliest) sits at outer rim,
        // ti=nTime-1 (latest) at inner — so the wave "falls inward."
        const r0 = TIME_INNER + (1 - (ti + 1) / nTime) * radialBand
        const r1 = TIME_INNER + (1 - ti / nTime) * radialBand
        ctx.beginPath()
        ctx.moveTo(
          CX + Math.cos(band.a0) * r0,
          CY - Math.sin(band.a0) * r0,
        )
        ctx.arc(CX, CY, r1, -band.a0, -band.a1, false)
        ctx.lineTo(
          CX + Math.cos(band.a1) * r0,
          CY - Math.sin(band.a1) * r0,
        )
        ctx.arc(CX, CY, r0, -band.a1, -band.a0, true)
        ctx.closePath()
        const alpha = 0.55 + Math.abs(v) * 0.45
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`
        ctx.fill()
      }
    }
  }, [data, receivers])

  // Animated lineTimeUs cursor — circle at the current playhead radius.
  const cursorR = useMemo(() => {
    if (lineTimeUs == null || !data?.time_us?.length) return null
    const tMax = data.time_us[data.time_us.length - 1] ?? 1
    const t = Math.max(0, Math.min(1, lineTimeUs / tMax))
    return TIME_INNER + (1 - t) * (TIME_OUTER - TIME_INNER)
  }, [lineTimeUs, data])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-panel-2/60 to-transparent px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-text/80">
          <Activity size={13} className="text-accent" />
          <span className="font-semibold">Patient signature · seismogram on arch</span>
        </div>
        {data && peak && (
          <span className="font-mono text-[10px] text-muted">
            peak rx <span className="text-warn">{peak.receiver}</span> @ <span className="text-warn">{peak.timeUs.toFixed(1)} μs</span>
          </span>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: '100%', maxWidth: VIEW, aspectRatio: '1 / 1' }}>
            {/* canvas seismogram (radial wedges) */}
            <canvas
              ref={canvasRef}
              width={VIEW}
              height={VIEW}
              className="absolute inset-0 h-full w-full"
            />
            {/* SVG overlay: arch outline + tooth marks + receivers + cursor */}
            <svg
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* faint guide rings */}
              <circle cx={CX} cy={CY} r={TIME_INNER} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8" />
              <circle cx={CX} cy={CY} r={TIME_OUTER} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />

              {/* dental arch — half-ellipse U on top */}
              <path
                d={`
                  M ${CX - ARCH_OUTER * 0.78} ${CY + 20}
                  Q ${CX} ${CY - ARCH_OUTER * 0.95} ${CX + ARCH_OUTER * 0.78} ${CY + 20}
                `}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1.4"
              />
              <path
                d={`
                  M ${CX - ARCH_INNER * 1.05} ${CY + 18}
                  Q ${CX} ${CY - ARCH_INNER * 1.5} ${CX + ARCH_INNER * 1.05} ${CY + 18}
                `}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />

              {/* 16 stylized teeth along the arch */}
              {Array.from({ length: 16 }).map((_, i) => {
                const t = (i + 0.5) / 16
                const theta = Math.PI * (1 - t)
                const rMid = (ARCH_INNER + ARCH_OUTER * 0.78) / 2 + 14
                const x = CX + Math.cos(theta) * rMid
                const y = CY - Math.sin(theta) * rMid
                const isMolar = i < 3 || i > 12
                const size = isMolar ? 8 : 6
                return (
                  <g key={i} transform={`translate(${x},${y}) rotate(${-(theta * 180 / Math.PI) + 90})`}>
                    <rect
                      x={-size / 2} y={-size / 1.4}
                      width={size} height={size * 1.3}
                      rx={size * 0.35}
                      fill="rgba(245,239,226,0.18)"
                      stroke="rgba(245,239,226,0.32)"
                      strokeWidth="0.8"
                    />
                  </g>
                )
              })}

              {/* receivers — 100 small markers */}
              {receivers.map((r) => {
                const isPeak = peak && r.idx === peak.receiver
                return (
                  <circle
                    key={r.idx}
                    cx={r.x}
                    cy={r.y}
                    r={isPeak ? 4 : 1.6}
                    fill={isPeak ? '#FFD23F' : 'rgba(255,255,255,0.55)'}
                    stroke={isPeak ? '#FFD23F' : 'none'}
                    strokeOpacity={0.4}
                    strokeWidth={isPeak ? 6 : 0}
                  />
                )
              })}

              {/* peak callout */}
              {peak && (() => {
                const rcv = receivers.find((r) => r.idx === peak.receiver)
                if (!rcv) return null
                const lx = rcv.x + (rcv.x > CX ? 30 : -30)
                const ly = rcv.y - 28
                return (
                  <g>
                    <line x1={rcv.x} y1={rcv.y} x2={lx} y2={ly} stroke="rgba(255,210,63,0.5)" strokeWidth="0.8" />
                    <text
                      x={lx + (rcv.x > CX ? 4 : -4)}
                      y={ly}
                      fill="#FFD23F"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor={rcv.x > CX ? 'start' : 'end'}
                    >
                      rx {peak.receiver}
                    </text>
                    <text
                      x={lx + (rcv.x > CX ? 4 : -4)}
                      y={ly + 11}
                      fill="rgba(255,255,255,0.6)"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor={rcv.x > CX ? 'start' : 'end'}
                    >
                      {peak.timeUs.toFixed(1)} μs
                    </text>
                  </g>
                )
              })()}

              {/* time cursor — concentric circle at current playhead */}
              {cursorR != null && (
                <circle
                  cx={CX} cy={CY} r={cursorR}
                  fill="none"
                  stroke="rgba(255,210,63,0.65)"
                  strokeWidth="1.2"
                />
              )}

              {/* time legend ticks */}
              <text x={CX} y={CY - TIME_OUTER - 6} fill="rgba(255,255,255,0.42)" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                early
              </text>
              <text x={CX} y={CY + 8} fill="rgba(255,255,255,0.42)" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                late
              </text>
            </svg>

            {/* hero overlay — top-left, the eyebrow + headline */}
            <div className="pointer-events-none absolute left-2 top-2 max-w-[60%]">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
                75 microseconds, 100 sensors
              </div>
              <div className="mt-0.5 text-[12px] font-medium leading-tight text-white/80">
                이 환자만의 음향 지문
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
