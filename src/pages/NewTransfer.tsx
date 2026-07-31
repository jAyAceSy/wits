import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ScanLine, Trash2 } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useBarcodeScannerFocus } from '../hooks/useBarcodeScanner'
import type { Product, TransferDetail, TransferHeader } from '../lib/types'
import { formatDateTime } from '../utils/format'

type ScanFeedback = { type: 'error' | 'warning'; message: string } | null

export default function NewTransfer() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [header, setHeader] = useState<TransferHeader | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  const [warehouseReceiver, setWarehouseReceiver] = useState('')
  const [productionArea, setProductionArea] = useState('')
  const [destinationWarehouse, setDestinationWarehouse] = useState('')
  const [remarks, setRemarks] = useState('')

  const [items, setItems] = useState<TransferDetail[]>([])
  const [barcodeValue, setBarcodeValue] = useState('')
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)
  const [pendingQty, setPendingQty] = useState('1')
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Fallback for when a barcode won't scan or isn't registered: look the
  // item up by Item Code instead.
  const [manualSearchOpen, setManualSearchOpen] = useState(false)
  const [manualQuery, setManualQuery] = useState('')
  const [manualResults, setManualResults] = useState<Product[]>([])
  const [manualSearching, setManualSearching] = useState(false)

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const [formFieldFocused, setFormFieldFocused] = useState(false)

  // Keep the scanner input focused unless the user is deliberately typing
  // into the quantity or a header text field, or an item is pending.
  useBarcodeScannerFocus(barcodeRef, !pendingProduct && !formFieldFocused && !manualSearchOpen)

  useEffect(() => {
    void initDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initDraft() {
    setInitializing(true)
    setInitError(null)
    const { data, error } = await supabase
      .from('transfer_headers')
      .insert({})
      .select()
      .single()

    if (error || !data) {
      setInitError(error?.message ?? 'Could not start a new transfer.')
      setInitializing(false)
      return
    }
    setHeader(data as TransferHeader)
    setInitializing(false)
  }

  const loadItems = useCallback(async (transferId: string) => {
    const { data } = await supabase
      .from('transfer_details')
      .select('*')
      .eq('transfer_id', transferId)
      .order('scanned_at', { ascending: false })
    setItems((data ?? []) as TransferDetail[])
  }, [])

  useEffect(() => {
    if (header?.id) void loadItems(header.id)
  }, [header?.id, loadItems])

  async function handleBarcodeSubmit() {
    const code = barcodeValue.trim()
    if (!code || !header) return

    setScanFeedback(null)
    setScanBusy(true)

    if (items.some((i) => i.barcode === code)) {
      setScanFeedback({ type: 'warning', message: `"${code}" was already scanned in this transfer.` })
      setBarcodeValue('')
      setScanBusy(false)
      return
    }

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', code)
      .eq('is_active', true)
      .maybeSingle()

    setScanBusy(false)

    if (error || !product) {
      setScanFeedback({
        type: 'error',
        message: `Unknown Barcode: "${code}" is not registered in Products. Try searching by Item Code below.`,
      })
      setBarcodeValue('')
      setManualSearchOpen(true)
      return
    }

    setBarcodeValue('')
    selectProduct(product as Product)
  }

  // Shared by both the barcode scan flow and the manual Item Code search
  // flow — whichever way the product was found, the rest of the "add
  // item" experience is identical.
  function selectProduct(product: Product) {
    if (items.some((i) => i.barcode === product.barcode)) {
      setScanFeedback({ type: 'warning', message: `${product.item_code} was already scanned in this transfer.` })
      return
    }
    setScanFeedback(null)
    setManualSearchOpen(false)
    setManualQuery('')
    setManualResults([])
    setPendingProduct(product)
    setPendingQty('1')
    window.setTimeout(() => {
      qtyRef.current?.focus()
      qtyRef.current?.select()
    }, 0)
  }

  // Debounced live search by Item Code, for when a barcode can't be
  // scanned or isn't registered.
  useEffect(() => {
    if (!manualSearchOpen) return
    const q = manualQuery.trim()
    if (!q) {
      setManualResults([])
      return
    }
    setManualSearching(true)
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .ilike('item_code', `%${q}%`)
        .order('item_code')
        .limit(20)
      setManualResults((data ?? []) as Product[])
      setManualSearching(false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [manualQuery, manualSearchOpen])

  async function handleAddItem() {
    if (!header || !pendingProduct) return
    const qty = Number(pendingQty)
    if (!qty || qty <= 0) {
      setScanFeedback({ type: 'error', message: 'Enter a quantity greater than zero.' })
      return
    }

    setAddingItem(true)
    const { error } = await supabase.from('transfer_details').insert({
      transfer_id: header.id,
      product_id: pendingProduct.id,
      barcode: pendingProduct.barcode,
      item_code: pendingProduct.item_code,
      description: pendingProduct.description,
      uom: pendingProduct.uom,
      quantity: qty,
    })
    setAddingItem(false)

    if (error) {
      if (error.code === '23505') {
        setScanFeedback({ type: 'warning', message: 'This item was already added to the transfer.' })
      } else {
        setScanFeedback({ type: 'error', message: error.message })
      }
      return
    }

    setPendingProduct(null)
    setPendingQty('1')
    await loadItems(header.id)
    window.setTimeout(() => barcodeRef.current?.focus(), 0)
  }

  async function handleRemoveItem(id: string) {
    if (!header) return
    await supabase.from('transfer_details').delete().eq('id', id)
    await loadItems(header.id)
    barcodeRef.current?.focus()
  }

  async function handleSubmitTransfer() {
    if (!header) return
    setSubmitError(null)

    if (!warehouseReceiver.trim() || !productionArea.trim() || !destinationWarehouse.trim()) {
      setSubmitError('Warehouse Receiver, Production Area, and Destination Warehouse are required.')
      return
    }
    if (items.length === 0) {
      setSubmitError('Scan at least one item before submitting.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase
      .from('transfer_headers')
      .update({
        warehouse_receiver: warehouseReceiver.trim(),
        production_area: productionArea.trim(),
        destination_warehouse: destinationWarehouse.trim(),
        remarks: remarks.trim() || null,
        status: 'submitted',
      })
      .eq('id', header.id)
    setSubmitting(false)

    if (error) {
      setSubmitError(error.message)
      return
    }

    navigate(`/transfers/${header.id}`, { replace: true })
  }

  async function handleCancelDraft() {
    if (!header) return navigate('/')
    if (items.length > 0) {
      const ok = window.confirm('Discard this transfer and its scanned items? This cannot be undone.')
      if (!ok) return
    }
    await supabase.from('transfer_headers').delete().eq('id', header.id)
    navigate('/')
  }

  if (initializing) {
    return (
      <Layout title="New Transfer">
        <div className="flex justify-center py-20">
          <Spinner className="h-7 w-7 text-ink-400" />
        </div>
      </Layout>
    )
  }

  if (initError || !header) {
    return (
      <Layout title="New Transfer">
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="Could not start a new transfer"
          description={initError ?? undefined}
          action={<Button onClick={() => void initDraft()}>Try again</Button>}
        />
      </Layout>
    )
  }

  return (
    <Layout title="New Transfer">
      <div className="flex flex-col gap-6 pb-24">
        {/* Auto-generated header info */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <HeaderStat label="Transfer Number" value={header.transfer_number} mono />
            <HeaderStat label="Date" value={header.transfer_date} />
            <HeaderStat label="Time Stamp" value={formatDateTime(header.created_at)} />
            <HeaderStat label="Prepared By" value={profile?.full_name ?? '—'} />
          </CardBody>
        </Card>

        {/* Transfer details form */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-ink-800">Transfer Details</h3>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Warehouse Receiver *"
              value={warehouseReceiver}
              onChange={(e) => setWarehouseReceiver(e.target.value)}
              onFocus={() => setFormFieldFocused(true)}
              onBlur={() => setFormFieldFocused(false)}
              placeholder="Name of receiving personnel"
            />
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
            <Input
              label="Remarks (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onFocus={() => setFormFieldFocused(true)}
              onBlur={() => setFormFieldFocused(false)}
              placeholder="Any notes for this transfer"
            />
          </CardBody>
        </Card>

        {/* Scan station */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <ScanLine size={16} className="text-signal-600" />
            <h3 className="text-sm font-semibold text-ink-800">Scan Items</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div>
              <label htmlFor="barcode" className="mb-1.5 block text-sm font-medium text-ink-700">
                Barcode
              </label>
              <input
                ref={barcodeRef}
                id="barcode"
                autoComplete="off"
                inputMode="none"
                value={barcodeValue}
                disabled={!!pendingProduct}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleBarcodeSubmit()
                  }
                }}
                placeholder="Scan or type a barcode, then press Enter"
                className="w-full rounded-xl border-2 border-ink-200 bg-ink-50 px-4 py-4 text-lg font-semibold tracking-wide text-ink-900 focus:border-signal-500 focus:bg-white disabled:opacity-60"
              />
              {scanBusy && <p className="mt-1 text-xs text-ink-400">Looking up product…</p>}
              {!pendingProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setManualSearchOpen((v) => !v)
                    setScanFeedback(null)
                  }}
                  className="mt-2 text-xs font-medium text-signal-600 hover:underline"
                >
                  {manualSearchOpen ? 'Hide item code search' : "Can't scan the barcode? Search by Item Code"}
                </button>
              )}
            </div>

            {manualSearchOpen && !pendingProduct && (
              <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
                <label htmlFor="manual-item-code" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Search by Item Code
                </label>
                <input
                  id="manual-item-code"
                  autoFocus
                  autoComplete="off"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="Start typing an item code…"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-signal-500"
                />
                {manualSearching && <p className="mt-2 text-xs text-ink-400">Searching…</p>}
                {!manualSearching && manualQuery.trim() && manualResults.length === 0 && (
                  <p className="mt-2 text-xs text-ink-400">No matching item codes found.</p>
                )}
                {manualResults.length > 0 && (
                  <div className="mt-3 divide-y divide-ink-200 overflow-hidden rounded-lg border border-ink-200 bg-white">
                    {manualResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-ink-50"
                      >
                        <span>
                          <span className="font-semibold text-ink-800">{p.item_code}</span>{' '}
                          <span className="text-ink-500">— {p.description}</span>
                        </span>
                        <span className="shrink-0 text-xs font-mono text-ink-400">{p.barcode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scanFeedback && (
              <div
                className={
                  scanFeedback.type === 'error'
                    ? 'flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'
                    : 'flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700'
                }
              >
                <AlertTriangle size={16} />
                {scanFeedback.message}
              </div>
            )}

            {pendingProduct && (
              <div className="scan-pulse rounded-xl border border-ok-500/30 bg-green-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-ok-600">
                  <CheckCircle2 size={18} />
                  <span className="text-sm font-semibold">Item Found</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Field label="Item Code" value={pendingProduct.item_code} />
                  <Field label="Description" value={pendingProduct.description} />
                  <Field label="UOM" value={pendingProduct.uom} />
                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-400">Quantity</p>
                    <input
                      ref={qtyRef}
                      type="number"
                      min="0.01"
                      step="any"
                      value={pendingQty}
                      onChange={(e) => setPendingQty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleAddItem()
                        }
                      }}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base font-semibold"
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => void handleAddItem()} disabled={addingItem} size="lg">
                    {addingItem ? 'Adding…' : 'Add Item'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPendingProduct(null)
                      window.setTimeout(() => barcodeRef.current?.focus(), 0)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Scanned items list */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">Scanned Items</h3>
            <Badge tone="info">{items.length} line(s)</Badge>
          </CardHeader>
          {items.length === 0 ? (
            <EmptyState title="No items scanned yet" description="Scan a barcode above to add the first item." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2">Item Code</th>
                    <th className="px-5 py-2">Description</th>
                    <th className="px-5 py-2">UOM</th>
                    <th className="px-5 py-2">Qty</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-medium text-ink-800">{item.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{item.description}</td>
                      <td className="px-5 py-3 text-ink-500">{item.uom}</td>
                      <td className="px-5 py-3 font-semibold text-ink-800">{item.quantity}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => void handleRemoveItem(item.id)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${item.item_code}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-ink-100 bg-white/95 px-4 py-3 backdrop-blur lg:pl-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            {submitError && <p className="truncate text-xs font-medium text-red-600">{submitError}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => void handleCancelDraft()}>
              Cancel
            </Button>
            <Button size="lg" onClick={() => void handleSubmitTransfer()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Transfer'}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function HeaderStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={mono ? 'font-mono text-sm font-semibold text-ink-900' : 'text-sm font-semibold text-ink-900'}>
        {value}
      </p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-400">{label}</p>
      <p className="font-semibold text-ink-900">{value}</p>
    </div>
  )
}
