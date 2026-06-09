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
      production_entries: {
        Row: {
          brick_type_id: string
          coal_used: number | null
          created_at: string
          created_by: string
          id: string
          labor_cost: number | null
          mati_used: number | null
          notes: string | null
          other_cost: number | null
          production_date: string
          quantity: number
          updated_at: string
        }
        Insert: {
          brick_type_id: string
          coal_used?: number | null
          created_at?: string
          created_by: string
          id?: string
          labor_cost?: number | null
          mati_used?: number | null
          notes?: string | null
          other_cost?: number | null
          production_date?: string
          quantity: number
          updated_at?: string
        }
        Update: {
          brick_type_id?: string
          coal_used?: number | null
          created_at?: string
          created_by?: string
          id?: string
          labor_cost?: number | null
          mati_used?: number | null
          notes?: string | null
          other_cost?: number | null
          production_date?: string
          quantity?: number
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
            referencedRelation: "raw_materials"
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
          customer_id: string
          driver_name: string | null
          id: string
          notes: string | null
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
          customer_id: string
          driver_name?: string | null
          id?: string
          notes?: string | null
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
          customer_id?: string
          driver_name?: string | null
          id?: string
          notes?: string | null
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
        ]
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
          created_by: string | null
          id: string
          note: string | null
          payment_date: string
          payment_type: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          payment_date?: string
          payment_type?: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
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
          id?: string
          join_date?: string | null
          monthly_salary?: number
          name?: string
          note?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
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
      profit_loss_summary: {
        Row: {
          net_profit: number | null
          total_expense: number | null
          total_income: number | null
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
      recompute_contract_delivered: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      recompute_customer_advance: {
        Args: { _customer_id: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      ],
      sale_status: ["pending", "approved", "rejected"],
      sale_type: ["advance", "regular"],
    },
  },
} as const
