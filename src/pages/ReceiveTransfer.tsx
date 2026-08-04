import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ScanLine } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useBarcodeScannerFocus } from '../hooks/useBarcodeScanner'
import type { ReceiverTransferView } from '../lib/types'

// -----------------------------------------------------------------------
// SECURITY NOTE FOR ANYONE EDITING THIS FILE:
// This page must NEVER request, store, or display Transferred Quantity
// or Variance. That's not a UI preference — it's an internal control
// (independent physical count). It's also enforced on the backend: the
// receiver_lookup_transfer() and submit_receiving() database functions
// structurally cannot return those fields, so there is nothing to
// accidentally leak here even if this component has a bug. Please keep
// it that way — don't add a "debug" console.log of the RPC response,
// don't add extra columns to ReceiverTransferView, and don't query
// transfer_master directly from this page (RLS blocks it anyway).
// -----------------------------------------------------------------------

type Feedback = { type: 'error' | 'success'; message: string } | null

interface ReceiptLogEntry {
  transfer_barcode: string
  item_code: string
  description: string
  received_quantity: number
  at: string
}

export default function ReceiveTransfer() {
  const [barcodeValue, setBarcodeValue] = useState('')
  const [pendingItem, setPendingItem] = useState<ReceiverTransferView | null>(null)
  const [receivedQty, setReceivedQty] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Session-only log of what THIS receiver has already scanned, so they
  // have a sense of progress. Intentionally shows what they entered
  // (Received Quantity), never the transferred/expected figure — that
  // was never sent to this page in the first place.
  const [sessionLog, setSessionLog] = useState<ReceiptLogEntry[]>([])

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  useBarcodeScannerFocus(barcodeRef, !pendingItem)

  async function handleBarcodeSubmit() {
    const code = barcodeValue.trim()
    if (!code) return

    setFeedback(null)
    setLookupBusy(true)

    const { data, error } = await supabase.rpc('receiver_lookup_transfer', { p_barcode: code })

    setLookupBusy(false)
    setBarcodeValue('')

    if (error || !data || data.length === 0) {
      setFeedback({ type: 'error', message: error?.message ?? 'Transfer Barcode not found.' })
      return
    }

    setPendingItem(data[0])
    setReceivedQty('')
    window.setTimeout(() => {
      qtyRef.current?.focus()
    }, 0)
  }

  async function handleSubmit() {
    if (!pendingItem) return
    const qty = Number(receivedQty)
    if (!qty || qty <= 0) {
      setFeedback({ type: 'error', message: 'Enter a received quantity greater than zero.' })
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_receiving', {
      p_transfer_barcode: pendingItem.transfer_barcode,
      p_received_qty: qty,
    })
    setSubmitting(false)

    if (error) {
      setFeedback({ type: 'error', message: error.message })
      return
    }

    setFeedback({ type: 'success', message: data ?? 'Receiving transaction submitted successfully.' })
    setSessionLog((prev) => [
      {
        transfer_barcode: pendingItem.transfer_barcode,
        item_code: pendingItem.item_code,
        description: pendingItem.description,
        received_quantity: qty,
        at: new Date().toISOString(),
      },
      ...prev,
    ])
    setPendingItem(null)
    setReceivedQty('')
    window.setTimeout(() => barcodeRef.current?.focus(), 0)
  }

  function handleCancel() {
    setPendingItem(null)
    setReceivedQty('')
    setFeedback(null)
    window.setTimeout(() => barcodeRef.current?.focus(), 0)
  }

  return (
    <Layout title="Receive Transfer">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <ScanLine size={16} className="text-signal-600" />
            <h3 className="text-sm font-semibold text-ink-800">Scan Transfer Barcode</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">
              Scan the Transfer Barcode, physically count the items, then enter what you counted. This is an
              independent count — no expected quantity is shown here.
            </p>

            <div>
              <label htmlFor="transfer-barcode" className="mb-1.5 block text-sm font-medium text-ink-700">
                Transfer Barcode
              </label>
              <input
                ref={barcodeRef}
                id="transfer-barcode"
                autoComplete="off"
                inputMode="none"
                value={barcodeValue}
                disabled={!!pendingItem}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleBarcodeSubmit()
                  }
                }}
                placeholder="Scan or type the Transfer Barcode, then press Enter"
                className="w-full rounded-xl border-2 border-ink-200 bg-ink-50 px-4 py-4 text-lg font-semibold tracking-wide text-ink-900 focus:border-signal-500 focus:bg-white disabled:opacity-60"
              />
              {lookupBusy && <p className="mt-1 text-xs text-ink-400">Looking up transfer…</p>}
            </div>

            {feedback && (
              <div
                className={
                  feedback.type === 'error'
                    ? 'flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'
                    : 'flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-ok-600'
                }
              >
                {feedback.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                {feedback.message}
              </div>
            )}

            {pendingItem && (
              <div className="scan-pulse rounded-xl border border-ink-200 bg-ink-50 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Field label="Transfer Barcode" value={pendingItem.transfer_barcode} mono />
                  <Field label="Item Code" value={pendingItem.item_code} />
                  <Field label="Description" value={pendingItem.description} />
                  <Field label="UOM" value={pendingItem.uom} />
                </div>

                <div className="mt-4 max-w-xs">
                  <label htmlFor="received-qty" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Received Quantity (your physical count)
                  </label>
                  <input
                    ref={qtyRef}
                    id="received-qty"
                    type="number"
                    min="0.01"
                    step="any"
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSubmit()
                      }
                    }}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base font-semibold"
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button onClick={() => void handleSubmit()} disabled={submitting} size="lg">
                    {submitting ? 'Submitting…' : 'Submit'}
                  </Button>
                  <Button variant="secondary" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {sessionLog.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-ink-800">Received This Session</h3>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2">Transfer Barcode</th>
                    <th className="px-5 py-2">Item Code</th>
                    <th className="px-5 py-2">Description</th>
                    <th className="px-5 py-2">Received Qty</th>
                    <th className="px-5 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sessionLog.map((r) => (
                    <tr key={r.transfer_barcode}>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">{r.transfer_barcode}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{r.description}</td>
                      <td className="px-5 py-3 font-semibold text-ink-800">{r.received_quantity}</td>
                      <td className="px-5 py-3 text-ink-400">{new Date(r.at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-400">{label}</p>
      <p className={mono ? 'font-mono text-sm font-semibold text-ink-900' : 'font-semibold text-ink-900'}>{value}</p>
    </div>
  )
}
