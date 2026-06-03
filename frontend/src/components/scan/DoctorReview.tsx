import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitReview } from '../../api/endpoints'
import { useAuth } from '../../auth/AuthContext'

interface Props {
  scanId: number
  initialReview: string | null
}

export default function DoctorReview({ scanId, initialReview }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initialReview ?? '')

  const mut = useMutation({
    mutationFn: (review: string) => submitReview(scanId, review),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan', scanId] })
      qc.invalidateQueries({ queryKey: ['patients'] })
      setEditing(false)
    },
  })

  // patients can read but not edit
  const canEdit = user?.role === 'doctor'

  // hide entirely from non-doctors when there's nothing to read
  if (!canEdit && !initialReview) return null

  // read-only view (no edit triggered)
  if (!editing) {
    if (!initialReview) {
      return (
        <div className="mt-4 border-t border-line pt-3">
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded border border-dashed border-line bg-panel-2 px-3 py-2 text-left text-xs text-muted transition hover:border-accent hover:text-text"
          >
            + 의사 코멘트 작성
          </button>
        </div>
      )
    }
    return (
      <div className="mt-4 rounded border border-line bg-panel-2 p-3 text-xs">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted">의사 코멘트</span>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] text-muted hover:text-accent"
            >
              수정
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{initialReview}</p>
      </div>
    )
  }

  // editing
  return (
    <div className="mt-4 rounded border border-line bg-panel-2 p-3">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">의사 코멘트</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        placeholder="진단 소견, 권장 후속 조치 등을 입력하세요."
        className="w-full resize-none rounded border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
      />
      {mut.error && (
        <div className="mt-2 text-[11px] text-bad">
          저장 실패: {(mut.error as Error).message}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => { setText(initialReview ?? ''); setEditing(false); mut.reset() }}
          disabled={mut.isPending}
          className="rounded border border-line bg-panel-2 px-3 py-1 text-xs hover:border-accent disabled:opacity-50"
        >
          취소
        </button>
        <button
          onClick={() => mut.mutate(text)}
          disabled={mut.isPending || text.trim().length === 0}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-bg disabled:opacity-50"
        >
          {mut.isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
