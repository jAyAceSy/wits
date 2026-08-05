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
  finisher: string
  qc: string
}

// Converts an Excel date serial number to "YYYY-MM-DD" using pure
// arithmetic — no JS Date timezone conversion involved anywhere in this
// path, so it can't be shifted by a day based on the browser's
// timezone. 25569 is the number of days between Excel's epoch
// (1899-12-30) and the Unix epoch (1970-01-01); this constant already
// accounts for Excel's fictitious "Feb 29, 1900" leap-year bug for all
// real-world dates.
function excelSerialToIso(serial: number): string {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(utcMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Handles whatever shape the Production Date cell comes in as: a raw
// Excel serial number (normal case for a real date-formatted cell), or
// plain text like "08/03/2026" or "2026-08-03" (if someone typed the
// date as text instead of using a date cell).
function parseDateCell(raw: unknown): string {
  if (typeof raw === 'number') return excelSerialToIso(raw)

  const text = String(raw ?? '').trim()
  if (!text) return ''

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) // MM/DD/YYYY or M/D/YYYY
  if (slash) {
    const [, mm, dd, yyyy] = slash
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10) // already ISO

  return text // unrecognized format — let server-side validation flag it
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
 *   | Destination Warehouse | Production Date | Pallet Number | Finisher | QC
 *
 * The last 5 columns are optional and only needed for label printing.
 */
export function parseTransferExcel(file: File): Promise<ParsedTransferRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        // Deliberately NOT using { cellDates: true } — that converts
        // date cells to JS Date objects, whose internal timezone
        // handling is what caused the off-by-one-day bug. Reading raw
        // values instead gives us the original numeric serial for date
        // cells, which we convert ourselves with pure math above.
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true })

        const rows: ParsedTransferRow[] = json.map((row, index) => {
          const normalized: Record<string, unknown> = {}
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key]
          }

          const rawDate = normalized['production date'] ?? normalized['production_date'] ?? ''

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
            production_date_raw: parseDateCell(rawDate),
            pallet_number: String(
              normalized['pallet number'] ?? normalized['pallet_number'] ?? normalized['pallet'] ?? '',
            ).trim(),
            finisher: String(normalized['finisher'] ?? '').trim(),
            qc: String(normalized['qc'] ?? normalized['q.c.'] ?? normalized['quality control'] ?? '').trim(),
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
