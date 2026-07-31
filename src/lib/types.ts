import type { UserRole, TransferStatus } from './database.types'

export type { UserRole, TransferStatus }

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
