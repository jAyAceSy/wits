import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  PackageCheck,
  ScanLine,
  XCircle,
} from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TransferHeader, TransferImportBatch } from '../lib/types'
import { formatDateTime, startOfMonthIso, todayIsoDate } from '../utils/format'

interface Stats {
  todaysTransfers: number
  todaysItems: number
  monthTransfers: number
}

interface OfficerStats {
  pendingReview: number
  todaysReceipts: number
  todaysVariances: number
  pendingTransfers: number
  approvedVariances: number
  rejectedVariances: number
  importSuccessRate: number | null // null = no imports yet
}

export default function Dashboard() {
  const { profile, isAdmin, isOfficer, isReceiver } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<TransferHeader[]>([])
  const [loading, setLoading] = useState(true)
  const [officerStats, setOfficerStats] = useState<OfficerStats | null>(null)
  const [latestUploads, setLatestUploads] = useState<TransferImportBatch[]>([])

  useEffect(() => {
    if (!profile) return
    if (isReceiver) void loadDashboard()
    else setLoading(false)
    if (isOfficer) {
      void loadOfficerStats()
      void loadLatestUploads()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isOfficer, isReceiver])

  async function loadOfficerStats() {
    const today = todayIsoDate()

    const [pendingReviewRes, receiptsRes, variancesRes, pendingTransfersRes, approvedRes, rejectedRes, importTotalsRes] =
      await Promise.all([
        supabase
          .from('transfer_master')
          .select('id', { count: 'exact', head: true })
          .in('status', ['Pending Warehouse Officer Review', 'Under Investigation']),
        supabase
          .from('transfer_master')
          .select('id', { count: 'exact', head: true })
          .gte('received_at', `${today}T00:00:00`)
          .in('status', ['Received', 'Pending Warehouse Officer Review', 'Under Investigation', 'Approved with Variance', 'Rejected']),
        supabase
          .from('transfer_master')
          .select('id', { count: 'exact', head: true })
          .gte('received_at', `${today}T00:00:00`)
          .neq('variance', 0)
          .not('variance', 'is', null),
        supabase.from('transfer_master').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('transfer_master').select('id', { count: 'exact', head: true }).eq('status', 'Approved with Variance'),
        supabase.from('transfer_master').select('id', { count: 'exact', head: true }).eq('status', 'Rejected'),
        supabase.from('transfer_import_batches').select('total_records, successful_records').limit(1000),
      ])

    let importSuccessRate: number | null = null
    const importRows = importTotalsRes.data ?? []
    if (importRows.length > 0) {
      const totalAll = importRows.reduce((s, r) => s + (r.total_records ?? 0), 0)
      const successAll = importRows.reduce((s, r) => s + (r.successful_records ?? 0), 0)
      importSuccessRate = totalAll > 0 ? Math.round((successAll / totalAll) * 100) : null
    }

    setOfficerStats({
      pendingReview: pendingReviewRes.count ?? 0,
      todaysReceipts: receiptsRes.count ?? 0,
      todaysVariances: variancesRes.count ?? 0,
      pendingTransfers: pendingTransfersRes.count ?? 0,
      approvedVariances: approvedRes.count ?? 0,
      rejectedVariances: rejectedRes.count ?? 0,
      importSuccessRate,
    })
  }

  async function loadLatestUploads() {
    const { data } = await supabase
      .from('transfer_import_batches')
      .select('*, users(full_name)')
      .order('uploaded_at', { ascending: false })
      .limit(5)
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      uploader_name: row.users?.full_name,
    })) as TransferImportBatch[]
    setLatestUploads(mapped)
  }

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

    const [todayRes, monthRes, recentRes] = await Promise.all([todayQuery, monthQuery, recentQuery])

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
          {isReceiver && (
            <Link to="/transfers/new">
              <Button size="lg">
                <ScanLine size={18} />
                New Transfer
              </Button>
            </Link>
          )}
        </div>

        {isOfficer && officerStats && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Warehouse Officer</h3>
              <Link to="/variance-review" className="flex items-center gap-1 text-xs font-medium text-signal-600 hover:underline">
                Go to Variance Review <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard icon={<ClipboardList size={20} />} label="Pending Variance Reviews" value={officerStats.pendingReview} />
              <StatCard icon={<PackageCheck size={20} />} label="Today's Receipts" value={officerStats.todaysReceipts} />
              <StatCard icon={<CalendarDays size={20} />} label="Today's Variances" value={officerStats.todaysVariances} />
              <StatCard icon={<Boxes size={20} />} label="Pending Transfers" value={officerStats.pendingTransfers} />
              <StatCard icon={<CheckCircle2 size={20} />} label="Approved Variances" value={officerStats.approvedVariances} />
              <StatCard icon={<XCircle size={20} />} label="Rejected Variances" value={officerStats.rejectedVariances} />
              <StatCard
                icon={<FileSpreadsheet size={20} />}
                label="Import Success Rate"
                value={officerStats.importSuccessRate ?? 0}
                suffix={officerStats.importSuccessRate != null ? '%' : ' (no imports yet)'}
              />
            </div>

            <Card className="mt-4">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-ink-800">Latest Uploads</h3>
                <Link
                  to="/transfer-management"
                  className="flex items-center gap-1 text-xs font-medium text-signal-600 hover:underline"
                >
                  View all <ArrowRight size={14} />
                </Link>
              </div>
              {latestUploads.length === 0 ? (
                <EmptyState icon={<FileSpreadsheet size={28} />} title="No uploads yet" />
              ) : (
                <div className="divide-y divide-ink-100">
                  {latestUploads.map((b) => (
                    <div key={b.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink-800">{b.import_id}</p>
                        <p className="text-xs text-ink-400">
                          {b.filename} · {b.uploader_name ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink-400">{formatDateTime(b.uploaded_at)}</span>
                        <Badge tone={b.status === 'completed' ? 'success' : 'warning'}>
                          {b.successful_records}/{b.total_records} imported
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {isReceiver && (
          <>
            {loading || !stats ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-ink-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard icon={<CalendarDays size={20} />} label="Today's Transfers" value={stats.todaysTransfers} />
                <StatCard icon={<PackageCheck size={20} />} label="Items Transferred Today" value={stats.todaysItems} />
                <StatCard icon={<Boxes size={20} />} label="Transfers This Month" value={stats.monthTransfers} />
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
          </>
        )}

        {!isReceiver && !isOfficer && (
          <EmptyState
            icon={<Boxes size={32} />}
            title="Welcome to WITS"
            description="Use the sidebar to get to your module — Transfer Management for uploads, or ask an admin if you're missing access."
          />
        )}
      </div>
    </Layout>
  )
}

function StatCard({
  icon,
  label,
  value,
  suffix = '',
}: {
  icon: ReactNode
  label: string
  value: number
  suffix?: string
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-signal-50 text-signal-600">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-ink-900">
            {value}
            {suffix}
          </p>
          <p className="text-xs font-medium text-ink-400">{label}</p>
        </div>
      </CardBody>
    </Card>
  )
}
