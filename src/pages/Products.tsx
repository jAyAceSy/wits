import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Package, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'
import { parseProductsExcel } from '../utils/importExcel'

const emptyForm = { barcode: '', item_code: '', description: '', uom: '' }
const PAGE_SIZE = 100

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [importBusy, setImportBusy] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Loads one page directly from the database — search is applied as a
  // real query (not a client-side filter), so it can find any product
  // regardless of which page it would normally fall on.
  const load = useCallback(async (targetPage: number, term: string) => {
    setLoading(true)
    const from = targetPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('item_code')
      .range(from, to)

    const q = term.trim()
    if (q) {
      query = query.or(`barcode.ilike.%${q}%,item_code.ilike.%${q}%,description.ilike.%${q}%`)
    }

    const { data, count } = await query
    setProducts((data ?? []) as Product[])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [])

  // Debounce search input so we don't fire a query on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0)
      void load(0, search)
    }, 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    void load(page, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({ barcode: p.barcode, item_code: p.item_code, description: p.description, uom: p.uom })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.barcode.trim() || !form.item_code.trim() || !form.description.trim() || !form.uom.trim()) {
      setFormError('All fields are required.')
      return
    }
    setSaving(true)
    setFormError(null)

    const payload = {
      barcode: form.barcode.trim(),
      item_code: form.item_code.trim(),
      description: form.description.trim(),
      uom: form.uom.trim(),
    }

    const { error } = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload)

    setSaving(false)

    if (error) {
      setFormError(error.code === '23505' ? 'That barcode is already registered.' : error.message)
      return
    }

    setModalOpen(false)
    await load(page, search)
  }

  async function handleDelete(p: Product) {
    const ok = window.confirm(`Delete product "${p.item_code}"? This cannot be undone.`)
    if (!ok) return
    await supabase.from('products').delete().eq('id', p.id)
    await load(page, search)
  }

  async function handleToggleActive(p: Product) {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    await load(page, search)
  }

  async function handleImportFile(file: File) {
    setImportBusy(true)
    setImportSummary(null)
    try {
      const rows = await parseProductsExcel(file)
      if (rows.length === 0) {
        setImportSummary('No valid rows found. Expect columns: Barcode, Item Code, Description, UOM.')
        setImportBusy(false)
        return
      }
      const { error, count } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'barcode', count: 'exact' })
      setImportBusy(false)
      if (error) {
        setImportSummary(`Import failed: ${error.message}`)
      } else {
        setImportSummary(`Imported/updated ${count ?? rows.length} product(s).`)
        setPage(0)
        await load(0, search)
      }
    } catch (err) {
      setImportBusy(false)
      setImportSummary(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
  const rangeEnd = Math.min(totalCount, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Layout title="Products">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search barcode, item code, description…"
              className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-signal-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importBusy}>
              <Upload size={16} /> {importBusy ? 'Importing…' : 'Import from Excel'}
            </Button>
            <Button onClick={openAdd}>
              <Plus size={16} /> Add Product
            </Button>
          </div>
        </div>

        {importSummary && (
          <p className="rounded-lg bg-ink-100 px-4 py-2 text-sm text-ink-700">{importSummary}</p>
        )}

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : products.length === 0 ? (
            <EmptyState icon={<Package size={32} />} title="No products found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Barcode</th>
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">UOM</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">{p.barcode}</td>
                      <td className="px-5 py-3 font-medium text-ink-800">{p.item_code}</td>
                      <td className="px-5 py-3 text-ink-600">{p.description}</td>
                      <td className="px-5 py-3 text-ink-500">{p.uom}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => void handleToggleActive(p)}>
                          <Badge tone={p.is_active ? 'success' : 'neutral'}>
                            {p.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            Edit
                          </Button>
                          <button
                            onClick={() => void handleDelete(p)}
                            className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${p.item_code}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3">
              <p className="text-xs text-ink-400">
                Showing {rangeStart}–{rangeEnd} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <span className="text-xs font-medium text-ink-500">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Product' : 'Add Product'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Barcode"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          />
          <Input
            label="Item Code"
            value={form.item_code}
            onChange={(e) => setForm({ ...form, item_code: e.target.value })}
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input label="UOM" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
          {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}
        </div>
      </Modal>
    </Layout>
  )
}
