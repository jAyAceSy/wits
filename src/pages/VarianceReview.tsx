import { useEffect, useState } from 'react'
import { AlertTriangle, ClipboardList, History } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { TransferAuditEntry, TransferMasterStatus, TransferMasterFull } from '../lib/types'
import { formatDateTime } from '../utils/format'

type Tab = 'queue' | 'investigation' | 'completed' | 'reopened'

const TAB_LABELS: Record<Tab, string> = {
  queue: 'Pending Review',
  investigation: 'Under Investigation',
  completed: 'Completed',
  reopened: 'Reopened',
}

const REVIEWABLE_STATUSES: TransferMasterStatus[] = ['Pending Warehouse Officer Review', 'Under Investigation']
const COMPLETED_STATUSES: TransferMasterStatus[] = ['Received', 'Approved with Variance', 'Rejected']

export default function VarianceReview() {
  const [tab, setTab] = useState<Tab>('queue')
  const [rows, setRows] = useState<TransferMasterFull[]>([])
  const [loading, setLoading] = useState(true)

  const [detail, setDetail] = useState<TransferMasterFull | null>(null)
  const [auditTrail, setAuditTrail] = useState<TransferAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void load(tab)
  }, [tab])

  async function load(t: Tab) {
    setLoading(true)
    let query = supabase
      .from('transfer_master')
      .select('*, receiver:users!received_by(full_name), reviewer:users!reviewed_by(full_name)')
      .order('received_at', { ascending: false })
      .limit(200)

    if (t === 'queue') {
      query = query.eq('status', 'Pending Warehouse Officer Review')
    } else if (t === 'investigation') {
      query = query.eq('status', 'Under Investigation')
    } else if (t === 'completed') {
      query = query.in('status', COMPLETED_STATUSES)
    } else {
      // Reopened: back to Pending, awaiting a fresh scan — but only the
      // ones that were actually reopened, not the normal never-yet-
      // received backlog (that's Production/Receiver's domain).
      query = query.eq('status', 'Pending').gt('reopened_count', 0).order('reviewed_at', { ascending: false })
    }

    const { data } = await query
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      receiver_name: row.receiver?.full_name,
      reviewer_name: row.reviewer?.full_name,
    })) as TransferMasterFull[]
    setRows(mapped)
    setLoading(false)
  }

  async function openDetail(row: TransferMasterFull) {
    setDetail(row)
    setRemarks(row.review_remarks ?? '')
    setActionError(null)
    setAuditLoading(true)
    const { data } = await supabase
      .from('transfer_audit_trail')
      .select('*, users(full_name)')
      .eq('transfer_master_id', row.id)
      .order('created_at')
    const mapped = (data ?? []).map((a: any) => ({ ...a, performer_name: a.users?.full_name })) as TransferAuditEntry[]
    setAuditTrail(mapped)
    setAuditLoading(false)
  }

  async function handleAction(action: 'approve' | 'reject' | 'investigate') {
    if (!detail) return
    setActionBusy(true)
    setActionError(null)
    const { error } = await supabase.rpc('warehouse_officer_review', {
      p_transfer_id: detail.id,
      p_action: action,
      p_remarks: remarks || null,
    })
    setActionBusy(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setDetail(null)
    await load(tab)
  }

  async function handleReopen() {
    if (!detail) return
    const ok = window.confirm('Reopen this transaction? It will go back to Pending for re-receiving.')
    if (!ok) return
    setActionBusy(true)
    setActionError(null)
    const { error } = await supabase.rpc('reopen_transfer', {
      p_transfer_id: detail.id,
      p_remarks: remarks || null,
    })
    setActionBusy(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setDetail(null)
    await load(tab)
  }

  const isReviewable = detail && REVIEWABLE_STATUSES.includes(detail.status)
  const isUnderInvestigation = detail?.status === 'Under Investigation'
  const isCompletedItem = detail && COMPLETED_STATUSES.includes(detail.status)

  return (
    <Layout title="Variance Review">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === t ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 border border-ink-200'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'reopened' && (
          <p className="text-xs text-ink-400">
            These were reopened and are back to "Pending" — awaiting the Receiver to scan the Transfer Barcode
            again. They'll move to Pending Review or Completed once re-received.
          </p>
        )}

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<ClipboardList size={32} />} title={`Nothing in ${TAB_LABELS[tab]}`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Transfer Barcode</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Transferred</th>
                    <th className="px-5 py-3">Received</th>
                    <th className="px-5 py-3">Variance</th>
                    <th className="px-5 py-3">Receiver</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-600">{r.transfer_barcode}</td>
                      <td className="px-5 py-3">
                        <Badge tone={r.entry_type === 'ad_hoc' ? 'neutral' : 'info'}>
                          {r.entry_type === 'ad_hoc' ? 'Manual' : 'Transfer Barcode'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-700">{r.transferred_quantity}</td>
                      <td className="px-5 py-3 text-ink-700">{r.received_quantity ?? '—'}</td>
                      <td className="px-5 py-3">
                        {r.variance != null && r.variance !== 0 ? (
                          <span className={r.variance > 0 ? 'font-semibold text-blue-600' : 'font-semibold text-red-600'}>
                            {r.variance > 0 ? '+' : ''}
                            {r.variance}
                          </span>
                        ) : (
                          <span className="text-ink-400">{tab === 'reopened' ? '—' : 0}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-500">{r.receiver_name ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-400">{formatDateTime(r.received_at)}</td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={
                            r.status === 'Approved with Variance' || r.status === 'Received'
                              ? 'success'
                              : r.status === 'Rejected'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {r.status}
                          {r.reopened_count > 0 && tab !== 'reopened' ? ` (reopened ×${r.reopened_count})` : ''}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Button variant="ghost" size="sm" onClick={() => void openDetail(r)}>
                          {tab === 'reopened' ? 'View' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Transfer ${detail?.transfer_barcode ?? ''}`}
        footer={
          <>
            {isReviewable && (
              <>
                <Button variant="danger" onClick={() => void handleAction('reject')} disabled={actionBusy}>
                  Reject
                </Button>
                {!isUnderInvestigation && (
                  <Button variant="secondary" onClick={() => void handleAction('investigate')} disabled={actionBusy}>
                    Request Investigation
                  </Button>
                )}
                <Button variant="success" onClick={() => void handleAction('approve')} disabled={actionBusy}>
                  Approve
                </Button>
              </>
            )}
            {isCompletedItem && (
              <Button variant="secondary" onClick={() => void handleReopen()} disabled={actionBusy}>
                Reopen Transaction
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Item Code" value={detail.item_code} />
              <Info label="UOM" value={detail.uom} />
              <Info label="Description" value={detail.description} className="col-span-2" />
              <Info label="Transferred Quantity" value={String(detail.transferred_quantity)} />
              <Info label="Received Quantity" value={detail.received_quantity != null ? String(detail.received_quantity) : '—'} />
              <Info
                label="Variance"
                value={detail.variance != null ? (detail.variance > 0 ? `+${detail.variance}` : String(detail.variance)) : '—'}
              />
              <Info label="Receiver" value={detail.receiver_name ?? '—'} />
              <Info label="Received At" value={formatDateTime(detail.received_at)} />
              {detail.reopened_count > 0 && <Info label="Reopened" value={`${detail.reopened_count} time(s)`} />}
            </div>

            {(isReviewable || isCompletedItem) && (
              <div>
                <label htmlFor="review-remarks" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Remarks
                </label>
                <textarea
                  id="review-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-signal-500"
                  placeholder="Notes for the audit trail (visible to other officers)"
                />
              </div>
            )}

            {actionError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertTriangle size={16} /> {actionError}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2 text-ink-600">
                <History size={14} />
                <span className="text-xs font-semibold uppercase tracking-wide">Audit Trail</span>
              </div>
              {auditLoading ? (
                <Spinner className="h-4 w-4 text-ink-400" />
              ) : auditTrail.length === 0 ? (
                <p className="text-xs text-ink-400">No history yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-xs">
                  {auditTrail.map((a) => (
                    <li key={a.id} className="rounded-md bg-ink-50 px-3 py-2">
                      <span className="font-semibold text-ink-700">{a.event}</span>{' '}
                      <span className="text-ink-400">
                        {a.previous_status ? `${a.previous_status} → ` : ''}
                        {a.new_status}
                      </span>
                      <div className="mt-0.5 text-ink-400">
                        {a.performer_name ?? 'System'} · {formatDateTime(a.created_at)}
                        {a.remarks ? ` · "${a.remarks}"` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-sm font-medium text-ink-800">{value}</p>
    </div>
  )
}
