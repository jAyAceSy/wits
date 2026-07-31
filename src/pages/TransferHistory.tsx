import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/Input'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TransferHeader } from '../lib/types'
import { formatDateTime } from '../utils/format'

export default function TransferHistory() {
  const { profile, isAdmin } = useAuth()
  const [transfers, setTransfers] = useState<TransferHeader[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    if (!profile) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, dateFilter])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('transfer_headers')
      .select(
        'id, transfer_number, transfer_date, created_at, warehouse_receiver, production_area, destination_warehouse, remarks, status, created_by, total_items, total_qty, creator:users!created_by(full_name)',
      )
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!isAdmin && profile?.id) query = query.eq('created_by', profile.id)
    if (dateFilter) query = query.eq('transfer_date', dateFilter)

    const { data } = await query
    const mapped = (data ?? []).map((row: any) => ({ ...row, creator_name: row.creator?.full_name })) as TransferHeader[]
    setTransfers(mapped)
    setLoading(false)
  }

  return (
    <Layout title={isAdmin ? 'All Transfers' : 'My Transfer History'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Input
              label="Filter by date"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="mb-0.5 text-xs font-medium text-ink-500 hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : transfers.length === 0 ? (
            <EmptyState icon={<Boxes size={32} />} title="No transfers found" description="Submitted transfers will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Transfer #</th>
                    <th className="px-5 py-3">Date / Time</th>
                    <th className="px-5 py-3">Production Area</th>
                    <th className="px-5 py-3">Destination</th>
                    {isAdmin && <th className="px-5 py-3">Prepared By</th>}
                    <th className="px-5 py-3">Items</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {transfers.map((t) => (
                    <tr key={t.id} className="cursor-pointer hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link to={`/transfers/${t.id}`} className="font-semibold text-signal-600 hover:underline">
                          {t.transfer_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(t.created_at)}</td>
                      <td className="px-5 py-3 text-ink-700">{t.production_area}</td>
                      <td className="px-5 py-3 text-ink-700">{t.destination_warehouse}</td>
                      {isAdmin && <td className="px-5 py-3 text-ink-500">{t.creator_name}</td>}
                      <td className="px-5 py-3 text-ink-700">
                        {t.total_items} ({t.total_qty})
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={t.status === 'submitted' ? 'success' : 'danger'}>{t.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  )
}
