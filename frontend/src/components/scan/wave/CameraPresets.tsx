import { Eye } from 'lucide-react'

// Canonical dental viewing angles. Plotly's scene.camera.eye is in normalised
// scene-space units (1.0 ≈ default distance). The scene's axes after our
// transpose are: Plotly-x = model y (long arch), Plotly-y = model x (cross-
// arch), Plotly-z = depth.
//   • Occlusal — top-down look at the arch (clinical "bite view")
//   • Buccal   — look at the cheek side, slightly down
//   • Lingual  — look from the tongue side (opposite buccal)
//   • Default  — three-quarter orbital used by Plotly's initial render
export const CAMERA_PRESETS = {
  default: { eye: { x: 1.5, y: 1.5, z: 1.0 }, up: { x: 0, y: 0, z: 1 } },
  occlusal: { eye: { x: 0,   y: 0,   z: 2.4 }, up: { x: 0, y: 1, z: 0 } },
  buccal:   { eye: { x: 0,   y: 2.2, z: 0.4 }, up: { x: 0, y: 0, z: 1 } },
  lingual:  { eye: { x: 0,   y: -2.2,z: 0.4 }, up: { x: 0, y: 0, z: 1 } },
} as const

export type CameraKey = keyof typeof CAMERA_PRESETS

const ORDER: { key: CameraKey; label: string; hint: string }[] = [
  { key: 'default',  label: '3⁄4',       hint: '기본 회전 뷰' },
  { key: 'occlusal', label: 'Occlusal',  hint: '교합면 (위에서)' },
  { key: 'buccal',   label: 'Buccal',    hint: '협측 (볼 쪽)' },
  { key: 'lingual',  label: 'Lingual',   hint: '설측 (혀 쪽)' },
]

interface Props {
  value: CameraKey
  onChange: (k: CameraKey) => void
}

export default function CameraPresetButtons({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded border border-line bg-panel-2/60 px-2 py-1 text-[10px]">
      <Eye size={10} className="text-accent" />
      {ORDER.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          title={p.hint}
          className={[
            'rounded px-1.5 py-0.5 font-medium transition',
            value === p.key
              ? 'border border-accent bg-accent-soft text-accent'
              : 'border border-transparent text-muted hover:text-text',
          ].join(' ')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
