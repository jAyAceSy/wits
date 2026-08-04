import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ScanLine } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useBarcodeScannerFocus } from '../hooks/useBarcodeScanner'
import type { ReceiverTransferView } from '../lib/types'

// -----------------------------------------------------------------------
// SECURITY NOTE: this page must NEVER request, store, or display
// Transferred Quantity or Variance for Transfer-Barcode entries. See the
// same note in migration_004 / receiver_lookup_transfer(). Ad-hoc entries
// have no "expected" value at all, so there's nothing to hide for those.
// -----------------------------------------------------------------------

type Mode = 'transfer_barcode' | 'ad_hoc'
type Feedback = { type: 'error' | 'warning' | 'success'; message: string } | null

interface AdhocProduct {
  item_code: string
  description: string
  uom: string
  matchedOn: string // the raw code that was scanned, for the submit call
}

interface LogEntry {
  reference: string
  item_code: string
  description: string
  quantity: number
  mode: Mode
  at: string
}

export default function NewTransfer() {
  const [barcodeValue, setBarcodeValue] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const [mode, setMode] = useState<Mode | null>(null)
  const [pendingTransferItem, setPendingTransferItem] = useState<ReceiverTransferView | null>(null)
  const [pendingAdhocProduct, setPendingAdhocProduct] = useState<AdhocProduct | null>(null)

  const [quantity, setQuantity] = useState('')
  const [productionArea, setProductionArea] = useState('')
  const [destinationWarehouse, setDestinationWarehouse] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [sessionLog, setSessionLog] = useState<LogEntry[]>([])

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const [formFieldFocused, setFormFieldFocused] = useState(false)

  const hasPending = !!pendingTransferItem || !!pendingAdhocProduct
  useBarcodeScannerFocus(barcodeRef, !hasPending && !formFieldFocused)

  useEffect(() => {
    if (hasPending) {
      window.setTimeout(() => qtyRef.current?.focus(), 0)
    }
  }, [hasPending])

  async function handleScan() {
    const code = barcodeValue.trim()
    if (!code) return

    setFeedback(null)
    setLookupBusy(true)
    setBarcodeValue('')

    // 1) Try it as a Transfer Barcode first (blind count flow).
    const { data: tbData, error: tbError } = await supabase.rpc('receiver_lookup_transfer', { p_barcode: code })

    if (!tbError && tbData && tbData.length > 0) {
      setLookupBusy(false)
      setMode('transfer_barcode')
      setPendingTransferItem(tbData[0])
      setQuantity('')
      return
    }

    // 2) Not a known Transfer Barcode — try it as a Product barcode or
    // Item Code instead (ad-hoc entry, no pre-declared expected qty).
    const { data: product } = await supabase
      .from('products')
      .select('item_code, description, uom')
      .or(`barcode.eq.${code},item_code.eq.${code}`)
      .eq('is_active', true)
      .maybeSingle()

    setLookupBusy(false)

    if (product) {
      setMode('ad_hoc')
      setPendingAdhocProduct({ ...product, matchedOn: code })
      setQuantity('')
      return
    }

    // 3) Neither system recognizes it.
    setFeedback({
      type: 'error',
      message: `"${code}" was not found as a Transfer Barcode, Product Barcode, or Item Code.`,
    })
  }

  async function handleSubmitTransferBarcode() {
    if (!pendingTransferItem) return
    const qty = Number(quantity)
    if (!qty || qty <= 0) {
      setFeedback({ type: 'error', message: 'Enter a received quantity greater than zero.' })
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_receiving', {
      p_transfer_barcode: pendingTransferItem.transfer_barcode,
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
        reference: pendingTransferItem.transfer_barcode,
        item_code: pendingTransferItem.item_code,
        description: pendingTransferItem.description,
        quantity: qty,
        mode: 'transfer_barcode',
        at: new Date().toISOString(),
      },
      ...prev,
    ])
    resetPending()
  }

  async function handleSubmitAdhoc() {
    if (!pendingAdhocProduct) return
    const qty = Number(quantity)
    if (!qty || qty <= 0) {
      setFeedback({ type: 'error', message: 'Enter a quantity greater than zero.' })
      return
    }
    if (!productionArea.trim() || !destinationWarehouse.trim()) {
      setFeedback({ type: 'error', message: 'Production Area and Destination Warehouse are required.' })
      return
    }

    setSubmitting(true)
    const { data: reference, error } = await supabase.rpc('submit_adhoc_transfer', {
      p_code: pendingAdhocProduct.matchedOn,
      p_quantity: qty,
      p_production_area: productionArea.trim(),
      p_destination_warehouse: destinationWarehouse.trim(),
      p_remarks: remarks.trim() || null,
    })
    setSubmitting(false)

    if (error) {
      setFeedback({ type: 'error', message: error.message })
      return
    }

    setFeedback({ type: 'success', message: `Recorded as ${reference}.` })
    setSessionLog((prev) => [
      {
        reference: reference ?? '—',
        item_code: pendingAdhocProduct.item_code,
        description: pendingAdhocProduct.description,
        quantity: qty,
        mode: 'ad_hoc',
        at: new Date().toISOString(),
      },
      ...prev,
    ])
    // Production Area / Destination Warehouse are deliberately NOT
    // cleared — usually the next few scans are going to the same place.
    setRemarks('')
    resetPending()
  }

  function resetPending() {
    setMode(null)
    setPendingTransferItem(null)
    setPendingAdhocProduct(null)
    setQuantity('')
    window.setTimeout(() => barcodeRef.current?.focus(), 0)
  }

  function handleCancelPending() {
    setFeedback(null)
    resetPending()
  }

  return (
    <Layout title="New Transfer">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <ScanLine size={16} className="text-signal-600" />
            <h3 className="text-sm font-semibold text-ink-800">Scan</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">
              Scan the pallet's Transfer Barcode if it has one. If it doesn't, scan the product barcode (or type
              the Item Code) instead and enter the quantity yourself.
            </p>

            <div>
              <label htmlFor="scan-code" className="mb-1.5 block text-sm font-medium text-ink-700">
                Transfer Barcode / Product Barcode / Item Code
              </label>
              <input
                ref={barcodeRef}
                id="scan-code"
                autoComplete="off"
                inputMode="none"
                value={barcodeValue}
                disabled={hasPending}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleScan()
                  }
                }}
                placeholder="Scan or type, then press Enter"
                className="w-full rounded-xl border-2 border-ink-200 bg-ink-50 px-4 py-4 text-lg font-semibold tracking-wide text-ink-900 focus:border-signal-500 focus:bg-white disabled:opacity-60"
              />
              {lookupBusy && <p className="mt-1 text-xs text-ink-400">Looking up…</p>}
            </div>

            {feedback && (
              <div
                className={
                  feedback.type === 'error'
                    ? 'flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'
                    : feedback.type === 'warning'
                      ? 'flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700'
                      : 'flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-ok-600'
                }
              >
                {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {feedback.message}
              </div>
            )}

            {/* Transfer Barcode flow — blind count, no expected qty shown */}
            {mode === 'transfer_barcode' && pendingTransferItem && (
              <div className="scan-pulse rounded-xl border border-ink-200 bg-ink-50 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-signal-600">
                  Transfer Barcode — Independent Count
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Field label="Transfer Barcode" value={pendingTransferItem.transfer_barcode} mono />
                  <Field label="Item Code" value={pendingTransferItem.item_code} />
                  <Field label="Description" value={pendingTransferItem.description} />
                  <Field label="UOM" value={pendingTransferItem.uom} />
                </div>
                <div className="mt-4 max-w-xs">
                  <label htmlFor="qty" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Received Quantity (your physical count)
                  </label>
                  <input
                    ref={qtyRef}
                    id="qty"
                    type="number"
                    min="0.01"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSubmitTransferBarcode()
                      }
                    }}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base font-semibold"
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => void handleSubmitTransferBarcode()} disabled={submitting} size="lg">
                    {submitting ? 'Submitting…' : 'Submit'}
                  </Button>
                  <Button variant="secondary" onClick={handleCancelPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Ad-hoc flow — no Transfer Barcode, self-declared quantity */}
            {mode === 'ad_hoc' && pendingAdhocProduct && (
              <div className="scan-pulse rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  No Transfer Barcode Found — Manual Entry
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <Field label="Item Code" value={pendingAdhocProduct.item_code} />
                  <Field label="Description" value={pendingAdhocProduct.description} />
                  <Field label="UOM" value={pendingAdhocProduct.uom} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Production Area *"
                    value={productionArea}
                    onChange={(e) => setProductionArea(e.target.value)}
                    onFocus={() => setFormFieldFocused(true)}
                    onBlur={() => setFormFieldFocused(false)}
                    placeholder="e.g. Line 2 – Packing"
                  />
                  <Input
                    label="Destination Warehouse *"
                    value={destinationWarehouse}
                    onChange={(e) => setDestinationWarehouse(e.target.value)}
                    onFocus={() => setFormFieldFocused(true)}
                    onBlur={() => setFormFieldFocused(false)}
                    placeholder="e.g. Main Warehouse – Bay 3"
                  />
                  <div>
                    <label htmlFor="adhoc-qty" className="mb-1.5 block text-sm font-medium text-ink-700">
                      Quantity *
                    </label>
                    <input
                      ref={qtyRef}
                      id="adhoc-qty"
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                  <Input
                    label="Remarks (optional)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    onFocus={() => setFormFieldFocused(true)}
                    onBlur={() => setFormFieldFocused(false)}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button onClick={() => void handleSubmitAdhoc()} disabled={submitting} size="lg">
                    {submitting ? 'Submitting…' : 'Submit'}
                  </Button>
                  <Button variant="secondary" onClick={handleCancelPending}>
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
              <h3 className="text-sm font-semibold text-ink-800">Recorded This Session</h3>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2">Reference</th>
                    <th className="px-5 py-2">Item Code</th>
                    <th className="px-5 py-2">Description</th>
                    <th className="px-5 py-2">Qty</th>
                    <th className="px-5 py-2">Type</th>
                    <th className="px-5 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sessionLog.map((r) => (
                    <tr key={r.reference + r.at}>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">{r.reference}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{r.description}</td>
                      <td className="px-5 py-3 font-semibold text-ink-800">{r.quantity}</td>
                      <td className="px-5 py-3 text-ink-500">
                        {r.mode === 'transfer_barcode' ? 'Transfer Barcode' : 'Manual'}
                      </td>
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
