import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui/misc'

export function RequireAuth() {
  const { profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label="Verificando sessão…" />
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
