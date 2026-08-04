import { useEffect, useState } from 'react'
import { FileBarChart, FileSpreadsheet, FileText } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../lib/types'
import { formatDateTime, todayIsoDate } from '../utils/format'
import { exportToExcel, exportToPdf } from '../utils/export'

type ReportType = 'daily' | 'monthly' | 'user'

interface ReportRow {
  transfer_barcode: string
  created_at: string
  item_code: string
  description: string
  transferred_quantity: number
  received_quantity: number | null
  variance: number | null
  status: string
  entry_type: string
  receiver_name: string
}

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('daily')
  const [date, setDate] = useState(todayIsoDate())
  const [month, setMonth] = useState(todayIsoDate().slice(0, 7))
  const [userId, setUserId] = useState('')
  const [users, setUsers] = useState<AppUser[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  useEffect(() => {
    void supabase
      .from('users')
      .select('*')
      .order('full_name')
      .then(({ data }) => setUsers((data ?? []) as AppUser[]))
  }, [])

  async function runReport() {
    setLoading(true)
    setRan(true)

    let query = supabase
      .from('transfer_master')
      .select(
        'transfer_barcode, created_at, item_code, description, transferred_quantity, received_quantity, variance, status, entry_type, receiver:users!received_by(full_name)',
      )
      .order('created_at', { ascending: false })

    if (reportType === 'daily') {
      query = query.gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59.999`)
    } else if (reportType === 'monthly') {
      const start = `${month}-01`
      const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10)
      query = query.gte('created_at', `${start}T00:00:00`).lt('created_at', `${end}T00:00:00`)
    } else if (reportType === 'user') {
      if (!userId) {
        setRows([])
        setLoading(false)
        return
      }
      query = query.eq('received_by', userId)
    }

    const { data } = await query
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      receiver_name: row.receiver?.full_name ?? '',
    })) as ReportRow[]
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    void runReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reportTitle =
    reportType === 'daily'
      ? `Daily Transfer Report – ${date}`
      : reportType === 'monthly'
        ? `Monthly Transfer Report – ${month}`
        : `User Transfer History – ${users.find((u) => u.id === userId)?.full_name ?? ''}`

  function handleExportExcel() {
    exportToExcel(
      reportTitle.replace(/\s+/g, '_'),
      'Report',
      rows.map((r) => ({
        'Transfer Barcode': r.transfer_barcode,
        Date: formatDateTime(r.created_at),
        'Received By': r.receiver_name,
        'Item Code': r.item_code,
        Description: r.description,
        'Transferred Qty': r.transferred_quantity,
        'Received Qty': r.received_quantity ?? '',
        Variance: r.variance ?? '',
        Status: r.status,
        Type: r.entry_type === 'transfer_barcode' ? 'Transfer Barcode' : 'Manual',
      })),
    )
  }

  function handleExportPdf() {
    exportToPdf(
      reportTitle.replace(/\s+/g, '_'),
      reportTitle,
      ['Transfer Barcode', 'Date', 'Received By', 'Item Code', 'Transferred', 'Received', 'Variance', 'Status'],
      rows.map((r) => [
        r.transfer_barcode,
        formatDateTime(r.created_at),
        r.receiver_name,
        r.item_code,
        r.transferred_quantity,
        r.received_quantity ?? '',
        r.variance ?? '',
        r.status,
      ]),
    )
  }

  const totalTransferred = rows.reduce((s, r) => s + Number(r.transferred_quantity || 0), 0)
  const totalReceived = rows.reduce((s, r) => s + Number(r.received_quantity || 0), 0)

  return (
    <Layout title="Reports">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-ink-800">Generate Report</h3>
          </CardHeader>
          <CardBody className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <Select label="Report Type" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
                <option value="daily">Daily Transfer Report</option>
                <option value="monthly">Monthly Transfer Report</option>
                <option value="user">User Transfer History</option>
              </Select>
            </div>

            {reportType === 'daily' && (
              <div className="w-48">
                <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            {reportType === 'monthly' && (
              <div className="w-48">
                <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            )}
            {reportType === 'user' && (
              <div className="w-56">
                <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Select a user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <Button onClick={() => void runReport()}>Run Report</Button>

            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={handleExportExcel} disabled={rows.length === 0}>
                <FileSpreadsheet size={16} /> Excel
              </Button>
              <Button variant="secondary" onClick={handleExportPdf} disabled={rows.length === 0}>
                <FileText size={16} /> PDF
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">{reportTitle}</h3>
            <span className="text-xs font-medium text-ink-400">
              {rows.length} record(s) · {totalTransferred} transferred · {totalReceived} received
            </span>
          </CardHeader>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : !ran || rows.length === 0 ? (
            <EmptyState icon={<FileBarChart size={32} />} title="No data for this filter" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Transfer Barcode</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Received By</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Transferred</th>
                    <th className="px-5 py-3">Received</th>
                    <th className="px-5 py-3">Variance</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((r) => (
                    <tr key={r.transfer_barcode}>
                      <td className="px-5 py-3 font-mono text-xs text-ink-700">{r.transfer_barcode}</td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                      <td className="px-5 py-3 text-ink-600">{r.receiver_name}</td>
                      <td className="px-5 py-3 text-ink-600">{r.item_code}</td>
                      <td className="px-5 py-3 text-ink-800">{r.transferred_quantity}</td>
                      <td className="px-5 py-3 text-ink-800">{r.received_quantity ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-800">{r.variance ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-600">{r.status}</td>
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
