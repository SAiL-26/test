import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, UserPlus } from 'lucide-react'
import { createPatient, type PatientCreateBody } from '../api/endpoints'
import type { Patient } from '../api/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (p: Patient) => void
}

const today = () => new Date().toISOString().slice(0, 10)

export default function NewPatientDialog({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<PatientCreateBody>({
    mrn: '', full_name: '', dob: '2000-01-01', sex: 'M', notes: '',
  })

  const mut = useMutation({
    mutationFn: (body: PatientCreateBody) => createPatient(body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      onCreated?.(p)
      onClose()
      setForm({ mrn: '', full_name: '', dob: '2000-01-01', sex: 'M', notes: '' })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    mut.mutate({ ...form, notes: form.notes?.trim() || null })
  }

  function nextMRN(): string {
    // suggest a unique-ish MRN
    return `MRN-${String(Math.floor(1000 + Math.random() * 9000))}`
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="새 환자 등록"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm animate-[fade-in_0.18s_ease-out_both]"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] surface-elev p-0"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-3.5 w-3.5 text-accent" />
            <h2 className="text-[13px] font-semibold tracking-tight text-text-strong">New patient</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn">
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <Row label="이름">
            <input
              type="text" required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              autoFocus
              placeholder="홍길동"
              className="form-input"
            />
          </Row>
          <Row label="MRN">
            <div className="flex gap-2">
              <input
                type="text" required value={form.mrn}
                onChange={(e) => setForm({ ...form, mrn: e.target.value })}
                placeholder="MRN-0001"
                className="form-input flex-1"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, mrn: nextMRN() })}
                className="btn"
              >
                생성
              </button>
            </div>
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="생년월일">
              <input
                type="date" required value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                max={today()}
                className="form-input"
              />
            </Row>
            <Row label="성별">
              <select
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value as 'M' | 'F' | 'O' })}
                className="form-input"
              >
                <option value="M">남 (M)</option>
                <option value="F">여 (F)</option>
                <option value="O">기타 (O)</option>
              </select>
            </Row>
          </div>
          <Row label="메모 (선택)">
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="이전 시술, 특이사항 등"
              className="form-input resize-none"
            />
          </Row>

          {mut.error && (
            <div className="rounded border border-bad/30 bg-bad/[0.05] px-3 py-1.5 text-[11px] text-bad">
              저장 실패: {(mut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (mut.error as Error).message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-panel-2 px-4 py-2.5">
          <button type="button" onClick={onClose} className="btn">취소</button>
          <button type="submit" disabled={mut.isPending} className="btn btn-primary disabled:opacity-50">
            {mut.isPending ? '저장 중...' : '환자 추가'}
          </button>
        </div>
      </form>

      <style>{`
        .form-input {
          width: 100%;
          padding: 5px 9px;
          background: var(--color-panel);
          border: 1px solid var(--color-line);
          border-radius: 5px;
          color: var(--color-text);
          font-size: 12.5px;
          outline: none;
        }
        .form-input:focus { border-color: var(--color-accent-line); background: var(--color-panel-2); }
      `}</style>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-faint">{label}</div>
      {children}
    </label>
  )
}
