import type { UserRole, TransferStatus, TransferMasterStatus, ImportValidationStatus } from './database.types'

export type { UserRole, TransferStatus, TransferMasterStatus, ImportValidationStatus }

export interface AppUser {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
}

export interface Product {
  id: string
  barcode: string
  item_code: string
  description: string
  uom: string
  is_active: boolean
}

export interface TransferHeader {
  id: string
  transfer_number: string
  transfer_date: string
  created_at: string
  warehouse_receiver: string
  production_area: string
  destination_warehouse: string
  remarks: string | null
  status: TransferStatus
  created_by: string
  total_items: number
  total_qty: number
  // joined
  creator_name?: string
}

export interface TransferDetail {
  id: string
  transfer_id: string
  product_id: string
  barcode: string
  item_code: string
  description: string
  uom: string
  quantity: number
  scanned_at: string
}

/** A row in the "cart" of items being built before Submit Transfer. */
export interface DraftLine {
  clientId: string
  product_id: string
  barcode: string
  item_code: string
  description: string
  uom: string
  quantity: number
}

// ---------------------------------------------------------------------
// Transfer Barcode Receiving (Excel import + blind count + variance
// review)
// ---------------------------------------------------------------------

export interface TransferImportBatch {
  id: string
  import_id: string | null
  filename: string
  uploaded_by: string
  uploaded_at: string
  total_records: number
  successful_records: number
  failed_records: number
  duplicate_records: number
  status: string
  // joined
  uploader_name?: string
}

export interface TransferImportStagingRow {
  id: string
  import_batch_id: string
  row_number: number
  transfer_barcode: string | null
  item_code: string | null
  description: string | null
  uom: string | null
  transferred_quantity_raw: string | null
  transferred_quantity: number | null
  validation_status: ImportValidationStatus | null
  validation_errors: string[] | null
  created_at: string
}

/**
 * What a Receiver is allowed to see. Deliberately has NO
 * transferred_quantity / variance fields — the shape itself is the
 * enforcement, mirroring the database function it comes from.
 */
export interface ReceiverTransferView {
  transfer_barcode: string
  item_code: string
  description: string
  uom: string
  status: string
}

/** Full row, for Warehouse Officer / Admin eyes only. */
export interface TransferMasterFull {
  id: string
  transfer_barcode: string
  item_code: string
  description: string
  uom: string
  transferred_quantity: number
  status: TransferMasterStatus
  import_batch_id: string | null
  created_at: string
  received_quantity: number | null
  received_by: string | null
  received_at: string | null
  variance: number | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_remarks: string | null
  reopened_count: number
  // joined
  receiver_name?: string
  reviewer_name?: string
}

export interface TransferAuditEntry {
  id: string
  transfer_master_id: string | null
  transfer_barcode: string
  import_batch_id: string | null
  event: string
  previous_status: string | null
  new_status: string | null
  transferred_quantity: number | null
  received_quantity: number | null
  variance: number | null
  performed_by: string | null
  remarks: string | null
  created_at: string
  // joined
  performer_name?: string
}
