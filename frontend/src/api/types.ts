export type Role = 'doctor' | 'patient'
export type Sex = 'M' | 'F' | 'O'
export type ScanStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ScenarioTag = 'healthy' | 'inf70' | 'inf80'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: User
}

export interface Patient {
  id: number
  mrn: string
  full_name: string
  dob: string
  sex: Sex
  notes: string | null
  doctor_id: number
  user_id: number | null
  created_at: string
  scan_count: number
  latest_severity: number | null
  latest_scan_date: string | null
}

export interface Scan {
  id: number
  patient_id: number
  scan_date: string
  status: ScanStatus
  scenario_tag: ScenarioTag
  notes: string | null
  bundle_dir: string
  created_at: string
}

export interface Detection {
  id: number
  scan_id: number
  candidate_recv_idx: number
  candidate_residual: number
  estimate_x_mm: number
  estimate_y_mm: number
  estimate_z_mm: number
  severity_score: number
  model_version: string
  doctor_review: string | null
  computed_at: string
}

export interface BundleMeta {
  scan_id?: string
  scenario_tag?: ScenarioTag
  summary?: string
  grid: {
    NX: number; NY: number; NZ: number
    NX_ds: number; NY_ds: number; downsample: number
  }
  spacing_mm: number
  extent_mm: { x: number; y: number; z: number }
  time: { NT: number; DT_s: number; T_total_us: number; NT_ds: number; t_decimation: number }
  geometry: {
    shot_idx_seismogram: number
    shot_idx_snapshot: number
    recv_z: number
    num_recv: number
    recv_coords_yx: [number, number][]
    lesion_centroid_yx: [number, number]
  }
  slices: Record<string, { shape: [number, number]; min: number; max: number; mean: number; dtype: string }>
  lesion_mask: { shape: [number, number]; n_cells: number; dtype: string }
  wavefield: {
    shape: [number, number, number]
    dtype: 'int8'
    vmax: number
    frame_t_us: number[]
  }
  seismograms: {
    scenarios: ScenarioTag[]
    files: Record<ScenarioTag, { shape: [number, number]; vmax: number; dtype: 'int16'; t_decimation: number }>
  }
}

export interface ScanDetail extends Scan {
  detection: Detection | null
  patient_name: string | null
  bundle_meta: BundleMeta
}
