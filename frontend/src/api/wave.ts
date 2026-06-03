import { api } from './client'

export type WaveCaseId = 1 | 2 | 3 | 4

export interface WaveMetadata {
  projectTitle: string
  modelShape: { ny: number; nx: number; nz: number }
  tissueValues: Record<string, number>
  snapshotTimes: string[]
  cases: Record<string, { label: string; available: boolean }>
  seismogramDtS: number
  seismogramNt: number
  seismogramNRecv: number
}

export interface SnapshotGrid {
  time: string
  timeStep: number
  caseId: number
  sourceFile: string
  shape: { rows: number; cols: number }
  sampledShape: { rows: number; cols: number }
  x: number[]
  y: number[]
  z: number[][]
  normalizationScale: number
  min: number
  max: number
}

export interface SeismogramGather {
  z: number[][]
  time_us: number[]
  receivers: number[]
  vmax: number
  sampledShape: { rows: number; cols: number }
  caseId: number
}

export interface ScreeningSurface {
  caseId: number
  sourceFiles: string[]
  shape: { rows: number; cols: number }
  sampledShape: { rows: number; cols: number }
  x: number[]
  y: number[]
  z: number[][]
  threshold: number
  hotspotVoxelCount: number
}

export interface VelocitySlice {
  z: number[][]
  x: number[]
  y: number[]
  shape: { rows: number; cols: number }
  z_index: number
  receivers: { id: number; x: number; y: number }[]
  vmin: number
  vmax: number
}

export interface McmcBackground {
  tissues: Record<string, {
    x: number[]; y: number[]; z: number[]
    i: number[]; j: number[]; k: number[]
    color: string; count: number
  }>
  local_bounds: { x: number[]; y: number[]; z: number[] }
}

export interface McmcTrace {
  iterations: number[]
  x: number[]
  y: number[]
  z: number[]
  r: number[]
  misfit: number[]
  true_values: { x: number; y: number; z: number; r: number }
  total: number
  caseId: number
}

export interface EnergyProfile {
  receiver_indices: number[]
  profile: number[]
  peak_receiver: number
  peak_value: number
  source_file: string
  caseId: number
}

export async function fetchWaveMetadata(): Promise<WaveMetadata> {
  const { data } = await api.get<WaveMetadata>('/wave/metadata')
  return data
}

export async function fetchSnapshotGrid(time: string, caseId: WaveCaseId): Promise<SnapshotGrid> {
  const { data } = await api.get<SnapshotGrid>('/wave/snapshot/grid', {
    params: { time, case: caseId },
  })
  return data
}

export async function fetchSeismogramGather(caseId: WaveCaseId): Promise<SeismogramGather> {
  const { data } = await api.get<SeismogramGather>('/wave/seismogram/gather', {
    params: { case: caseId },
  })
  return data
}

export async function fetchScreeningSurface(caseId: WaveCaseId): Promise<ScreeningSurface> {
  const { data } = await api.get<ScreeningSurface>('/wave/screening/surface', {
    params: { case: caseId },
  })
  return data
}

export async function fetchVelocitySlice(caseId: WaveCaseId): Promise<VelocitySlice> {
  const { data } = await api.get<VelocitySlice>('/wave/velocity-slice', {
    params: { case: caseId },
  })
  return data
}

export async function fetchMcmcBackground(): Promise<McmcBackground> {
  const { data } = await api.get<McmcBackground>('/wave/mcmc/background')
  return data
}

export async function fetchMcmcTrace(caseId: WaveCaseId): Promise<McmcTrace> {
  const { data } = await api.get<McmcTrace>('/wave/mcmc/trace', { params: { case: caseId } })
  return data
}

export async function fetchEnergyProfile(caseId: WaveCaseId): Promise<EnergyProfile> {
  const { data } = await api.get<EnergyProfile>('/wave/energy-profile', { params: { case: caseId } })
  return data
}

export interface TissueFullMesh {
  tissues: Record<string, {
    x: number[]; y: number[]; z: number[]
    i: number[]; j: number[]; k: number[]
    color: string; count: number
  }>
  step: number
  bounds: { x: number[]; y: number[]; z: number[] }
}

export async function fetchTissueFullMesh(step = 8): Promise<TissueFullMesh> {
  const { data } = await api.get<TissueFullMesh>('/wave/tissue/full-mesh', { params: { step } })
  return data
}
