import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadProfile, login as doLogin, logout as doLogout, watchAuth } from '@/services/authService'
import { logAudit } from '@/services/auditService'
import { friendlyError } from '@/lib/errors'
import type { UserProfile } from '@/types'

interface AuthState {
  profile: UserProfile | null
  loading: boolean
  /** Mensagem a exibir na tela de login (sessão expirada, acesso negado...). */
  notice: string | null
  login: (email: string, password: string) => Promise<void>
  logout: (reason?: 'manual' | 'idle') => Promise<void>
  clearNotice: () => void
}

const Ctx = createContext<AuthState | null>(null)
const IDLE_MS = Math.max(5, Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 30) * 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const profileRef = useRef<UserProfile | null>(null)
  profileRef.current = profile

  useEffect(() => {
    return watchAuth((user) => {
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }
      loadProfile(user.uid)
        .then(async (p) => {
          setProfile(p)
          setNotice(null)
          if (!sessionStorage.getItem('audit-login')) {
            sessionStorage.setItem('audit-login', '1')
            void logAudit(p, 'login', 'sessao', 'Login realizado')
          }
        })
        .catch(async (e) => {
          setNotice(friendlyError(e))
          setProfile(null)
          await doLogout()
        })
        .finally(() => setLoading(false))
    })
  }, [])

  const logout = useCallback(async (reason: 'manual' | 'idle' = 'manual') => {
    const p = profileRef.current
    if (p) await logAudit(p, 'logout', 'sessao', reason === 'idle' ? 'Sessão encerrada por inatividade' : 'Logout realizado')
    sessionStorage.removeItem('audit-login')
    if (reason === 'idle') setNotice('Sua sessão expirou por inatividade. Entre novamente.')
    await doLogout()
    setProfile(null)
  }, [])

  // Encerra a sessão após período de inatividade (computadores compartilhados em ambiente clínico).
  useEffect(() => {
    if (!profile) return
    let timer = window.setTimeout(() => void logout('idle'), IDLE_MS)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void logout('idle'), IDLE_MS)
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [profile, logout])

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      notice,
      login: async (email, password) => {
        setNotice(null)
        await doLogin(email, password)
      },
      logout,
      clearNotice: () => setNotice(null),
    }),
    [profile, loading, notice, logout],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}

export function useProfile(): UserProfile {
  const { profile } = useAuth()
  if (!profile) throw new Error('Usuário não autenticado')
  return profile
}
