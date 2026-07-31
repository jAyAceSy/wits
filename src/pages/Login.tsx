import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export default function Login() {
  const { session, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) setError('Invalid email or password.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-signal-500 text-white">
            <Boxes size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Warehouse Inventory Transfer</h1>
            <p className="text-sm text-ink-400">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow-panel">
          <div className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <Button type="submit" size="lg" fullWidth disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-ink-500">
          Accounts are created by an administrator. Contact your supervisor if you don't have one.
        </p>
      </div>
    </div>
  )
}
