import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, FileSpreadsheet, History, Printer, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/layout/Layout'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { PrintableTransferRecord, LabelPrintHistoryEntry } from '../lib/types'
import { PrintLabelSheet } from '../components/PrintLabelSheet'
import { PalletLabelCard } from '../components/PalletLabelCard'
import { formatDateTime } from '../utils/format'

const COMPANY_NAME = 'SCPA Hygiene Products Inc.'

type Tab = 'records' | 'history'

interface Row extends PrintableTransferRecord {
  isReady: boolean // has everything needed to print
}

export default function PalletLabelPrinting() {
  const [tab, setTab] = useState<Tab>('records')

  const [records, setRecords] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [previewRecord, setPreviewRecord] = useState<Row | null>(null)
  const [printerName, setPrinterName] = useState('Honeywell PD43')

  const [printQueue, setPrintQueue] = useState<Row[] | null>(null)
  const [printQueueIsReprint, setPrintQueueIsReprint] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [printFeedback, setPrintFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [history, setHistory] = useState<LabelPrintHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')

  useEffect(() => {
    void loadRecords()
  }, [])

  useEffect(() => {
    if (tab === 'history') void loadHistory()
  }, [tab, historySearch])

  useEffect(() => {
    if (!printQueue || printQueue.length === 0) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => window.print())
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [printQueue])

  useEffect(() => {
    async function handleAfterPrint() {
      if (!printQueue || printQueue.length === 0) return
      setPrintBusy(true)
      let failures = 0
      for (const r of printQueue) {
        const { error } = await supabase.rpc('record_label_print', {
          p_transfer_barcode: r.transfer_barcode,
          p_printer_name: printerName || null,
          p_is_reprint: printQueueIsReprint,
        })
        if (error) failures++
      }
      setPrintBusy(false)
      setPrintFeedback(
        failures === 0
          ? { type: 'success', message: `${printQueue.length} label(s) sent to printer successfully.` }
          : { type: 'error', message: `${printQueue.length - failures} of ${printQueue.length} logged; ${failures} failed to record.` },
      )
      setPrintQueue(null)
      setSelected(new Set())
      await loadRecords()
    }

    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printQueue, printQueueIsReprint, printerName])

  async function loadRecords() {
    setLoading(true)
    // Same table Production already uploads via Transfer Management —
    // no separate upload here. Ad-hoc (manual, no Transfer Barcode)
    // entries are excluded since there's no pallet to label.
    const { data } = await supabase
      .from('transfer_master')
      .select('*')
      .eq('entry_type', 'transfer_barcode')
      .order('created_at', { ascending: false })
      .limit(500)

    const mapped: Row[] = (data ?? []).map((r: any) => ({
      id: r.id,
      transfer_barcode: r.transfer_barcode,
      item_code: r.item_code,
      description: r.description,
      quantity: r.transferred_quantity,
      uom: r.uom,
      destination_warehouse: r.destination_warehouse ?? '',
      production_date: r.production_date ?? '',
      pallet_number: r.pallet_number ?? '',
      finisher: r.finisher ?? '',
      qc: r.qc ?? '',
      print_count: r.print_count ?? 0,
      last_printed_at: r.last_printed_at ?? null,
      isReady: !!(r.destination_warehouse && r.production_date && r.pallet_number),
    }))
    setRecords(mapped)
    setLoading(false)
  }

  async function loadHistory() {
    setHistoryLoading(true)
    let query = supabase
      .from('label_print_history')
      .select('*, users(full_name)')
      .order('printed_at', { ascending: false })
      .limit(200)
    if (historySearch.trim()) query = query.ilike('transfer_barcode', `%${historySearch.trim()}%`)
    const { data } = await query
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      printer_user_name: row.users?.full_name,
    })) as LabelPrintHistoryEntry[]
    setHistory(mapped)
    setHistoryLoading(false)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.filter((r) => r.isReady).map((r) => r.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function handlePrintSelected() {
    const toPrint = filtered.filter((r) => selected.has(r.id) && r.isReady)
    if (toPrint.length === 0) return
    setPrintFeedback(null)
    setPrintQueueIsReprint(toPrint.some((r) => r.print_count > 0))
    setPrintQueue(toPrint)
  }

  function handlePrintAll() {
    const readyOnes = filtered.filter((r) => r.isReady)
    if (readyOnes.length === 0) return
    const skipped = filtered.length - readyOnes.length
    const ok = window.confirm(
      `Print ${readyOnes.length} label(s)?` +
        (skipped > 0 ? ` (${skipped} shown row(s) are missing label info and will be skipped.)` : ''),
    )
    if (!ok) return
    setPrintFeedback(null)
    setPrintQueueIsReprint(readyOnes.some((r) => r.print_count > 0))
    setPrintQueue(readyOnes)
  }

  function handleReprintOne(record: Row) {
    if (!record.isReady) return
    setPrintFeedback(null)
    setPrintQueueIsReprint(true)
    setPrintQueue([record])
  }

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      r.transfer_barcode.toLowerCase().includes(q) ||
      r.item_code.toLowerCase().includes(q) ||
      r.pallet_number.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  })

  return (
    <Layout title="Transfer Barcode Label Printing">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('records')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'records' ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 border border-ink-200'
            }`}
          >
            Transfer Records
          </button>
          <button
            onClick={() => setTab('history')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'history' ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 border border-ink-200'
            }`}
          >
            Print History
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-ink-100 px-4 py-2.5 text-xs text-ink-600">
          <FileSpreadsheet size={14} />
          These records come from Production's Transfer Excel upload —{' '}
          <Link to="/transfer-management" className="font-medium text-signal-600 hover:underline">
            go to Transfer Management
          </Link>{' '}
          to upload or add more.
        </div>

        {printFeedback && (
          <div
            className={
              printFeedback.type === 'success'
                ? 'flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-ok-600'
                : 'flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'
            }
          >
            {printFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {printFeedback.message}
          </div>
        )}

        {tab === 'records' && (
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink-800">Transfer Records ({filtered.length})</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search barcode, item, pallet…"
                    className="w-56 rounded-lg border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-signal-500"
                  />
                </div>
                <div className="w-40">
                  <input
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    placeholder="Printer name"
                    className="w-full rounded-lg border border-ink-200 bg-white py-1.5 px-3 text-xs focus:border-signal-500"
                    title="Self-reported for the print log — the browser can't detect which printer the OS dialog actually used."
                  />
                </div>
              </div>
            </CardHeader>

            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3">
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="secondary" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
              <span className="text-xs font-medium text-ink-500">Selected: {selected.size}</span>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={handlePrintAll} disabled={filtered.length === 0 || printBusy}>
                  Print All
                </Button>
                <Button size="sm" onClick={handlePrintSelected} disabled={selected.size === 0 || printBusy}>
                  <Printer size={14} /> Print Selected ({selected.size})
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-14">
                <Spinner className="h-6 w-6 text-ink-400" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<FileSpreadsheet size={32} />} title="No transfer records yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                      <th className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.size > 0 && filtered.filter((r) => r.isReady).every((r) => selected.has(r.id))}
                          onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                        />
                      </th>
                      <th className="px-3 py-3">Transfer Barcode</th>
                      <th className="px-3 py-3">Item Code</th>
                      <th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3">Qty</th>
                      <th className="px-3 py-3">UOM</th>
                      <th className="px-3 py-3">Destination</th>
                      <th className="px-3 py-3">Prod. Date</th>
                      <th className="px-3 py-3">Pallet</th>
                      <th className="px-3 py-3">Finisher</th>
                      <th className="px-3 py-3">QC</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {filtered.map((r) => (
                      <tr key={r.id} className={selected.has(r.id) ? 'bg-signal-50/40' : 'hover:bg-ink-50'}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            disabled={!r.isReady}
                            onChange={() => toggleSelect(r.id)}
                          />
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-ink-700">{r.transfer_barcode}</td>
                        <td className="px-3 py-3 font-medium text-ink-800">{r.item_code}</td>
                        <td className="px-3 py-3 text-ink-600">{r.description}</td>
                        <td className="px-3 py-3 text-ink-700">{r.quantity}</td>
                        <td className="px-3 py-3 text-ink-500">{r.uom}</td>
                        <td className="px-3 py-3 text-ink-600">{r.destination_warehouse || '—'}</td>
                        <td className="px-3 py-3 text-ink-500">{r.production_date || '—'}</td>
                        <td className="px-3 py-3 text-ink-600">{r.pallet_number || '—'}</td>
                        <td className="px-3 py-3 text-ink-600">{r.finisher || '—'}</td>
                        <td className="px-3 py-3 text-ink-600">{r.qc || '—'}</td>
                        <td className="px-3 py-3">
                          {!r.isReady ? (
                            <Badge tone="danger">Missing label info</Badge>
                          ) : (
                            <Badge tone={r.print_count === 0 ? 'neutral' : r.print_count === 1 ? 'success' : 'warning'}>
                              {r.print_count === 0 ? 'Not Printed' : r.print_count === 1 ? 'Printed' : `Reprinted (${r.print_count})`}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPreviewRecord(r)}
                              disabled={!r.isReady}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                              aria-label="Preview label"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleReprintOne(r)}
                              disabled={printBusy || !r.isReady}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-signal-600 disabled:opacity-30"
                              aria-label="Reprint label"
                              title={r.isReady ? 'Reprint' : 'Missing Destination Warehouse / Production Date / Pallet Number'}
                            >
                              <Printer size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'history' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-800">Print History</h3>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by Transfer Barcode"
                    className="w-64 rounded-lg border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-signal-500"
                  />
                </div>
              </div>
            </CardHeader>
            {historyLoading ? (
              <div className="flex justify-center py-14">
                <Spinner className="h-6 w-6 text-ink-400" />
              </div>
            ) : history.length === 0 ? (
              <EmptyState icon={<History size={32} />} title="No print history yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                      <th className="px-5 py-3">Transfer Barcode</th>
                      <th className="px-5 py-3">Printed By</th>
                      <th className="px-5 py-3">Date / Time</th>
                      <th className="px-5 py-3">Printer</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-5 py-3 font-mono text-xs text-ink-700">{h.transfer_barcode}</td>
                        <td className="px-5 py-3 text-ink-600">{h.printer_user_name ?? '—'}</td>
                        <td className="px-5 py-3 text-ink-500">{formatDateTime(h.printed_at)}</td>
                        <td className="px-5 py-3 text-ink-500">{h.printer_name ?? '—'}</td>
                        <td className="px-5 py-3">
                          <Badge tone="success">{h.print_status}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          {h.is_reprint ? <Badge tone="warning">Reprint</Badge> : <Badge tone="neutral">First print</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal
        open={!!previewRecord}
        onClose={() => setPreviewRecord(null)}
        title={`Label Preview — ${previewRecord?.transfer_barcode ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreviewRecord(null)}>
              Close
            </Button>
            {previewRecord && (
              <Button
                onClick={() => {
                  const r = previewRecord
                  setPreviewRecord(null)
                  handleReprintOne(r)
                }}
              >
                <Printer size={14} /> Print This Label
              </Button>
            )}
          </>
        }
      >
        {previewRecord && (
          <div className="flex justify-center overflow-auto rounded-lg border border-ink-200 bg-ink-50 p-4">
            <div style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
              <PalletLabelCard record={previewRecord} companyName={COMPANY_NAME} />
            </div>
          </div>
        )}
      </Modal>

      {printQueue && <PrintLabelSheet records={printQueue} companyName={COMPANY_NAME} />}
    </Layout>
  )
}
