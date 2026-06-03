import { api } from './client'

/**
 * Claude AI chat — Phase 11 wires this to the Anthropic API via the backend
 * proxy at POST /api/ai/chat. Until then, askClaude() returns a deterministic
 * stubbed response so the UI is wired end-to-end and just swaps backends.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AskClaudeParams {
  context: string
  mode: 'doctor' | 'patient'
  question: string
  history?: ChatMessage[]
}

export async function askClaude(params: AskClaudeParams): Promise<string> {
  try {
    const { data } = await api.post<{ reply: string }>('/ai/chat', params)
    return data.reply
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { detail?: string } }; code?: string }
    const status = err?.response?.status
    const detail = err?.response?.data?.detail
    // Network / no-backend → silent local stub (clearly labelled in the body)
    if (!status || err?.code === 'ERR_NETWORK' || err?.code === 'ECONNREFUSED') {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 600))
      return stubReply(params)
    }
    // Real backend error — surface the (already Korean-friendly) detail directly.
    if (status === 402) throw new Error(detail ?? 'Claude API 크레딧 잔액 부족')
    if (status === 401) throw new Error(detail ?? 'Claude API 인증 실패')
    if (status === 429) throw new Error(detail ?? '요청 한도 초과 — 잠시 후 다시 시도해주세요.')
    if (status === 502) throw new Error(detail ?? 'Claude API 응답 오류')
    throw new Error(`AI 오류 (${status}): ${detail ?? '알 수 없는 응답'}`)
  }
}

function stubReply({ question, mode, context }: AskClaudeParams): string {
  const persona = mode === 'patient' ? '환자' : '의사'
  return [
    `**${persona} 모드 응답**`,
    ``,
    `**질문**: ${question}`,
    ``,
    `**케이스 요약**: ${context.slice(0, 180)}…`,
    ``,
    `- 네트워크 연결이 일시적으로 끊겨 오프라인 응답으로 답변드립니다.`,
    `- 잠시 후 다시 시도해 주세요.`,
  ].join('\n')
}
