import { useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { ReceiverTransferLogEntry, TransferMasterFull } from '../lib/types'
import { formatDateTime } from '../utils/format'

export default function SearchPage() {
  const { isOfficer } = useAuth()
  const [term, setTerm] = useState('')
  const [date, setDate] = useState('')
  const [receiverResults, setReceiverResults] = useState<ReceiverTransferLogEntry[]>([])
  const [fullResults, setFullResults] = useState<TransferMasterFull[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  // Officers/Admins search the full table directly (they're already
  // allowed to see everything). Everyone else searches only their own
  // permanently-blind history via the RPC — same data source as My
  // Transfers, just filtered.
  async function handleSearch() {
    setLoading(true)
    setRan(true)
    const q = term.trim().toLowerCase()

    if (isOfficer) {
      const { data } = await supabase
        .from('transfer_master')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      let rows = (data ?? []) as TransferMasterFull[]
      if (q) {
        rows = rows.filter(
          (r) =>
            r.transfer_barcode.toLowerCase().includes(q) ||
            r.item_code.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q),
        )
      }
      if (date) rows = rows.filter((r) => r.created_at.slice(0, 10) === date)
      setFullResults(rows)
    } else {
      const { data } = await supabase.rpc('receiver_my_transfers')
      let rows = (data ?? []) as ReceiverTransferLogEntry[]
      if (q) {
        rows = rows.filter(
          (r) =>
            r.transfer_barcode.toLowerCase().includes(q) ||
            r.item_code.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q),
        )
      }
      if (date) rows = rows.filter((r) => r.received_at.slice(0, 10) === date)
      setReceiverResults(rows)
    }

    setLoading(false)
  }

  const hasResults = isOfficer ? fullResults.length > 0 : receiverResults.length > 0

  return (
    <Layout title="Search">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-[220px] flex-1">
              <Input
                label="Transfer Barcode, Item Code, or Description"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                placeholder="e.g. FG-1001, SCPADAV260803000001…"
              />
            </div>
            <div className="w-48">
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button onClick={() => void handleSearch()}>
              <SearchIcon size={16} /> Search
            </Button>
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : !ran ? (
            <EmptyState
              icon={<SearchIcon size={32} />}
              title="Search transfers"
              description="Enter a Transfer Barcode, item code, description, or pick a date."
            />
          ) : !hasResults ? (
            <EmptyState title="No results found" />
          ) : isOfficer ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Transfer Barcode</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Transferred</th>
                    <th className="px-5 py-3">Received</th>
                    <th className="px-5 py-3">Variance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {fullResults.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-700">{r.transfer_barcode}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-700">{r.transferred_quantity}</td>
                      <td className="px-5 py-3 text-ink-700">{r.received_quantity ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-700">{r.variance ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge tone="info">{r.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Quantity</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {receiverResults.map((r) => (
                    <tr key={r.transfer_barcode} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-700">{r.transfer_barcode}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{r.description}</td>
                      <td className="px-5 py-3 font-semibold text-ink-800">{r.received_quantity}</td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.received_at)}</td>
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
