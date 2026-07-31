import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink-50 text-center">
      <p className="text-5xl font-bold text-ink-900">404</p>
      <p className="text-sm text-ink-500">This page doesn't exist.</p>
      <Link to="/">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  )
}
