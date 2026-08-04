import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { TransferImportBatch, TransferImportStagingRow } from '../lib/types'
import { parseTransferExcel } from '../utils/importTransferExcel'
import { formatDateTime } from '../utils/format'

// Excel rows are inserted in chunks so a large file doesn't hit request
// size limits in one shot.
const CHUNK_SIZE = 500

export default function TransferImport() {
  const [batches, setBatches] = useState<TransferImportBatch[]>([])
  const [loading, setLoading] = useState(true)

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

  const [detailBatch, setDetailBatch] = useState<TransferImportBatch | null>(null)
  const [detailRows, setDetailRows] = useState<TransferImportStagingRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    void loadBatches()
  }, [])

  async function loadBatches() {
    setLoading(true)
    const { data } = await supabase
      .from('transfer_import_batches')
      .select('*, users(full_name)')
      .order('uploaded_at', { ascending: false })
      .limit(100)
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      uploader_name: row.users?.full_name,
    })) as TransferImportBatch[]
    setBatches(mapped)
    setLoading(false)
  }

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    setUploadSummary(null)

    try {
      setUploadStage('Reading Excel file…')
      const rows = await parseTransferExcel(file)

      if (rows.length === 0) {
        setUploadError('The file has no data rows.')
        setUploading(false)
        setUploadStage(null)
        return
      }

      setUploadStage('Creating import batch…')
      const { data: batch, error: batchError } = await supabase
        .from('transfer_import_batches')
        .insert({ filename: file.name })
        .select()
        .single()

      if (batchError || !batch) {
        setUploadError(batchError?.message ?? 'Could not create the import batch.')
        setUploading(false)
        setUploadStage(null)
        return
      }

      setUploadStage(`Uploading ${rows.length} row(s) to staging…`)
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE).map((r) => ({
          import_batch_id: batch.id,
          row_number: r.row_number,
          transfer_barcode: r.transfer_barcode || null,
          item_code: r.item_code || null,
          description: r.description || null,
          uom: r.uom || null,
          transferred_quantity_raw: r.transferred_quantity_raw || null,
          destination_warehouse: r.destination_warehouse || null,
          production_date_raw: r.production_date_raw || null,
          pallet_number: r.pallet_number || null,
        }))
        const { error: stagingError } = await supabase.from('transfer_import_staging').insert(chunk)
        if (stagingError) {
          setUploadError(`Upload failed while staging rows: ${stagingError.message}`)
          setUploading(false)
          setUploadStage(null)
          return
        }
      }

      setUploadStage('Validating and importing…')
      const { data: summary, error: processError } = await supabase.rpc('process_transfer_import', {
        p_batch_id: batch.id,
      })

      if (processError) {
        setUploadError(processError.message)
        setUploading(false)
        setUploadStage(null)
        return
      }

      setUploadSummary(summary as any)
      await loadBatches()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setUploading(false)
      setUploadStage(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function openDetail(batch: TransferImportBatch, filter?: 'invalid' | 'duplicate') {
    setDetailBatch(batch)
    setDetailLoading(true)
    let query = supabase
      .from('transfer_import_staging')
      .select('*')
      .eq('import_batch_id', batch.id)
      .order('row_number')

    if (filter === 'invalid') query = query.eq('validation_status', 'invalid')
    if (filter === 'duplicate') query = query.in('validation_status', ['duplicate_in_file', 'duplicate_in_db'])

    const { data } = await query
    setDetailRows((data ?? []) as TransferImportStagingRow[])
    setDetailLoading(false)
  }

  return (
    <Layout title="Transfer Management">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-ink-800">Upload Transfer Excel</h3>
            <p className="mt-1 text-xs text-ink-400">
              Columns expected: Transfer Barcode, Item Code, Description, UOM, Transferred Quantity
              <br />
              Optional (needed only if you'll print pallet labels): Destination Warehouse, Production Date, Pallet
              Number
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
                  <span className="text-sm font-semibold">Import complete</span>
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
          <CardHeader>
            <h3 className="text-sm font-semibold text-ink-800">Upload History / Import Logs</h3>
          </CardHeader>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : batches.length === 0 ? (
            <EmptyState icon={<FileSpreadsheet size={32} />} title="No imports yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Import ID</th>
                    <th className="px-5 py-3">Filename</th>
                    <th className="px-5 py-3">Uploaded By</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Imported</th>
                    <th className="px-5 py-3">Failed</th>
                    <th className="px-5 py-3">Duplicate</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-600">{b.import_id}</td>
                      <td className="px-5 py-3 text-ink-700">{b.filename}</td>
                      <td className="px-5 py-3 text-ink-500">{b.uploader_name}</td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(b.uploaded_at)}</td>
                      <td className="px-5 py-3 text-ink-700">{b.total_records}</td>
                      <td className="px-5 py-3 text-ink-700">{b.successful_records}</td>
                      <td className="px-5 py-3">
                        {b.failed_records > 0 ? (
                          <button
                            onClick={() => void openDetail(b, 'invalid')}
                            className="font-medium text-red-600 hover:underline"
                          >
                            {b.failed_records}
                          </button>
                        ) : (
                          b.failed_records
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {b.duplicate_records > 0 ? (
                          <button
                            onClick={() => void openDetail(b, 'duplicate')}
                            className="font-medium text-amber-600 hover:underline"
                          >
                            {b.duplicate_records}
                          </button>
                        ) : (
                          b.duplicate_records
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={b.status === 'completed' ? 'success' : b.status === 'processing' ? 'neutral' : 'warning'}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Button variant="ghost" size="sm" onClick={() => void openDetail(b)}>
                          View all
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
        open={!!detailBatch}
        onClose={() => setDetailBatch(null)}
        title={`Import Detail — ${detailBatch?.import_id ?? ''}`}
        footer={
          <Button variant="secondary" onClick={() => setDetailBatch(null)}>
            Close
          </Button>
        }
      >
        {detailLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-ink-400" />
          </div>
        ) : detailRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-400">No rows to show.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left font-semibold uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-2">Row</th>
                  <th className="py-2 pr-2">Transfer Barcode</th>
                  <th className="py-2 pr-2">Item Code</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {detailRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-ink-500">{r.row_number}</td>
                    <td className="py-2 pr-2 font-mono text-ink-700">{r.transfer_barcode || '—'}</td>
                    <td className="py-2 pr-2 text-ink-700">{r.item_code || '—'}</td>
                    <td className="py-2 pr-2">
                      <Badge tone={r.validation_status === 'valid' ? 'success' : 'danger'}>
                        {r.validation_status ?? 'pending'}
                      </Badge>
                    </td>
                    <td className="py-2 text-ink-500">{(r.validation_errors ?? []).join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
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
