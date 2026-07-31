// Hand-written types mirroring supabase/schema.sql.
// If you change the schema, you can instead regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
//
// IMPORTANT: every table needs Row / Insert / Update / Relationships, and the
// schema needs Views / Functions / Enums / CompositeTypes present (even if
// empty) — supabase-js's generics require this exact shape. Omitting any of
// them silently collapses insert()/update() argument types to `never`.

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
        Relationships: []
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
        Relationships: []
      }
      transfer_headers: {
        Row: {
          id: string
          transfer_number: string
          transfer_date: string
          created_at: string
          warehouse_receiver: string | null
          production_area: string | null
          destination_warehouse: string | null
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
          warehouse_receiver?: string | null
          production_area?: string | null
          destination_warehouse?: string | null
          remarks?: string | null
          status?: TransferStatus
          created_by?: string
          total_items?: number
          total_qty?: number
        }
        Update: {
          warehouse_receiver?: string | null
          production_area?: string | null
          destination_warehouse?: string | null
          remarks?: string | null
          status?: TransferStatus
          total_items?: number
          total_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: 'transfer_headers_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: 'transfer_details_transfer_id_fkey'
            columns: ['transfer_id']
            isOneToOne: false
            referencedRelation: 'transfer_headers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transfer_details_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
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
        Update: {
          user_id?: string | null
          action?: string
          table_name?: string
          record_id?: string | null
          details?: Record<string, unknown> | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      transfer_status: TransferStatus
    }
    CompositeTypes: Record<string, never>
  }
}
