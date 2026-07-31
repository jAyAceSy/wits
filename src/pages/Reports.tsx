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
  transfer_number: string
  transfer_date: string
  created_at: string
  warehouse_receiver: string
  production_area: string
  destination_warehouse: string
  total_items: number
  total_qty: number
  creator_name: string
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
      .from('transfer_headers')
      .select(
        'transfer_number, transfer_date, created_at, warehouse_receiver, production_area, destination_warehouse, total_items, total_qty, creator:users!created_by(full_name)',
      )
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })

    if (reportType === 'daily') {
      query = query.eq('transfer_date', date)
    } else if (reportType === 'monthly') {
      const start = `${month}-01`
      const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10)
      query = query.gte('transfer_date', start).lt('transfer_date', end)
    } else if (reportType === 'user') {
      if (!userId) {
        setRows([])
        setLoading(false)
        return
      }
      query = query.eq('created_by', userId)
    }

    const { data } = await query
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      creator_name: row.creator?.full_name ?? '',
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
        'Transfer #': r.transfer_number,
        Date: r.transfer_date,
        'Prepared By': r.creator_name,
        'Production Area': r.production_area,
        'Destination Warehouse': r.destination_warehouse,
        'Warehouse Receiver': r.warehouse_receiver,
        'Total Items': r.total_items,
        'Total Qty': r.total_qty,
      })),
    )
  }

  function handleExportPdf() {
    exportToPdf(
      reportTitle.replace(/\s+/g, '_'),
      reportTitle,
      ['Transfer #', 'Date', 'Prepared By', 'Production Area', 'Destination', 'Items', 'Qty'],
      rows.map((r) => [
        r.transfer_number,
        r.transfer_date,
        r.creator_name,
        r.production_area,
        r.destination_warehouse,
        r.total_items,
        r.total_qty,
      ]),
    )
  }

  const totalItems = rows.reduce((s, r) => s + Number(r.total_items || 0), 0)
  const totalQty = rows.reduce((s, r) => s + Number(r.total_qty || 0), 0)

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
              {rows.length} transfer(s) · {totalItems} items · {totalQty} qty
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
                    <th className="px-5 py-3">Transfer #</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Prepared By</th>
                    <th className="px-5 py-3">Production Area</th>
                    <th className="px-5 py-3">Destination</th>
                    <th className="px-5 py-3">Items</th>
                    <th className="px-5 py-3">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((r) => (
                    <tr key={r.transfer_number}>
                      <td className="px-5 py-3 font-medium text-ink-800">{r.transfer_number}</td>
                      <td className="px-5 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                      <td className="px-5 py-3 text-ink-600">{r.creator_name}</td>
                      <td className="px-5 py-3 text-ink-600">{r.production_area}</td>
                      <td className="px-5 py-3 text-ink-600">{r.destination_warehouse}</td>
                      <td className="px-5 py-3 text-ink-800">{r.total_items}</td>
                      <td className="px-5 py-3 text-ink-800">{r.total_qty}</td>
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
