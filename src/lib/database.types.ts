// Hand-written types mirroring supabase/schema.sql.
// If you change the schema, you can instead regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type UserRole = 'admin' | 'warehouse_staff'
export type TransferStatus = 'draft' | 'submitted' | 'voided'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          full_name: string
          email: string
          role: UserRole
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          role?: UserRole
          is_active?: boolean
          created_at?: string
        }
        Update: {
          full_name?: string
          email?: string
          role?: UserRole
          is_active?: boolean
        }
      }
      products: {
        Row: {
          id: string
          barcode: string
          item_code: string
          description: string
          uom: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          barcode: string
          item_code: string
          description: string
          uom: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          item_code?: string
          description?: string
          uom?: string
          is_active?: boolean
          updated_at?: string
        }
      }
      transfer_headers: {
        Row: {
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
        }
        Insert: {
          id?: string
          transfer_number?: string
          transfer_date?: string
          created_at?: string
          warehouse_receiver: string
          production_area: string
          destination_warehouse: string
          remarks?: string | null
          status?: TransferStatus
          created_by: string
          total_items?: number
          total_qty?: number
        }
        Update: {
          warehouse_receiver?: string
          production_area?: string
          destination_warehouse?: string
          remarks?: string | null
          status?: TransferStatus
          total_items?: number
          total_qty?: number
        }
      }
      transfer_details: {
        Row: {
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
        Insert: {
          id?: string
          transfer_id: string
          product_id: string
          barcode: string
          item_code: string
          description: string
          uom: string
          quantity: number
          scanned_at?: string
        }
        Update: {
          quantity?: number
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          table_name: string
          record_id: string | null
          details: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          table_name: string
          record_id?: string | null
          details?: Record<string, unknown> | null
          created_at?: string
        }
        Update: never
      }
    }
  }
}
