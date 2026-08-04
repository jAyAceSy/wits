import * as XLSX from 'xlsx'

export interface ParsedPalletLabelRow {
  row_number: number
  transfer_barcode: string
  item_code: string
  description: string
  quantity_raw: string
  uom: string
  destination_warehouse: string
  production_date_raw: string
  pallet_number: string
}

/**
 * Reads an .xlsx/.xls/.csv file and maps it to raw pallet label rows.
 * Validation happens server-side in process_pallet_label_import() — this
 * function only reshapes the spreadsheet into a consistent structure.
 *
 * Expected header row (case-insensitive):
 *   Transfer Barcode | Item Code | Description | Qty | UOM |
 *   Destination Warehouse | Production Date | Pallet Number
 */
export function parsePalletLabelExcel(file: File): Promise<ParsedPalletLabelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })

        const rows: ParsedPalletLabelRow[] = json.map((row, index) => {
          const normalized: Record<string, unknown> = {}
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key]
          }

          const rawDate = normalized['production date'] ?? normalized['production_date'] ?? ''
          const dateStr =
            rawDate instanceof Date
              ? rawDate.toISOString().slice(0, 10)
              : String(rawDate).trim()

          return {
            row_number: index + 1,
            transfer_barcode: String(
              normalized['transfer barcode'] ?? normalized['transfer_barcode'] ?? '',
            ).trim(),
            item_code: String(normalized['item code'] ?? normalized['item_code'] ?? '').trim(),
            description: String(normalized['description'] ?? '').trim(),
            quantity_raw: String(normalized['qty'] ?? normalized['quantity'] ?? '').trim(),
            uom: String(normalized['uom'] ?? '').trim(),
            destination_warehouse: String(
              normalized['destination'] ?? normalized['destination warehouse'] ?? normalized['destination_warehouse'] ?? '',
            ).trim(),
            production_date_raw: dateStr,
            pallet_number: String(normalized['pallet'] ?? normalized['pallet number'] ?? normalized['pallet_number'] ?? '').trim(),
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
