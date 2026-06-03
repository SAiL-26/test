import { useEffect } from 'react'
import { Clock, Pause, Play } from 'lucide-react'

interface Props {
  times: string[]
  idx: number
  setIdx: (n: number | ((p: number) => number)) => void
  playing: boolean
  setPlaying: (b: boolean) => void
  speed: number
  setSpeed: (s: number) => void
}

const SPEEDS = [0.5, 1, 2, 4] as const

export default function GlobalScrubber({ times, idx, setIdx, playing, setPlaying, speed, setSpeed }: Props) {
  useEffect(() => {
    if (!playing || times.length === 0) return
    const id = setInterval(() => {
      setIdx((p: number) => (p + 1) % times.length)
    }, 800 / speed)
    return () => clearInterval(id)
  }, [playing, times.length, speed, setIdx])

  const currentTime = times[idx] ?? '—'
  // convert sample step to µs (dt = 4 ns)
  const currentUs = times[idx] ? (Number(times[idx]) * 4e-9 * 1e6).toFixed(2) : '—'

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-panel-2/60 px-3 py-1.5 text-xs">
      <Clock size={12} className="text-accent" />
      <span className="font-semibold text-text/80">시간축</span>
      <button
        onClick={() => setPlaying(!playing)}
        className={[
          'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium transition',
          playing ? 'border-accent bg-accent text-bg' : 'border-line bg-panel text-text hover:border-accent',
        ].join(' ')}
      >
        {playing ? <Pause size={10} /> : <Play size={10} />}
        {playing ? 'pause' : 'play'}
      </button>
      <input
        type="range" min={0} max={Math.max(0, times.length - 1)} value={idx}
        onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
        className="flex-1 accent-accent"
      />
      <span className="w-32 text-right font-mono text-[10px] text-muted">
        step {currentTime} · {currentUs} µs
      </span>
      <div className="ml-1 flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={[
              'rounded px-1.5 py-0.5 font-mono text-[9.5px] transition',
              speed === s ? 'border border-accent bg-accent-soft text-accent' : 'border border-transparent text-muted hover:text-text',
            ].join(' ')}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
