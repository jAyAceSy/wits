import { useState } from 'react'
import { LogOut, Menu, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Badge } from '../ui/Badge'

export function Topbar({ onMenuClick, title }: { onMenuClick: () => void; title: string }) {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            <User size={16} />
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-none text-ink-800">{profile?.full_name ?? '—'}</p>
            <p className="mt-0.5 text-[11px] leading-none text-ink-400">{profile?.email}</p>
          </div>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-12 z-20 w-56 rounded-lg border border-ink-100 bg-white py-2 shadow-panel">
            <div className="border-b border-ink-100 px-4 pb-2">
              <p className="text-sm font-medium text-ink-800">{profile?.full_name}</p>
              <Badge tone={profile?.role === 'admin' ? 'info' : 'neutral'}>
                {profile?.role === 'admin'
                  ? 'Administrator'
                  : profile?.role === 'production'
                    ? 'Production'
                    : profile?.role === 'warehouse_officer'
                      ? 'Warehouse Officer'
                      : 'Warehouse Staff'}
              </Badge>
            </div>
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
