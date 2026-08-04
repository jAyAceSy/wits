import { useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/Input'
import { supabase } from '../lib/supabase'
import type { ReceiverTransferLogEntry } from '../lib/types'
import { formatDateTime } from '../utils/format'

export default function TransferHistory() {
  const [rows, setRows] = useState<ReceiverTransferLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('receiver_my_transfers')
    setRows((data ?? []) as ReceiverTransferLogEntry[])
    setLoading(false)
  }

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      r.transfer_barcode.toLowerCase().includes(q) ||
      r.item_code.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  })

  return (
    <Layout title="My Transfers">
      <div className="flex flex-col gap-4">
        <div className="max-w-sm">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, item code, description…"
          />
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Boxes size={32} />} title="No transfers found" description="What you record will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">UOM</th>
                    <th className="px-5 py-3">Quantity</th>
                    <th className="px-5 py-3">Date / Time</th>
                    <th className="px-5 py-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((r) => (
                    <tr key={r.transfer_barcode} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-600">{r.transfer_barcode}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{r.description}</td>
                      <td className="px-5 py-3 text-ink-500">{r.uom}</td>
                      <td className="px-5 py-3 font-semibold text-ink-800">{r.received_quantity}</td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.received_at)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={r.entry_type === 'transfer_barcode' ? 'info' : 'neutral'}>
                          {r.entry_type === 'transfer_barcode' ? 'Transfer Barcode' : 'Manual'}
                        </Badge>
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
