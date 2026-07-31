import * as XLSX from 'xlsx'

export interface ImportedProductRow {
  barcode: string
  item_code: string
  description: string
  uom: string
}

/**
 * Reads an .xlsx/.csv file and maps it to product rows.
 * Expected header row (case-insensitive): Barcode | Item Code | Description | UOM
 */
export function parseProductsExcel(file: File): Promise<ImportedProductRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })

        const rows: ImportedProductRow[] = json.map((row) => {
          const normalized: Record<string, unknown> = {}
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key]
          }
          return {
            barcode: String(normalized['barcode'] ?? '').trim(),
            item_code: String(normalized['item code'] ?? normalized['item_code'] ?? '').trim(),
            description: String(normalized['description'] ?? '').trim(),
            uom: String(normalized['uom'] ?? '').trim(),
          }
        })

        // Excel files often contain the same barcode more than once (typos,
        // re-exports, etc). Postgres's ON CONFLICT DO UPDATE cannot touch
        // the same row twice in one statement, so we dedupe here — the
        // last occurrence of a given barcode in the file wins.
        const filtered = rows.filter((r) => r.barcode && r.item_code)
        const deduped = Array.from(new Map(filtered.map((r) => [r.barcode, r])).values())
        resolve(deduped)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not parse the file.'))
      }
    }
    reader.readAsBinaryString(file)
  })
}
