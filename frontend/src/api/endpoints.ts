import { api } from './client'
import type {
  Patient, Scan, ScanDetail, TokenResponse, User,
} from './types'

export async function login(email: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams()
  form.set('username', email)
  form.set('password', password)
  const { data } = await api.post<TokenResponse>('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me')
  return data
}

export async function fetchPatients(): Promise<Patient[]> {
  const { data } = await api.get<Patient[]>('/patients')
  return data
}

export async function fetchPatient(id: number): Promise<Patient> {
  const { data } = await api.get<Patient>(`/patients/${id}`)
  return data
}

export interface PatientCreateBody {
  mrn: string
  full_name: string
  dob: string        // YYYY-MM-DD
  sex: 'M' | 'F' | 'O'
  notes?: string | null
}
export async function createPatient(body: PatientCreateBody): Promise<Patient> {
  const { data } = await api.post<Patient>('/patients', body)
  return data
}

export async function fetchScans(patientId?: number): Promise<Scan[]> {
  const { data } = await api.get<Scan[]>('/scans', {
    params: patientId !== undefined ? { patient_id: patientId } : undefined,
  })
  return data
}

export async function fetchScan(id: number): Promise<ScanDetail> {
  const { data } = await api.get<ScanDetail>(`/scans/${id}`)
  return data
}

export async function submitReview(scanId: number, review: string) {
  const { data } = await api.post(`/scans/${scanId}/review`, { review })
  return data
}
