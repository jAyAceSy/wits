import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { formatDateTime } from '../utils/format'

interface SearchResult {
  id: string
  transfer_number: string
  transfer_date: string
  created_at: string
  production_area: string
  destination_warehouse: string
  total_items: number
  matched_on: string
}

export default function SearchPage() {
  const { isAdmin, profile } = useAuth()
  const [term, setTerm] = useState('')
  const [date, setDate] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  async function handleSearch() {
    setLoading(true)
    setRan(true)
    const q = term.trim()

    // 1) Match on transfer header fields directly.
    let headerQuery = supabase
      .from('transfer_headers')
      .select('id, transfer_number, transfer_date, created_at, production_area, destination_warehouse, total_items, created_by')
      .eq('status', 'submitted')
      .limit(50)

    if (!isAdmin && profile?.id) headerQuery = headerQuery.eq('created_by', profile.id)
    if (date) headerQuery = headerQuery.eq('transfer_date', date)
    if (q) headerQuery = headerQuery.ilike('transfer_number', `%${q}%`)

    const headerRes = q || date ? await headerQuery : { data: [] as any[] }

    // 2) Match on scanned line items (barcode / item code / description),
    // then resolve back to their parent transfer headers.
    let lineResults: SearchResult[] = []
    if (q) {
      const { data: lines } = await supabase
        .from('transfer_details')
        .select('transfer_id, barcode, item_code, description, transfer_headers!inner(id, transfer_number, transfer_date, created_at, production_area, destination_warehouse, total_items, created_by, status)')
        .or(`barcode.ilike.%${q}%,item_code.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(50)

      lineResults = (lines ?? [])
        .filter((l: any) => l.transfer_headers?.status === 'submitted')
        .filter((l: any) => isAdmin || l.transfer_headers?.created_by === profile?.id)
        .map((l: any) => ({
          id: l.transfer_headers.id,
          transfer_number: l.transfer_headers.transfer_number,
          transfer_date: l.transfer_headers.transfer_date,
          created_at: l.transfer_headers.created_at,
          production_area: l.transfer_headers.production_area,
          destination_warehouse: l.transfer_headers.destination_warehouse,
          total_items: l.transfer_headers.total_items,
          matched_on: `${l.item_code} — ${l.description}`,
        }))
    }

    const headerResults: SearchResult[] = (headerRes.data ?? []).map((h: any) => ({
      id: h.id,
      transfer_number: h.transfer_number,
      transfer_date: h.transfer_date,
      created_at: h.created_at,
      production_area: h.production_area,
      destination_warehouse: h.destination_warehouse,
      total_items: h.total_items,
      matched_on: 'Transfer Number / Date',
    }))

    const merged = [...headerResults, ...lineResults]
    const deduped = Array.from(new Map(merged.map((r) => [r.id + r.matched_on, r])).values())

    setResults(deduped)
    setLoading(false)
  }

  return (
    <Layout title="Search">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-[220px] flex-1">
              <Input
                label="Transfer #, Barcode, Item Code, or Description"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                placeholder="e.g. FG-1001, TRF-20260730-00001…"
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
            <EmptyState icon={<SearchIcon size={32} />} title="Search transfers" description="Enter a transfer number, barcode, item code, description, or pick a date." />
          ) : results.length === 0 ? (
            <EmptyState title="No results found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Transfer #</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Production Area</th>
                    <th className="px-5 py-3">Destination</th>
                    <th className="px-5 py-3">Matched On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {results.map((r, i) => (
                    <tr key={r.id + i} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link to={`/transfers/${r.id}`} className="font-semibold text-signal-600 hover:underline">
                          {r.transfer_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                      <td className="px-5 py-3 text-ink-600">{r.production_area}</td>
                      <td className="px-5 py-3 text-ink-600">{r.destination_warehouse}</td>
                      <td className="px-5 py-3">
                        <Badge tone="info">{r.matched_on}</Badge>
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
