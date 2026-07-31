import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from './ui/Spinner'

export function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: ReactNode
  adminOnly?: boolean
}) {
  const { session, profile, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-ink-50">
        <Spinner className="h-8 w-8 text-ink-400" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (profile && !profile.is_active) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-ink-50 px-4 text-center">
        <p className="text-sm text-ink-500">
          Your account has been deactivated. Contact an administrator.
        </p>
      </div>
    )
  }

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return <>{children}</>
}
