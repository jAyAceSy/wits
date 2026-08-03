import * as XLSX from 'xlsx'

export interface ParsedTransferRow {
  row_number: number
  transfer_barcode: string
  item_code: string
  description: string
  uom: string
  transferred_quantity_raw: string
}

/**
 * Reads an .xlsx/.xls/.csv file and maps it to raw transfer rows, ready
 * to be inserted into transfer_import_staging as-is (including blank or
 * malformed rows) — validation happens server-side in
 * process_transfer_import(), not here. This function only reshapes the
 * spreadsheet into a consistent structure; it does not decide what's
 * valid.
 *
 * Expected header row (case-insensitive):
 *   Transfer Barcode | Item Code | Description | UOM | Transferred Quantity
 */
export function parseTransferExcel(file: File): Promise<ParsedTransferRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })

        const rows: ParsedTransferRow[] = json.map((row, index) => {
          const normalized: Record<string, unknown> = {}
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key]
          }
          return {
            row_number: index + 1,
            transfer_barcode: String(
              normalized['transfer barcode'] ?? normalized['transfer_barcode'] ?? '',
            ).trim(),
            item_code: String(normalized['item code'] ?? normalized['item_code'] ?? '').trim(),
            description: String(normalized['description'] ?? '').trim(),
            uom: String(normalized['uom'] ?? '').trim(),
            transferred_quantity_raw: String(
              normalized['transferred quantity'] ?? normalized['transferred_quantity'] ?? '',
            ).trim(),
          }
        })

        resolve(rows)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not parse the file.'))
      }
    }
    reader.readAsBinaryString(file)
  })
}
