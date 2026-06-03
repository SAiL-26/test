import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const DEMO = [
  { role: 'DOCTOR',  label: 'Dr. Kim',  email: 'doctor@demo.com',   password: 'doctor123' },
  { role: 'PATIENT', label: '김철수',    email: 'patient2@demo.com', password: 'patient123' },
]

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state: { from?: string } | null }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await login(email, password)
      nav(loc.state?.from ?? '/intro', { replace: true })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Authentication failed'
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  function fill(d: typeof DEMO[number]) { setEmail(d.email); setPassword(d.password) }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-[400px] animate-[fade-in_0.16s_var(--ease-out)_both]">
        {/* Brand mark */}
        <div className="mb-7 flex items-center gap-2.5">
          <Mark />
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-tight text-text-strong">Dental Wave Viz</div>
            <div className="font-mono text-[10.5px] text-faint">치은 병변 스크리닝 콘솔</div>
          </div>
        </div>

        {/* Card */}
        <div className="surface-elev p-5">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[14px] font-semibold tracking-tight text-text-strong">Sign in</h1>
          </div>
          <p className="mt-1 text-[11.5px] text-muted">계정 정보를 입력하거나 데모 계정을 선택하세요.</p>

          <form onSubmit={submit} className="mt-4 space-y-2.5">
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              autoFocus
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
            />

            {err && (
              <div className="flex items-center gap-2 rounded-md border border-bad/30 bg-bad/[0.05] px-3 py-1.5 text-[11px] text-bad">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary mt-1 w-full justify-center py-1.5 text-[12px] disabled:opacity-50"
            >
              {busy ? 'Authenticating…' : (
                <>
                  Sign in
                  <kbd className="ml-1">↵</kbd>
                </>
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-line pt-3">
            <div className="mb-2 text-[9.5px] font-medium uppercase tracking-wider text-faint">
              Demo accounts
            </div>
            <div className="space-y-1">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => fill(d)}
                  className="flex w-full items-center justify-between rounded-md border border-line bg-panel px-2.5 py-1.5 text-left transition hover:border-accent-line hover:bg-panel-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="pill pill-muted">{d.role}</span>
                    <span className="text-[12px] font-medium text-text">{d.label}</span>
                  </div>
                  <span className="font-mono text-[10.5px] text-muted">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function Field({ label, value, onChange, type, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type: string; autoFocus?: boolean
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">{label}</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-text outline-none transition focus:border-accent-line focus:bg-panel-2"
      />
    </label>
  )
}

function Mark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" stroke="var(--color-accent-line)" />
      <path
        d="M5 16 L8 16 L9.5 11 L11 21 L12.5 10 L14 22 L15.5 13 L17 19 L18.5 14 L20 17 L21.5 16 L27 16"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
