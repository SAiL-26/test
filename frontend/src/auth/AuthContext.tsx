import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tokenStore, onAuthExpired } from '../api/client'
import { fetchMe, login as loginApi } from '../api/endpoints'
import type { User } from '../api/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    const tok = tokenStore.get()
    if (!tok) { setLoading(false); return }
    fetchMe()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    return onAuthExpired(() => {
      setUser(null)
      qc.clear()
    })
  }, [qc])

  const login: AuthContextValue['login'] = async (email, password) => {
    qc.clear()  // ensure previous user's cache is dropped
    const r = await loginApi(email, password)
    tokenStore.set(r.access_token)
    setUser(r.user)
    return r.user
  }

  const logout = () => {
    tokenStore.clear()
    setUser(null)
    qc.clear()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
