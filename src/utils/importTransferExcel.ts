import * as XLSX from 'xlsx'

export interface ParsedTransferRow {
  row_number: number
  transfer_barcode: string
  item_code: string
  description: string
  uom: string
  transferred_quantity_raw: string
  // Optional — only needed if you also want to print pallet labels for
  // these transfers. Rows without these can still be imported and
  // received normally; they just can't be printed until re-uploaded
  // with this info filled in.
  destination_warehouse: string
  production_date_raw: string
  pallet_number: string
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
 *   | Destination Warehouse | Production Date | Pallet Number
 *
 * The last 3 columns are optional and only needed for label printing.
 */
export function parseTransferExcel(file: File): Promise<ParsedTransferRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })

        const rows: ParsedTransferRow[] = json.map((row, index) => {
          const normalized: Record<string, unknown> = {}
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key]
          }

          const rawDate = normalized['production date'] ?? normalized['production_date'] ?? ''
          const dateStr = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).trim()

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
            destination_warehouse: String(
              normalized['destination warehouse'] ?? normalized['destination_warehouse'] ?? normalized['destination'] ?? '',
            ).trim(),
            production_date_raw: dateStr,
            pallet_number: String(
              normalized['pallet number'] ?? normalized['pallet_number'] ?? normalized['pallet'] ?? '',
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
