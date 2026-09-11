export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_bn: string | null
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          device: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          account_no: string | null
          bank_name: string
          branch: string | null
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_no?: string | null
          bank_name: string
          branch?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_no?: string | null
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          created_by: string
          direction: string
          id: string
          method: string | null
          note: string | null
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id: string
          created_at?: string
          created_by?: string
          direction: string
          id?: string
          method?: string | null
          note?: string | null
          txn_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          created_by?: string
          direction?: string
          id?: string
          method?: string | null
          note?: string | null
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brick_types: {
        Row: {
          created_at: string
          default_unit_price: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_unit_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_unit_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      closed_months: {
        Row: {
          closed_at: string
          closed_by: string | null
          id: string
          month: number
          snapshot: Json | null
          year: number
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month: number
          snapshot?: Json | null
          year: number
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month?: number
          snapshot?: Json | null
          year?: number
        }
        Relationships: []
      }
      collections: {
        Row: {
          amount: number
          contract_id: string | null
          created_at: string
          created_by: string
          customer_id: string
          id: string
          method: string | null
          note: string | null
          order_id: string | null
          payment_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
          method?: string | null
          note?: string | null
          order_id?: string | null
          payment_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          method?: string | null
          note?: string | null
          order_id?: string | null
          payment_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          created_by: string
          id: string
          method: string | null
          note: string | null
          payment_date: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          created_by: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          advance_paid: number
          approved_by: string | null
          booked_quantity: number
          booked_value: number
          contract_no: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string
          customer_id: string
          delivered_quantity: number
          expiry_date: string | null
          fixed_rate: number | null
          id: string
          notes: string | null
          priority: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          truck_quantity: number | null
          updated_at: string
        }
        Insert: {
          advance_paid?: number
          approved_by?: string | null
          booked_quantity?: number
          booked_value?: number
          contract_no: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by: string
          customer_id: string
          delivered_quantity?: number
          expiry_date?: string | null
          fixed_rate?: number | null
          id?: string
          notes?: string | null
          priority?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          truck_quantity?: number | null
          updated_at?: string
        }
        Update: {
          advance_paid?: number
          approved_by?: string | null
          booked_quantity?: number
          booked_value?: number
          contract_no?: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string
          customer_id?: string
          delivered_quantity?: number
          expiry_date?: string | null
          fixed_rate?: number | null
          id?: string
          notes?: string | null
          priority?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          truck_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          advance_balance: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          advance_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          advance_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string | null
          delivery_date: string
          driver_name: string | null
          id: string
          note: string | null
          order_id: string | null
          quantity: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          delivery_date?: string
          driver_name?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          quantity?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          delivery_date?: string
          driver_name?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          quantity?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          expense_date: string
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          entry_no: string
          id: string
          narration: string | null
          ref_id: string | null
          ref_type: string | null
          source: Database["public"]["Enums"]["journal_source"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          narration?: string | null
          ref_id?: string | null
          ref_type?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          narration?: string | null
          ref_id?: string | null
          ref_type?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          updated_at?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          customer_id: string | null
          debit: number
          entry_id: string
          id: string
          note: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          customer_id?: string | null
          debit?: number
          entry_id: string
          id?: string
          note?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          customer_id?: string | null
          debit?: number
          entry_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kacha_brick_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          entry_date: string
          entry_type: string
          id: string
          note: string | null
          quantity: number
          rate: number
          sardar_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string
          entry_date?: string
          entry_type?: string
          id?: string
          note?: string | null
          quantity?: number
          rate?: number
          sardar_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          entry_date?: string
          entry_type?: string
          id?: string
          note?: string | null
          quantity?: number
          rate?: number
          sardar_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kacha_brick_entries_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "kacha_brick_entries_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_head_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          entry_date: string
          head_id: string
          id: string
          note: string | null
          party_name: string | null
          quantity: number | null
          rate: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string
          entry_date?: string
          head_id: string
          id?: string
          note?: string | null
          party_name?: string | null
          quantity?: number | null
          rate?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          entry_date?: string
          head_id?: string
          id?: string
          note?: string | null
          party_name?: string | null
          quantity?: number | null
          rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_head_entries_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "ledger_heads"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_heads: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          note: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          note?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          note?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opening_balances: {
        Row: {
          amount: number
          as_of_date: string
          category: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          fiscal_year: number
          id: string
          kind: Database["public"]["Enums"]["opening_kind"]
          note: string | null
          party_name: string | null
          sardar_id: string | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          amount: number
          as_of_date?: string
          category?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          fiscal_year?: number
          id?: string
          kind: Database["public"]["Enums"]["opening_kind"]
          note?: string | null
          party_name?: string | null
          sardar_id?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          amount?: number
          as_of_date?: string
          category?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          fiscal_year?: number
          id?: string
          kind?: Database["public"]["Enums"]["opening_kind"]
          note?: string | null
          party_name?: string | null
          sardar_id?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "opening_balances_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          method: string | null
          note: string | null
          opening_balance_id: string
          payment_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          opening_balance_id: string
          payment_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          opening_balance_id?: string
          payment_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_payments_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_payments_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance: number
          brick_type_id: string | null
          created_at: string
          created_by: string
          customer_id: string
          delivered_quantity: number
          delivery_date: string | null
          id: string
          note: string | null
          order_date: string
          order_no: string
          quantity: number
          rate: number
          remaining_quantity: number
          status: string
          updated_at: string
        }
        Insert: {
          advance?: number
          brick_type_id?: string | null
          created_at?: string
          created_by?: string
          customer_id: string
          delivered_quantity?: number
          delivery_date?: string | null
          id?: string
          note?: string | null
          order_date?: string
          order_no: string
          quantity?: number
          rate?: number
          remaining_quantity?: number
          status?: string
          updated_at?: string
        }
        Update: {
          advance?: number
          brick_type_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          delivered_quantity?: number
          delivery_date?: string | null
          id?: string
          note?: string | null
          order_date?: string
          order_no?: string
          quantity?: number
          rate?: number
          remaining_quantity?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "brick_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "current_stock"
            referencedColumns: ["brick_type_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entries: {
        Row: {
          brick_type_id: string
          coal_cost: number
          coal_material_id: string | null
          coal_used: number | null
          cost_per_brick: number
          created_at: string
          created_by: string
          id: string
          labor_cost: number | null
          mati_cost: number
          mati_material_id: string | null
          mati_used: number | null
          notes: string | null
          other_cost: number | null
          production_date: string
          quantity: number
          total_cost: number
          updated_at: string
        }
        Insert: {
          brick_type_id: string
          coal_cost?: number
          coal_material_id?: string | null
          coal_used?: number | null
          cost_per_brick?: number
          created_at?: string
          created_by: string
          id?: string
          labor_cost?: number | null
          mati_cost?: number
          mati_material_id?: string | null
          mati_used?: number | null
          notes?: string | null
          other_cost?: number | null
          production_date?: string
          quantity: number
          total_cost?: number
          updated_at?: string
        }
        Update: {
          brick_type_id?: string
          coal_cost?: number
          coal_material_id?: string | null
          coal_used?: number | null
          cost_per_brick?: number
          created_at?: string
          created_by?: string
          id?: string
          labor_cost?: number | null
          mati_cost?: number
          mati_material_id?: string | null
          mati_used?: number | null
          notes?: string | null
          other_cost?: number | null
          production_date?: string
          quantity?: number
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "brick_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "current_stock"
            referencedColumns: ["brick_type_id"]
          },
          {
            foreignKeyName: "production_entries_coal_material_id_fkey"
            columns: ["coal_material_id"]
            isOneToOne: false
            referencedRelation: "raw_material_stock"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "production_entries_coal_material_id_fkey"
            columns: ["coal_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_mati_material_id_fkey"
            columns: ["mati_material_id"]
            isOneToOne: false
            referencedRelation: "raw_material_stock"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "production_entries_mati_material_id_fkey"
            columns: ["mati_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raw_material_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          note: string | null
          payment_method: string
          purchase_date: string
          quantity: number
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          note?: string | null
          payment_method?: string
          purchase_date?: string
          quantity: number
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          note?: string | null
          payment_method?: string
          purchase_date?: string
          quantity?: number
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_purchases_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_material_stock"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "raw_material_purchases_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_material_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_usage: {
        Row: {
          amount: number
          created_at: string
          id: string
          material_id: string
          note: string | null
          production_entry_id: string | null
          quantity: number
          unit_cost: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          material_id: string
          note?: string | null
          production_entry_id?: string | null
          quantity: number
          unit_cost?: number
          updated_at?: string
          usage_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          material_id?: string
          note?: string | null
          production_entry_id?: string | null
          quantity?: number
          unit_cost?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_material_stock"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "raw_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_material_usage_production_entry_id_fkey"
            columns: ["production_entry_id"]
            isOneToOne: false
            referencedRelation: "production_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          active: boolean
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brick_type_id: string
          challan_no: string
          contract_id: string | null
          created_at: string
          created_by: string
          custom_brick_name: string | null
          customer_id: string | null
          driver_name: string | null
          id: string
          notes: string | null
          opening_balance_id: string | null
          quantity: number
          sale_date: string
          sale_type: Database["public"]["Enums"]["sale_type"]
          status: Database["public"]["Enums"]["sale_status"]
          total_amount: number
          unit_price: number
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brick_type_id: string
          challan_no: string
          contract_id?: string | null
          created_at?: string
          created_by: string
          custom_brick_name?: string | null
          customer_id?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          opening_balance_id?: string | null
          quantity: number
          sale_date?: string
          sale_type?: Database["public"]["Enums"]["sale_type"]
          status?: Database["public"]["Enums"]["sale_status"]
          total_amount: number
          unit_price: number
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brick_type_id?: string
          challan_no?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string
          custom_brick_name?: string | null
          customer_id?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          opening_balance_id?: string | null
          quantity?: number
          sale_date?: string
          sale_type?: Database["public"]["Enums"]["sale_type"]
          status?: Database["public"]["Enums"]["sale_status"]
          total_amount?: number
          unit_price?: number
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "brick_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "current_stock"
            referencedColumns: ["brick_type_id"]
          },
          {
            foreignKeyName: "sales_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      sardar_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sardar_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          method: string | null
          note: string | null
          payment_date: string
          payment_type: string
          sardar_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
          payment_type?: string
          sardar_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
          payment_type?: string
          sardar_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sardar_payments_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "sardar_payments_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
        ]
      }
      sardar_rates: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          note: string | null
          rate: number
          sardar_id: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          rate: number
          sardar_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          rate?: number
          sardar_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sardar_rates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sardar_rates_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "sardar_rates_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
        ]
      }
      sardar_work_entries: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          entry_date: string
          id: string
          note: string | null
          quantity: number
          rate: number
          sardar_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          created_by: string
          entry_date?: string
          id?: string
          note?: string | null
          quantity: number
          rate: number
          sardar_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          entry_date?: string
          id?: string
          note?: string | null
          quantity?: number
          rate?: number
          sardar_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sardar_work_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sardar_work_entries_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "sardar_work_entries_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
        ]
      }
      sardars: {
        Row: {
          address: string | null
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sardars_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "sardar_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          start_date: string
          target_production: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          start_date: string
          target_production?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          start_date?: string
          target_production?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_departments: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_designations: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          brick_type_id: string
          change: number
          created_at: string
          id: string
          note: string | null
          ref_date: string
          ref_id: string
          ref_type: string
        }
        Insert: {
          brick_type_id: string
          change: number
          created_at?: string
          id?: string
          note?: string | null
          ref_date?: string
          ref_id: string
          ref_type: string
        }
        Update: {
          brick_type_id?: string
          change?: number
          created_at?: string
          id?: string
          note?: string | null
          ref_date?: string
          ref_id?: string
          ref_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "brick_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_brick_type_id_fkey"
            columns: ["brick_type_id"]
            isOneToOne: false
            referencedRelation: "current_stock"
            referencedColumns: ["brick_type_id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          payment_date: string
          supplier_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          payment_date?: string
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          payment_date?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          material_type: string | null
          name: string
          note: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          material_type?: string | null
          name: string
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          material_type?: string | null
          name?: string
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          from_bank_id: string | null
          from_type: string
          id: string
          note: string | null
          to_bank_id: string | null
          to_type: string
          transfer_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string
          from_bank_id?: string | null
          from_type: string
          id?: string
          note?: string | null
          to_bank_id?: string | null
          to_type: string
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          from_bank_id?: string | null
          from_type?: string
          id?: string
          note?: string | null
          to_bank_id?: string | null
          to_type?: string
          transfer_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_bank_id_fkey"
            columns: ["from_bank_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_bank_id_fkey"
            columns: ["to_bank_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          note: string | null
          vehicle_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          type: string
          updated_at: string
          vehicle_no: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          type?: string
          updated_at?: string
          vehicle_no: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          type?: string
          updated_at?: string
          vehicle_no?: string
        }
        Relationships: []
      }
      work_categories: {
        Row: {
          account_code: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          account_code?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          account_code?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      worker_attendance: {
        Row: {
          advance_paid: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          note: string | null
          overtime_hours: number
          present: boolean
          worker_id: string
        }
        Insert: {
          advance_paid?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          overtime_hours?: number
          present?: boolean
          worker_id: string
        }
        Update: {
          advance_paid?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          overtime_hours?: number
          present?: boolean
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          note: string | null
          payment_date: string
          payment_type: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_type?: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_type?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          active: boolean
          created_at: string
          daily_wage: number
          department_id: string | null
          designation_id: string | null
          id: string
          join_date: string | null
          monthly_salary: number
          name: string
          note: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_wage?: number
          department_id?: string | null
          designation_id?: string | null
          id?: string
          join_date?: string | null
          monthly_salary?: number
          name: string
          note?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_wage?: number
          department_id?: string | null
          designation_id?: string | null
          id?: string
          join_date?: string | null
          monthly_salary?: number
          name?: string
          note?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "staff_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "staff_designations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          code: string | null
          id: string | null
          name: string | null
          name_bn: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: []
      }
      contract_summary: {
        Row: {
          booked_quantity: number | null
          booked_value: number | null
          collected_amount: number | null
          contract_no: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          customer_id: string | null
          delivered_quantity: number | null
          delivered_trucks: number | null
          delivered_value: number | null
          due_amount: number | null
          fixed_rate: number | null
          id: string | null
          remaining_quantity: number | null
          remaining_trucks: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"] | null
          truck_quantity: number | null
        }
        Insert: {
          booked_quantity?: number | null
          booked_value?: number | null
          collected_amount?: never
          contract_no?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          customer_id?: string | null
          delivered_quantity?: never
          delivered_trucks?: never
          delivered_value?: never
          due_amount?: never
          fixed_rate?: number | null
          id?: string | null
          remaining_quantity?: never
          remaining_trucks?: never
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          truck_quantity?: number | null
        }
        Update: {
          booked_quantity?: number | null
          booked_value?: number | null
          collected_amount?: never
          contract_no?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          customer_id?: string | null
          delivered_quantity?: never
          delivered_trucks?: never
          delivered_value?: never
          due_amount?: never
          fixed_rate?: number | null
          id?: string | null
          remaining_quantity?: never
          remaining_trucks?: never
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          truck_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      current_stock: {
        Row: {
          brick_name: string | null
          brick_type_id: string | null
          quantity: number | null
        }
        Relationships: []
      }
      opening_balance_summary: {
        Row: {
          amount: number | null
          as_of_date: string | null
          category: string | null
          created_at: string | null
          customer_id: string | null
          display_name: string | null
          fiscal_year: number | null
          id: string | null
          kind: Database["public"]["Enums"]["opening_kind"] | null
          note: string | null
          paid_amount: number | null
          party_name: string | null
          payments_amount: number | null
          remaining_amount: number | null
          sales_adjusted: number | null
          sales_adjusted_qty: number | null
          sardar_id: string | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardar_balances"
            referencedColumns: ["sardar_id"]
          },
          {
            foreignKeyName: "opening_balances_sardar_id_fkey"
            columns: ["sardar_id"]
            isOneToOne: false
            referencedRelation: "sardars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_loss_summary: {
        Row: {
          net_profit: number | null
          total_expense: number | null
          total_income: number | null
        }
        Relationships: []
      }
      raw_material_stock: {
        Row: {
          avg_unit_cost: number | null
          in_stock: number | null
          low_stock_threshold: number | null
          material_id: string | null
          name: string | null
          purchased_amount: number | null
          purchased_qty: number | null
          unit: string | null
          used_qty: number | null
        }
        Relationships: []
      }
      sardar_balances: {
        Row: {
          balance: number | null
          name: string | null
          sardar_id: string | null
          total_advance: number | null
          total_due: number | null
          total_paid: number | null
          total_quantity: number | null
        }
        Relationships: []
      }
      trial_balance: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          code: string | null
          name: string | null
          name_bn: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acc: { Args: { _code: string }; Returns: string }
      acc_for_method: { Args: { _method: string }; Returns: string }
      current_sardar_rate: {
        Args: { _category_id: string; _on_date?: string; _sardar_id: string }
        Returns: number
      }
      expense_account_for: { Args: { _category: string }; Returns: string }
      expire_old_contracts: { Args: never; Returns: undefined }
      generate_contract_no: {
        Args: { _type: Database["public"]["Enums"]["contract_type"] }
        Returns: string
      }
      is_month_closed: { Args: { _date: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _new_value?: Json
          _old_value?: Json
        }
        Returns: string
      }
      material_avg_cost: { Args: { _material_id: string }; Returns: number }
      recompute_contract_advance: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      recompute_contract_delivered: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      recompute_customer_advance: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      recompute_order_progress: {
        Args: { _order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role: "admin" | "manager"
      contract_status: "active" | "completed" | "expired" | "suspended"
      contract_type: "yearly_fixed" | "short_term" | "cash"
      journal_source:
        | "sale"
        | "collection"
        | "expense"
        | "manual"
        | "opening"
        | "adjustment"
        | "raw_material"
        | "labor"
        | "vehicle"
        | "sardar"
        | "bank"
        | "transfer"
        | "supplier"
        | "production"
      opening_kind: "customer_brick_due" | "sardar_payable" | "other_payable"
      sale_status: "pending" | "approved" | "rejected"
      sale_type: "advance" | "regular"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      app_role: ["admin", "manager"],
      contract_status: ["active", "completed", "expired", "suspended"],
      contract_type: ["yearly_fixed", "short_term", "cash"],
      journal_source: [
        "sale",
        "collection",
        "expense",
        "manual",
        "opening",
        "adjustment",
        "raw_material",
        "labor",
        "vehicle",
        "sardar",
        "bank",
        "transfer",
        "supplier",
        "production",
      ],
      opening_kind: ["customer_brick_due", "sardar_payable", "other_payable"],
      sale_status: ["pending", "approved", "rejected"],
      sale_type: ["advance", "regular"],
    },
  },
} as const
