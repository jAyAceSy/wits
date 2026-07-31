import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, CalendarDays, PackageCheck, ScanLine } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TransferHeader } from '../lib/types'
import { formatDateTime, startOfMonthIso, todayIsoDate } from '../utils/format'

interface Stats {
  todaysTransfers: number
  todaysItems: number
  monthTransfers: number
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<TransferHeader[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    void loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function loadDashboard() {
    setLoading(true)
    const today = todayIsoDate()
    const monthStart = startOfMonthIso()

    let todayQuery = supabase
      .from('transfer_headers')
      .select('id, total_items, total_qty', { count: 'exact' })
      .eq('transfer_date', today)
      .eq('status', 'submitted')

    let monthQuery = supabase
      .from('transfer_headers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)
      .eq('status', 'submitted')

    let recentQuery = supabase
      .from('transfer_headers')
      .select('id, transfer_number, transfer_date, created_at, warehouse_receiver, production_area, destination_warehouse, total_items, total_qty, status, created_by, remarks, creator:users!created_by(full_name)')
      .order('created_at', { ascending: false })
      .limit(8)

    if (!isAdmin && profile?.id) {
      todayQuery = todayQuery.eq('created_by', profile.id)
      monthQuery = monthQuery.eq('created_by', profile.id)
      recentQuery = recentQuery.eq('created_by', profile.id)
    }

    const [todayRes, monthRes, recentRes] = await Promise.all([
      todayQuery,
      monthQuery,
      recentQuery,
    ])

    const todaysItems = (todayRes.data ?? []).reduce((sum, r: { total_qty: number }) => sum + Number(r.total_qty ?? 0), 0)

    setStats({
      todaysTransfers: todayRes.count ?? todayRes.data?.length ?? 0,
      todaysItems,
      monthTransfers: monthRes.count ?? 0,
    })

    const mapped = (recentRes.data ?? []).map((row: any) => ({
      ...row,
      creator_name: row.creator?.full_name,
    })) as TransferHeader[]
    setRecent(mapped)
    setLoading(false)
  }

  return (
    <Layout title="Dashboard">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              Welcome back, {profile?.full_name?.split(' ')[0] ?? ''}
            </h2>
            <p className="text-sm text-ink-400">Here's what's happening with inventory transfers.</p>
          </div>
          <Link to="/transfers/new">
            <Button size="lg">
              <ScanLine size={18} />
              New Transfer
            </Button>
          </Link>
        </div>

        {loading || !stats ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-ink-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={<CalendarDays size={20} />}
              label="Today's Transfers"
              value={stats.todaysTransfers}
            />
            <StatCard
              icon={<PackageCheck size={20} />}
              label="Items Transferred Today"
              value={stats.todaysItems}
            />
            <StatCard
              icon={<Boxes size={20} />}
              label="Transfers This Month"
              value={stats.monthTransfers}
            />
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-ink-800">Recent Transfer History</h3>
            <Link to="/transfers" className="flex items-center gap-1 text-xs font-medium text-signal-600 hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-5 w-5 text-ink-400" />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Boxes size={32} />}
              title="No transfers yet"
              description="Transfers you submit will show up here."
            />
          ) : (
            <div className="divide-y divide-ink-100">
              {recent.map((t) => (
                <Link
                  key={t.id}
                  to={`/transfers/${t.id}`}
                  className="flex flex-col gap-1 px-5 py-3 hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink-800">{t.transfer_number}</p>
                    <p className="text-xs text-ink-400">
                      {t.production_area} → {t.destination_warehouse}
                      {isAdmin && t.creator_name ? ` · ${t.creator_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">{formatDateTime(t.created_at)}</span>
                    <Badge tone="success">{t.total_items} items</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-signal-50 text-signal-600">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-ink-900">{value}</p>
          <p className="text-xs font-medium text-ink-400">{label}</p>
        </div>
      </CardBody>
    </Card>
  )
}
