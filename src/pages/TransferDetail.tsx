import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import type { TransferDetail as TransferLine, TransferHeader } from '../lib/types'
import { formatDateTime } from '../utils/format'

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [header, setHeader] = useState<TransferHeader | null>(null)
  const [lines, setLines] = useState<TransferLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) void load(id)
  }, [id])

  async function load(transferId: string) {
    setLoading(true)
    const [headerRes, linesRes] = await Promise.all([
      supabase
        .from('transfer_headers')
        .select(
          'id, transfer_number, transfer_date, created_at, warehouse_receiver, production_area, destination_warehouse, remarks, status, created_by, total_items, total_qty, creator:users!created_by(full_name)',
        )
        .eq('id', transferId)
        .single(),
      supabase.from('transfer_details').select('*').eq('transfer_id', transferId).order('scanned_at'),
    ])

    if (headerRes.data) {
      const row: any = headerRes.data
      setHeader({ ...row, creator_name: row.creator?.full_name })
    }
    setLines((linesRes.data ?? []) as TransferLine[])
    setLoading(false)
  }

  if (loading) {
    return (
      <Layout title="Transfer">
        <div className="flex justify-center py-20">
          <Spinner className="h-7 w-7 text-ink-400" />
        </div>
      </Layout>
    )
  }

  if (!header) {
    return (
      <Layout title="Transfer">
        <EmptyState title="Transfer not found" description="It may have been removed or you don't have access to it." />
      </Layout>
    )
  }

  return (
    <Layout title={header.transfer_number}>
      <div className="flex flex-col gap-4 print:gap-2">
        <div className="flex items-center justify-between print:hidden">
          <Link to="/transfers" className="flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
            <ArrowLeft size={16} /> Back to history
          </Link>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">{header.transfer_number}</h3>
              <p className="text-xs text-ink-400">{formatDateTime(header.created_at)}</p>
            </div>
            <Badge tone={header.status === 'submitted' ? 'success' : 'danger'}>{header.status}</Badge>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Warehouse Receiver" value={header.warehouse_receiver} />
            <Info label="Production Area" value={header.production_area} />
            <Info label="Destination Warehouse" value={header.destination_warehouse} />
            <Info label="Prepared By" value={header.creator_name} />
            {header.remarks && <Info label="Remarks" value={header.remarks} className="sm:col-span-2 lg:col-span-4" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">Items ({lines.length})</h3>
            <span className="text-xs font-medium text-ink-400">Total Qty: {header.total_qty}</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-2">Barcode</th>
                  <th className="px-5 py-2">Item Code</th>
                  <th className="px-5 py-2">Description</th>
                  <th className="px-5 py-2">UOM</th>
                  <th className="px-5 py-2">Qty</th>
                  <th className="px-5 py-2">Scanned At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 font-mono text-xs text-ink-500">{l.barcode}</td>
                    <td className="px-5 py-3 font-medium text-ink-800">{l.item_code}</td>
                    <td className="px-5 py-3 text-ink-600">{l.description}</td>
                    <td className="px-5 py-3 text-ink-500">{l.uom}</td>
                    <td className="px-5 py-3 font-semibold text-ink-800">{l.quantity}</td>
                    <td className="px-5 py-3 text-ink-400">{formatDateTime(l.scanned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  )
}

function Info({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-sm font-medium text-ink-800">{value || '—'}</p>
    </div>
  )
}
