import axios from 'axios'

const TOKEN_KEY = 'dental_viz_token'

// Backend exposes APIs under /api in both dev and prod.
// Dev: Vite proxy forwards /api/* to localhost:8000 (no rewrite).
// Prod: same-origin — FastAPI serves /api routes and the SPA at /.
export const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const tok = localStorage.getItem(TOKEN_KEY)
  if (tok) config.headers.Authorization = `Bearer ${tok}`
  return config
})

type AuthExpiredListener = () => void
const authExpiredListeners = new Set<AuthExpiredListener>()
export function onAuthExpired(listener: AuthExpiredListener) {
  authExpiredListeners.add(listener)
  return () => { authExpiredListeners.delete(listener) }
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      authExpiredListeners.forEach((l) => l())
    }
    return Promise.reject(err)
  },
)

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}
