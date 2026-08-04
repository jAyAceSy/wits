import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import {
  LayoutDashboard,
  ScanLine,
  History,
  Package,
  Users,
  FileBarChart,
  Search,
  Boxes,
  FileSpreadsheet,
  ClipboardList,
  Printer,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const staffLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transfers/new', label: 'New Transfer', icon: ScanLine },
  { to: '/transfers', label: 'My Transfers', icon: History },
  { to: '/search', label: 'Search', icon: Search },
]

const adminLinks = [
  { to: '/products', label: 'Products', icon: Package },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, isProduction, isReceiver, isOfficer } = useAuth()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'bg-ink-800 text-white' : 'text-ink-300 hover:bg-ink-800/60 hover:text-white',
    )

  const showWarehouseSection = isReceiver
  const showAdminSection = isAdmin

  return (
    <nav className="flex h-full w-64 flex-col overflow-y-auto bg-ink-900 px-3 py-5">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-500 text-white">
          <Boxes size={18} />
        </div>
        <div>
          <p className="text-sm font-bold leading-none text-white">WITS</p>
          <p className="text-[11px] leading-none text-ink-400">Inventory Transfer</p>
        </div>
      </div>

      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <LayoutDashboard size={18} />
        Dashboard
      </NavLink>

      {showWarehouseSection && (
        <div className="mt-5 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Warehouse
          </p>
          {staffLinks
            .filter((l) => l.to !== '/')
            .map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass} onClick={onNavigate}>
                <link.icon size={18} />
                {link.label}
              </NavLink>
            ))}
        </div>
      )}

      {isProduction && (
        <div className="mt-5 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Transfer Management
          </p>
          <NavLink to="/transfer-management" className={linkClass} onClick={onNavigate}>
            <FileSpreadsheet size={18} />
            Upload Transfer Excel
          </NavLink>
        </div>
      )}

      {isOfficer && (
        <div className="mt-5 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Officer
          </p>
          <NavLink to="/variance-review" className={linkClass} onClick={onNavigate}>
            <ClipboardList size={18} />
            Variance Review
          </NavLink>
        </div>
      )}

      {(isOfficer || isProduction) && (
        <div className="mt-5 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Label Printing
          </p>
          <NavLink to="/label-printing" className={linkClass} onClick={onNavigate}>
            <Printer size={18} />
            Print Transfer Labels
          </NavLink>
        </div>
      )}

      {showAdminSection && (
        <div className="mt-5 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Administration
          </p>
          {adminLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass} onClick={onNavigate}>
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  )
}
