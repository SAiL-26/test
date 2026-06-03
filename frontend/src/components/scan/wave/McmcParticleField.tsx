import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { McmcBackground, McmcTrace } from '../../../api/wave'

interface Props {
  trace: McmcTrace
  background?: McmcBackground
  // How many iterations to reveal (0..total). The cloud grows up to this slice.
  n: number
  showMode?: boolean
  showBest?: boolean
  showWalk?: boolean
}

// Normalize a (x, y, z) point to [-1, 1] given bounds, with a margin so the
// cloud doesn't touch the camera frustum edges.
function makeNormalizer(bounds: { x: [number, number]; y: [number, number]; z: [number, number] }, margin = 0.85) {
  const cx = (bounds.x[0] + bounds.x[1]) / 2
  const cy = (bounds.y[0] + bounds.y[1]) / 2
  const cz = (bounds.z[0] + bounds.z[1]) / 2
  const sx = Math.max(1, bounds.x[1] - bounds.x[0])
  const sy = Math.max(1, bounds.y[1] - bounds.y[0])
  const sz = Math.max(1, bounds.z[1] - bounds.z[0])
  const s = Math.max(sx, sy, sz) / (2 * margin)
  return (x: number, y: number, z: number): [number, number, number] => [
    (x - cx) / s,
    (z - cz) / s,            // z-up: model z → scene y so vertical axis = depth
    (y - cy) / s,
  ]
}

function colorFromDensity(t: number): THREE.Color {
  // Soft viridis-warm gradient matching the rest of the app's MCMC density.
  // t in [0,1]: cool purple → teal → warm yellow.
  const stops: Array<[number, [number, number, number]]> = [
    [0,    [0.69, 0.50, 0.83]],
    [0.33, [0.23, 0.62, 0.74]],
    [0.67, [0.21, 0.72, 0.47]],
    [1,    [0.99, 0.91, 0.14]],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0)
      return new THREE.Color(
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      )
    }
  }
  return new THREE.Color(stops[stops.length - 1][1][0], stops[stops.length - 1][1][1], stops[stops.length - 1][1][2])
}

// Soft circular sprite for points — a radial alpha falloff so each particle
// reads as a glowing orb rather than a hard pixel. Generated once.
function makeSpriteTexture(): THREE.Texture {
  const size = 64
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(cv)
  tex.needsUpdate = true
  return tex
}

interface SceneData {
  bounds: { x: [number, number]; y: [number, number]; z: [number, number] }
  // Aggregated unique posterior states with visit counts.
  cloud: { px: number; py: number; pz: number; cnt: number; color: THREE.Color; size: number }[]
  walk: Float32Array            // flat array of [x0,y0,z0, x1,y1,z1, ...] for chain walk
  gt: [number, number, number]
  mode: [number, number, number]
  best: [number, number, number]
  bestMisfit: number
  modeDistance: number
  bestDistance: number
}

function buildSceneData(trace: McmcTrace, n: number, background?: McmcBackground): SceneData {
  const slice = Math.max(1, Math.min(trace.total, n))

  // Bounds: prefer background's local_bounds (matches anatomy region), fall
  // back to trace extent so the camera frames sensibly even before bg loads.
  let bounds: { x: [number, number]; y: [number, number]; z: [number, number] }
  if (background?.local_bounds) {
    bounds = {
      x: [background.local_bounds.x[0], background.local_bounds.x[1]],
      y: [background.local_bounds.y[0], background.local_bounds.y[1]],
      z: [background.local_bounds.z[0], background.local_bounds.z[1]],
    }
  } else {
    bounds = {
      x: [Math.min(...trace.x), Math.max(...trace.x)],
      y: [Math.min(...trace.y), Math.max(...trace.y)],
      z: [Math.min(...trace.z), Math.max(...trace.z)],
    }
  }
  const norm = makeNormalizer(bounds)

  // Aggregate cloud
  const counts: Record<string, number> = {}
  for (let i = 0; i < slice; i++) {
    const k = `${trace.x[i]},${trace.y[i]},${trace.z[i]}`
    counts[k] = (counts[k] || 0) + 1
  }
  const entries = Object.entries(counts)
  const maxCnt = Math.max(...entries.map(([, c]) => c), 1)
  const cloud = entries.map(([k, cnt]) => {
    const [x, y, z] = k.split(',').map(Number)
    const [px, py, pz] = norm(x, y, z)
    const density = Math.log1p(cnt) / Math.log1p(maxCnt)
    const sizeScale = 0.045 + Math.sqrt(cnt / maxCnt) * 0.11
    return { px, py, pz, cnt, color: colorFromDensity(density), size: sizeScale }
  })

  // Chain walk (line strip).
  const walk = new Float32Array(slice * 3)
  for (let i = 0; i < slice; i++) {
    const [px, py, pz] = norm(trace.x[i], trace.y[i], trace.z[i])
    walk[i * 3] = px
    walk[i * 3 + 1] = py
    walk[i * 3 + 2] = pz
  }

  // Markers
  const tv = trace.true_values
  const gt = norm(tv.x, tv.y, tv.z)

  let modeKey = ''; let modeC = 0
  for (const [k, c] of entries) if (c > modeC) { modeC = c; modeKey = k }
  const [mx, my, mz] = modeKey ? modeKey.split(',').map(Number) : [tv.x, tv.y, tv.z]
  const mode = norm(mx, my, mz)

  let bestI = 0; let bestMisfit = trace.misfit[0]
  for (let i = 1; i < slice; i++) {
    if (trace.misfit[i] < bestMisfit) { bestMisfit = trace.misfit[i]; bestI = i }
  }
  const best = norm(trace.x[bestI], trace.y[bestI], trace.z[bestI])

  const modeDistance = Math.sqrt((mx - tv.x) ** 2 + (my - tv.y) ** 2 + (mz - tv.z) ** 2)
  const bestDistance = Math.sqrt((trace.x[bestI] - tv.x) ** 2 + (trace.y[bestI] - tv.y) ** 2 + (trace.z[bestI] - tv.z) ** 2)

  return { bounds, cloud, walk, gt, mode, best, bestMisfit, modeDistance, bestDistance }
}

// ─── R3F sub-components ───────────────────────────────────────────────────

function ParticleCloud({ cloud, sprite }: { cloud: SceneData['cloud']; sprite: THREE.Texture }) {
  const ref = useRef<THREE.Points>(null)
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(cloud.length * 3)
    const col = new Float32Array(cloud.length * 3)
    const siz = new Float32Array(cloud.length)
    cloud.forEach((p, i) => {
      pos[i * 3] = p.px; pos[i * 3 + 1] = p.py; pos[i * 3 + 2] = p.pz
      col[i * 3] = p.color.r; col[i * 3 + 1] = p.color.g; col[i * 3 + 2] = p.color.b
      siz[i] = p.size
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1))
    return g
  }, [cloud])

  // Gentle "breath" — barely-visible rotation so the cloud feels alive.
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.04
    }
  })

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial
        vertexColors
        size={0.08}
        sizeAttenuation
        map={sprite}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function ChainWalk({ walk }: { walk: Float32Array }) {
  // Use a manually-constructed THREE.Line and mount via <primitive> — R3F's
  // intrinsic JSX <line> name conflicts with React's SVG <line> typing in
  // strict TS mode, and `primitive` sidesteps the namespace clash entirely.
  const lineObj = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(walk, 3))
    const col = new Float32Array(walk.length)
    const n = walk.length / 3
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1)
      col[i * 3] = 0.95
      col[i * 3 + 1] = 0.78 + 0.2 * t
      col[i * 3 + 2] = 0.20 + 0.4 * (1 - t)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return new THREE.Line(g, mat)
  }, [walk])

  return <primitive object={lineObj} />
}

function Marker({ position, color, kind }: { position: [number, number, number]; color: string; kind: 'gt' | 'mode' | 'best' }) {
  if (kind === 'gt') {
    // Pulsing white-emissive sphere for the ground truth — the anchor.
    return (
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.07, 0.085, 32]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      </group>
    )
  }
  if (kind === 'mode') {
    return (
      <group position={position}>
        <mesh>
          <torusGeometry args={[0.065, 0.008, 12, 32]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    )
  }
  // best
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.06, 0.008, 4, 4]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

function TissueGhost({ bg }: { bg: McmcBackground }) {
  // Render the gingiva/bone/tooth meshes as very faint ghosted volumes — the
  // particle field's anatomical context without drawing attention away from
  // the cloud itself.
  return (
    <group>
      {Object.entries(bg.tissues).map(([name, t]) => {
        if (!t.i?.length) return null
        const geom = new THREE.BufferGeometry()
        // The endpoint already returns vertex arrays + index arrays. Each
        // (x[i], y[i], z[i]) is one vertex; (i, j, k) are triangle indices.
        const pos = new Float32Array(t.x.length * 3)
        for (let i = 0; i < t.x.length; i++) {
          pos[i * 3] = t.x[i]; pos[i * 3 + 1] = t.z[i]; pos[i * 3 + 2] = t.y[i]
        }
        const idx = new Uint32Array(t.i.length * 3)
        for (let i = 0; i < t.i.length; i++) {
          idx[i * 3] = t.i[i]; idx[i * 3 + 1] = t.j[i]; idx[i * 3 + 2] = t.k[i]
        }
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geom.setIndex(new THREE.BufferAttribute(idx, 1))
        geom.computeVertexNormals()
        return (
          <mesh key={name} geometry={geom} scale={[0.03, 0.03, 0.03]}>
            <meshBasicMaterial color={t.color} transparent opacity={0.025} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function Scene({ data, showMode, showBest, showWalk, bg }: {
  data: SceneData
  showMode: boolean
  showBest: boolean
  showWalk: boolean
  bg?: McmcBackground
}) {
  const sprite = useMemo(() => makeSpriteTexture(), [])
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(2.0, 1.4, 2.2)
    camera.lookAt(0, 0, 0)
  }, [camera])

  return (
    <>
      <color attach="background" args={['#06080c']} />
      <ambientLight intensity={0.4} />
      {bg && <TissueGhost bg={bg} />}
      <ParticleCloud cloud={data.cloud} sprite={sprite} />
      {showWalk && <ChainWalk walk={data.walk} />}
      <Marker position={data.gt}   color="#ffffff" kind="gt" />
      {showMode && <Marker position={data.mode} color="#58C2F0" kind="mode" />}
      {showBest && <Marker position={data.best} color="#3CD49A" kind="best" />}
      <OrbitControls enableDamping dampingFactor={0.08} rotateSpeed={0.6} minDistance={1.2} maxDistance={6} />
    </>
  )
}

// ─── Top-level component ──────────────────────────────────────────────────

const VOXEL_MM = 0.1

export default function McmcParticleField({
  trace, background, n, showMode = true, showBest = true, showWalk = true,
}: Props) {
  const data = useMemo(() => buildSceneData(trace, n, background), [trace, n, background])
  // Re-mount Canvas only when first ready — afterwards we want React state
  // updates (n) to mutate buffers via the scene data memo, not unmount/mount.
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const errMm = (data.modeDistance * VOXEL_MM)
  const total = trace.total
  const slice = Math.max(1, Math.min(total, n))

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06080c]">
      {ready && (
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          camera={{ fov: 50, near: 0.05, far: 50, position: [2, 1.4, 2.2] }}
        >
          <Scene data={data} showMode={showMode} showBest={showBest} showWalk={showWalk} bg={background} />
          <EffectComposer multisampling={0}>
            <Bloom intensity={0.55} luminanceThreshold={0.15} luminanceSmoothing={0.5} mipmapBlur />
          </EffectComposer>
        </Canvas>
      )}

      {/* HERO OVERLAY — bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-col">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Localization · mode → GT
        </div>
        <div className="mt-0.5 font-mono text-[42px] font-semibold leading-none text-white">
          {errMm.toFixed(2)}
          <span className="ml-1 align-baseline text-[16px] font-normal text-white/40">mm</span>
        </div>
        <div className="mt-1 text-[10.5px] text-white/55">
          {data.modeDistance.toFixed(2)} voxel · best {data.bestDistance.toFixed(2)} vox
        </div>
      </div>

      {/* RIGHT-TOP — sample count */}
      <div className="pointer-events-none absolute right-4 top-3 text-right">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">
          posterior samples
        </div>
        <div className="font-mono text-[26px] font-semibold leading-none text-white">
          {slice.toLocaleString()}
          <span className="ml-0.5 text-[12px] font-normal text-white/40">/ {total.toLocaleString()}</span>
        </div>
      </div>

      {/* LEFT-TOP — legend */}
      <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1 text-[9.5px]">
        <Legend dot="#ffffff" label="ground truth" />
        {showMode && <Legend dot="#58C2F0" label="posterior mode" />}
        {showBest && <Legend dot="#3CD49A" label="MAP · min misfit" />}
        {showWalk && <Legend dot="linear-gradient(90deg,#f2b441,#ff8f4d)" label="chain walk" line />}
      </div>

      {/* BOTTOM-RIGHT — drag hint */}
      <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
        drag · scroll · pinch
      </div>
    </div>
  )
}

function Legend({ dot, label, line }: { dot: string; label: string; line?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-white/55">
      <span
        className={line ? 'inline-block h-px w-3' : 'inline-block h-2 w-2 rounded-full'}
        style={{ background: dot }}
      />
      <span className="uppercase tracking-[0.12em]">{label}</span>
    </div>
  )
}
