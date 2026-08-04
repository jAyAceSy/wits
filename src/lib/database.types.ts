// Hand-written types mirroring supabase/schema.sql + migration_002_transfer_receiving.sql.
// If you change the schema, you can instead regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
//
// IMPORTANT: every table needs Row / Insert / Update / Relationships, and the
// schema needs Views / Functions / Enums / CompositeTypes present (even if
// empty) — supabase-js's generics require this exact shape. Omitting any of
// them silently collapses insert()/update()/rpc() argument types to `never`.
// (This bit us once already — see the migration_002 rollout notes.)

export type UserRole = 'admin' | 'warehouse_staff' | 'production' | 'warehouse_officer'
export type TransferStatus = 'draft' | 'submitted' | 'voided'

export type TransferMasterStatus =
  | 'Pending'
  | 'Received'
  | 'Pending Warehouse Officer Review'
  | 'Under Investigation'
  | 'Approved with Variance'
  | 'Rejected'
  | 'Cancelled'

export type ImportValidationStatus = 'valid' | 'invalid' | 'duplicate_in_file' | 'duplicate_in_db'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
      transfer_import_batches: {
        Row: {
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
        }
        Insert: {
          id?: string
          import_id?: string | null
          filename: string
          uploaded_by?: string
          uploaded_at?: string
          total_records?: number
          successful_records?: number
          failed_records?: number
          duplicate_records?: number
          status?: string
        }
        Update: {
          total_records?: number
          successful_records?: number
          failed_records?: number
          duplicate_records?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transfer_import_batches_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      transfer_import_staging: {
        Row: {
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
        Insert: {
          id?: string
          import_batch_id: string
          row_number: number
          transfer_barcode?: string | null
          item_code?: string | null
          description?: string | null
          uom?: string | null
          transferred_quantity_raw?: string | null
          transferred_quantity?: number | null
          validation_status?: ImportValidationStatus | null
          validation_errors?: string[] | null
          created_at?: string
        }
        Update: {
          validation_status?: ImportValidationStatus | null
          validation_errors?: string[] | null
          transferred_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'transfer_import_staging_import_batch_id_fkey'
            columns: ['import_batch_id']
            isOneToOne: false
            referencedRelation: 'transfer_import_batches'
            referencedColumns: ['id']
          },
        ]
      }
      transfer_master: {
        Row: {
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
          entry_type: 'transfer_barcode' | 'ad_hoc'
          production_area: string | null
          destination_warehouse: string | null
          remarks: string | null
        }
        Insert: {
          id?: string
          transfer_barcode: string
          item_code: string
          description: string
          uom: string
          transferred_quantity: number
          status?: TransferMasterStatus
          import_batch_id?: string | null
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'transfer_master_import_batch_id_fkey'
            columns: ['import_batch_id']
            isOneToOne: false
            referencedRelation: 'transfer_import_batches'
            referencedColumns: ['id']
          },
        ]
      }
      transfer_audit_trail: {
        Row: {
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
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'transfer_audit_trail_transfer_master_id_fkey'
            columns: ['transfer_master_id']
            isOneToOne: false
            referencedRelation: 'transfer_master'
            referencedColumns: ['id']
          },
        ]
      }
      pallet_label_batches: {
        Row: {
          id: string
          batch_number: string | null
          filename: string
          uploaded_by: string
          uploaded_at: string
          total_records: number
          imported_records: number
          duplicate_records: number
          invalid_records: number
          status: string
        }
        Insert: {
          id?: string
          batch_number?: string | null
          filename: string
          uploaded_by?: string
          uploaded_at?: string
          total_records?: number
          imported_records?: number
          duplicate_records?: number
          invalid_records?: number
          status?: string
        }
        Update: {
          total_records?: number
          imported_records?: number
          duplicate_records?: number
          invalid_records?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pallet_label_batches_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      pallet_label_staging: {
        Row: {
          id: string
          batch_id: string
          row_number: number
          transfer_barcode: string | null
          item_code: string | null
          description: string | null
          quantity_raw: string | null
          quantity: number | null
          uom: string | null
          destination_warehouse: string | null
          production_date_raw: string | null
          production_date: string | null
          pallet_number: string | null
          validation_status: ImportValidationStatus | null
          validation_errors: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          row_number: number
          transfer_barcode?: string | null
          item_code?: string | null
          description?: string | null
          quantity_raw?: string | null
          uom?: string | null
          destination_warehouse?: string | null
          production_date_raw?: string | null
          pallet_number?: string | null
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'pallet_label_staging_batch_id_fkey'
            columns: ['batch_id']
            isOneToOne: false
            referencedRelation: 'pallet_label_batches'
            referencedColumns: ['id']
          },
        ]
      }
      pallet_labels: {
        Row: {
          id: string
          transfer_barcode: string
          item_code: string
          description: string
          quantity: number
          uom: string
          destination_warehouse: string
          production_date: string
          pallet_number: string
          batch_id: string | null
          print_count: number
          last_printed_at: string | null
          last_printed_by: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'pallet_labels_batch_id_fkey'
            columns: ['batch_id']
            isOneToOne: false
            referencedRelation: 'pallet_label_batches'
            referencedColumns: ['id']
          },
        ]
      }
      label_print_history: {
        Row: {
          id: string
          pallet_label_id: string | null
          transfer_barcode: string
          printed_by: string | null
          printed_at: string
          printer_name: string | null
          print_status: string
          is_reprint: boolean
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'label_print_history_pallet_label_id_fkey'
            columns: ['pallet_label_id']
            isOneToOne: false
            referencedRelation: 'pallet_labels'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      process_transfer_import: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      receiver_lookup_transfer: {
        Args: { p_barcode: string }
        Returns: {
          transfer_barcode: string
          item_code: string
          description: string
          uom: string
          status: string
        }[]
      }
      submit_receiving: {
        Args: { p_transfer_barcode: string; p_received_qty: number }
        Returns: string
      }
      warehouse_officer_review: {
        Args: { p_transfer_id: string; p_action: string; p_remarks?: string | null }
        Returns: undefined
      }
      reopen_transfer: {
        Args: { p_transfer_id: string; p_remarks?: string | null }
        Returns: undefined
      }
      process_pallet_label_import: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      record_label_print: {
        Args: { p_transfer_barcode: string; p_printer_name?: string | null; p_is_reprint?: boolean }
        Returns: undefined
      }
      submit_adhoc_transfer: {
        Args: {
          p_code: string
          p_quantity: number
          p_production_area: string
          p_destination_warehouse: string
          p_remarks?: string | null
        }
        Returns: string
      }
      receiver_my_transfers: {
        Args: Record<string, never>
        Returns: {
          transfer_barcode: string
          item_code: string
          description: string
          uom: string
          received_quantity: number
          received_at: string
          entry_type: string
        }[]
      }
    }
    Enums: {
      user_role: UserRole
      transfer_status: TransferStatus
    }
    CompositeTypes: Record<string, never>
  }
}
