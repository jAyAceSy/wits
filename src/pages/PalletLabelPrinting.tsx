import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  History,
  Printer,
  Search,
  Upload,
} from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { PalletLabel, PalletLabelBatch, LabelPrintHistoryEntry } from '../lib/types'
import { parsePalletLabelExcel } from '../utils/importPalletLabelExcel'
import { PrintLabelSheet } from '../components/PrintLabelSheet'
import { PalletLabelCard } from '../components/PalletLabelCard'
import { formatDateTime } from '../utils/format'

const CHUNK_SIZE = 500
const COMPANY_NAME = 'SCPA Hygiene Products Inc.'

type Tab = 'records' | 'history'

export default function PalletLabelPrinting() {
  const [tab, setTab] = useState<Tab>('records')

  // Records grid
  const [records, setRecords] = useState<PalletLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadStage, setUploadStage] = useState<string | null>(null)
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    valid: number
    invalid: number
    duplicate_in_file: number
    duplicate_in_db: number
  } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Preview
  const [previewRecord, setPreviewRecord] = useState<PalletLabel | null>(null)

  // Printer name (self-reported — a browser can't detect which printer
  // the OS dialog actually used)
  const [printerName, setPrinterName] = useState('Honeywell PD43')

  // Print flow
  const [printQueue, setPrintQueue] = useState<PalletLabel[] | null>(null)
  const [printQueueIsReprint, setPrintQueueIsReprint] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [printFeedback, setPrintFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Print history
  const [history, setHistory] = useState<LabelPrintHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')

  useEffect(() => {
    void loadRecords()
  }, [])

  useEffect(() => {
    if (tab === 'history') void loadHistory()
  }, [tab, historySearch])

  // Fire the OS print dialog once the hidden label sheet has actually
  // painted (canvases need a frame to draw the barcodes).
  useEffect(() => {
    if (!printQueue || printQueue.length === 0) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.print()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [printQueue])

  // We can't know from JS whether the user actually clicked Print or
  // Cancel in the OS dialog — `afterprint` fires either way in most
  // browsers. So this records "sent to printer", which is the most
  // honest claim a web page can make.
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
    const { data } = await supabase.from('pallet_labels').select('*').order('created_at', { ascending: false }).limit(500)
    setRecords((data ?? []) as PalletLabel[])
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

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    setUploadSummary(null)

    try {
      setUploadStage('Reading Excel file…')
      const rows = await parsePalletLabelExcel(file)
      if (rows.length === 0) {
        setUploadError('The file has no data rows.')
        return
      }

      setUploadStage('Creating import batch…')
      const { data: batch, error: batchError } = await supabase
        .from('pallet_label_batches')
        .insert({ filename: file.name })
        .select()
        .single()

      if (batchError || !batch) {
        setUploadError(batchError?.message ?? 'Could not create the import batch.')
        return
      }

      setUploadStage(`Uploading ${rows.length} row(s) to staging…`)
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE).map((r) => ({
          batch_id: batch.id,
          row_number: r.row_number,
          transfer_barcode: r.transfer_barcode || null,
          item_code: r.item_code || null,
          description: r.description || null,
          quantity_raw: r.quantity_raw || null,
          uom: r.uom || null,
          destination_warehouse: r.destination_warehouse || null,
          production_date_raw: r.production_date_raw || null,
          pallet_number: r.pallet_number || null,
        }))
        const { error: stagingError } = await supabase.from('pallet_label_staging').insert(chunk)
        if (stagingError) {
          setUploadError(`Upload failed while staging rows: ${stagingError.message}`)
          return
        }
      }

      setUploadStage('Validating and importing…')
      const { data: summary, error: processError } = await supabase.rpc('process_pallet_label_import', {
        p_batch_id: batch.id,
      })
      if (processError) {
        setUploadError(processError.message)
        return
      }

      setUploadSummary(summary as any)
      await loadRecords()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setUploading(false)
      setUploadStage(null)
      if (fileRef.current) fileRef.current.value = ''
    }
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
    setSelected(new Set(filtered.map((r) => r.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function handlePrintSelected() {
    const toPrint = filtered.filter((r) => selected.has(r.id))
    if (toPrint.length === 0) return
    setPrintFeedback(null)
    setPrintQueueIsReprint(toPrint.some((r) => r.print_count > 0))
    setPrintQueue(toPrint)
  }

  function handlePrintAll() {
    if (filtered.length === 0) return
    const ok = window.confirm(`Print all ${filtered.length} label(s) currently shown? This will send them to your printer as one job.`)
    if (!ok) return
    setPrintFeedback(null)
    setPrintQueueIsReprint(filtered.some((r) => r.print_count > 0))
    setPrintQueue(filtered)
  }

  function handleReprintOne(record: PalletLabel) {
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
          <>
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-ink-800">Upload Transfer Excel</h3>
                <p className="mt-1 text-xs text-ink-400">
                  Columns expected: Transfer Barcode, Item Code, Description, Qty, UOM, Destination Warehouse,
                  Production Date, Pallet Number
                </p>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleFile(file)
                    }}
                  />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="lg">
                    <Upload size={18} /> {uploading ? uploadStage ?? 'Uploading…' : 'Choose Excel File'}
                  </Button>
                </div>

                {uploadError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    <AlertTriangle size={16} /> {uploadError}
                  </div>
                )}

                {uploadSummary && (
                  <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-ok-600">
                      <CheckCircle2 size={16} />
                      <span className="text-sm font-semibold">Import complete — {uploadSummary.valid} pallet(s) imported</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                      <SummaryStat label="Total Records" value={uploadSummary.total} />
                      <SummaryStat label="Imported" value={uploadSummary.valid} tone="success" />
                      <SummaryStat label="Invalid" value={uploadSummary.invalid} tone="danger" />
                      <SummaryStat label="Duplicate (file)" value={uploadSummary.duplicate_in_file} tone="warning" />
                      <SummaryStat label="Duplicate (DB)" value={uploadSummary.duplicate_in_db} tone="warning" />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

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
                            checked={selected.size > 0 && filtered.every((r) => selected.has(r.id))}
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
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {filtered.map((r) => (
                        <tr key={r.id} className={selected.has(r.id) ? 'bg-signal-50/40' : 'hover:bg-ink-50'}>
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-ink-700">{r.transfer_barcode}</td>
                          <td className="px-3 py-3 font-medium text-ink-800">{r.item_code}</td>
                          <td className="px-3 py-3 text-ink-600">{r.description}</td>
                          <td className="px-3 py-3 text-ink-700">{r.quantity}</td>
                          <td className="px-3 py-3 text-ink-500">{r.uom}</td>
                          <td className="px-3 py-3 text-ink-600">{r.destination_warehouse}</td>
                          <td className="px-3 py-3 text-ink-500">{r.production_date}</td>
                          <td className="px-3 py-3 text-ink-600">{r.pallet_number}</td>
                          <td className="px-3 py-3">
                            <Badge tone={r.print_count === 0 ? 'neutral' : r.print_count === 1 ? 'success' : 'warning'}>
                              {r.print_count === 0 ? 'Imported' : r.print_count === 1 ? 'Printed' : `Reprinted (${r.print_count})`}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setPreviewRecord(r)}
                                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                                aria-label="Preview label"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => handleReprintOne(r)}
                                disabled={printBusy}
                                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-signal-600"
                                aria-label="Reprint label"
                                title="Reprint"
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
          </>
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

      {/* Preview modal */}
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

      {/* Hidden print sheet — only populated while an actual print job is in flight */}
      {printQueue && <PrintLabelSheet records={printQueue} companyName={COMPANY_NAME} />}
    </Layout>
  )
}

function SummaryStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'success' | 'danger' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-ok-600'
      : tone === 'danger'
        ? 'text-red-600'
        : tone === 'warning'
          ? 'text-amber-600'
          : 'text-ink-800'
  return (
    <div>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
      <p className="text-[11px] font-medium text-ink-400">{label}</p>
    </div>
  )
}
