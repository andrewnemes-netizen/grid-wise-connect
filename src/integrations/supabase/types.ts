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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          billing_terms: Json | null
          client_id: string
          created_at: string
          id: string
          name: string
          region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_terms?: Json | null
          client_id: string
          created_at?: string
          id?: string
          name: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_terms?: Json | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      actual_costs: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["actual_cost_category"]
          cost_code: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          estimate_line_id: string | null
          id: string
          incurred_on: string
          invoice_number: string | null
          metadata_json: Json
          notes: string | null
          org_id: string
          purchase_order_id: string | null
          qty: number | null
          resource_id: string | null
          site_id: string | null
          source: Database["public"]["Enums"]["actual_cost_source"]
          source_ref: string | null
          supplier: string | null
          unit_cost: number | null
          uom: string | null
          updated_at: string
          work_package_id: string
          wp_task_id: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["actual_cost_category"]
          cost_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          estimate_line_id?: string | null
          id?: string
          incurred_on?: string
          invoice_number?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id: string
          purchase_order_id?: string | null
          qty?: number | null
          resource_id?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["actual_cost_source"]
          source_ref?: string | null
          supplier?: string | null
          unit_cost?: number | null
          uom?: string | null
          updated_at?: string
          work_package_id: string
          wp_task_id?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["actual_cost_category"]
          cost_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          estimate_line_id?: string | null
          id?: string
          incurred_on?: string
          invoice_number?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id?: string
          purchase_order_id?: string | null
          qty?: number | null
          resource_id?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["actual_cost_source"]
          source_ref?: string | null
          supplier?: string | null
          unit_cost?: number | null
          uom?: string | null
          updated_at?: string
          work_package_id?: string
          wp_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actual_costs_estimate_line_id_fkey"
            columns: ["estimate_line_id"]
            isOneToOne: false
            referencedRelation: "estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_costs_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_costs_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_costs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "actual_costs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_costs_wp_task_id_fkey"
            columns: ["wp_task_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["poc_task_id"]
          },
          {
            foreignKeyName: "actual_costs_wp_task_id_fkey"
            columns: ["wp_task_id"]
            isOneToOne: false
            referencedRelation: "wp_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          financial_period_lock_before: string | null
          id: string
          onedrive_root_folder: string
          public_app_base_url: string | null
          require_approval: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          financial_period_lock_before?: string | null
          id?: string
          onedrive_root_folder?: string
          public_app_base_url?: string | null
          require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          financial_period_lock_before?: string | null
          id?: string
          onedrive_root_folder?: string
          public_app_base_url?: string | null
          require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          cost_cents: number | null
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          archived_at: string | null
          context_programme_id: string | null
          context_site_id: string | null
          context_wp_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          context_programme_id?: string | null
          context_site_id?: string | null
          context_wp_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          context_programme_id?: string | null
          context_site_id?: string | null
          context_wp_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_tool_calls: {
        Row: {
          created_at: string
          error_message: string | null
          execution_ms: number | null
          id: string
          model: string | null
          params: Json | null
          record_ids: string[] | null
          result_summary: string | null
          status: string
          thread_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          execution_ms?: number | null
          id?: string
          model?: string | null
          params?: Json | null
          record_ids?: string[] | null
          result_summary?: string | null
          status: string
          thread_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          execution_ms?: number | null
          id?: string
          model?: string | null
          params?: Json | null
          record_ids?: string[] | null
          result_summary?: string | null
          status?: string
          thread_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tool_calls_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          meta_json: Json | null
          site_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta_json?: Json | null
          site_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta_json?: Json | null
          site_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      board_automations: {
        Row: {
          action_json: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          programme_id: string | null
          project_id: string | null
          trigger_json: Json
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          action_json?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          programme_id?: string | null
          project_id?: string | null
          trigger_json?: Json
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          action_json?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          programme_id?: string | null
          project_id?: string | null
          trigger_json?: Json
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_automations_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_automations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "board_automations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      board_columns: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          key: string
          label: string
          options_json: Json
          programme_id: string | null
          project_id: string | null
          sort_index: number
          type: string
          updated_at: string
          width: number
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          label: string
          options_json?: Json
          programme_id?: string | null
          project_id?: string | null
          sort_index?: number
          type: string
          updated_at?: string
          width?: number
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          label?: string
          options_json?: Json
          programme_id?: string | null
          project_id?: string | null
          sort_index?: number
          type?: string
          updated_at?: string
          width?: number
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_columns_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "board_columns_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      board_views: {
        Row: {
          config_json: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          programme_id: string | null
          project_id: string | null
          updated_at: string
          user_id: string | null
          work_package_id: string | null
        }
        Insert: {
          config_json?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          programme_id?: string | null
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
          work_package_id?: string | null
        }
        Update: {
          config_json?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          programme_id?: string | null
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_views_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_views_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "board_views_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_catalogue: {
        Row: {
          cable_type: string
          cost_per_m: number
          created_at: string
          current_rating_a: number
          diameter_mm: number
          id: string
          impedance_per_km: number
          is_default: boolean
          mains_allowed: boolean
          service_allowed: boolean
          updated_at: string
          voltage_class: string
        }
        Insert: {
          cable_type: string
          cost_per_m?: number
          created_at?: string
          current_rating_a?: number
          diameter_mm?: number
          id?: string
          impedance_per_km?: number
          is_default?: boolean
          mains_allowed?: boolean
          service_allowed?: boolean
          updated_at?: string
          voltage_class: string
        }
        Update: {
          cable_type?: string
          cost_per_m?: number
          created_at?: string
          current_rating_a?: number
          diameter_mm?: number
          id?: string
          impedance_per_km?: number
          is_default?: boolean
          mains_allowed?: boolean
          service_allowed?: boolean
          updated_at?: string
          voltage_class?: string
        }
        Relationships: []
      }
      cables_ehv_ug_capacity: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          capacity_flag: string | null
          capacity_unit: string | null
          capacity_value: number | null
          geom: unknown
          id: string
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      cables_hv_ug_capacity: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          capacity_flag: string | null
          capacity_unit: string | null
          capacity_value: number | null
          geom: unknown
          id: string
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      capability_grants: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          primary_contact_id: string | null
          status: string
          tenant_org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          primary_contact_id?: string | null
          status?: string
          tenant_org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          primary_contact_id?: string | null
          status?: string
          tenant_org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_org_id_fkey"
            columns: ["tenant_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clients_primary_contact"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      commissioning_records: {
        Row: {
          commissioned_at: string | null
          commissioning_engineer_id: string | null
          commissioning_engineer_name: string | null
          connection_capacity_kva: number | null
          created_at: string
          created_by: string | null
          energised_at: string | null
          id: string
          metadata_json: Json
          meter_serial: string | null
          mpan: string | null
          notes: string | null
          org_id: string
          site_id: string | null
          status: Database["public"]["Enums"]["commissioning_status"]
          test_pack_file_id: string | null
          test_pack_ref: string | null
          updated_at: string
          voltage_level: string | null
          witness_name: string | null
          witness_org: string | null
          work_package_id: string | null
        }
        Insert: {
          commissioned_at?: string | null
          commissioning_engineer_id?: string | null
          commissioning_engineer_name?: string | null
          connection_capacity_kva?: number | null
          created_at?: string
          created_by?: string | null
          energised_at?: string | null
          id?: string
          metadata_json?: Json
          meter_serial?: string | null
          mpan?: string | null
          notes?: string | null
          org_id: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["commissioning_status"]
          test_pack_file_id?: string | null
          test_pack_ref?: string | null
          updated_at?: string
          voltage_level?: string | null
          witness_name?: string | null
          witness_org?: string | null
          work_package_id?: string | null
        }
        Update: {
          commissioned_at?: string | null
          commissioning_engineer_id?: string | null
          commissioning_engineer_name?: string | null
          connection_capacity_kva?: number | null
          created_at?: string
          created_by?: string | null
          energised_at?: string | null
          id?: string
          metadata_json?: Json
          meter_serial?: string | null
          mpan?: string | null
          notes?: string | null
          org_id?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["commissioning_status"]
          test_pack_file_id?: string | null
          test_pack_ref?: string | null
          updated_at?: string
          voltage_level?: string | null
          witness_name?: string | null
          witness_org?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissioning_records_test_pack_file_id_fkey"
            columns: ["test_pack_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissioning_records_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "commissioning_records_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          client_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          closed_at: string | null
          code: string | null
          created_at: string
          currency: string
          end_date: string | null
          id: string
          name: string
          notes: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          created_at: string
          crew_count: number | null
          crew_names: string | null
          hours_worked: number | null
          id: string
          issues: string | null
          log_date: string
          logged_by: string | null
          metadata_json: Json
          org_id: string
          photos_count: number
          site_id: string | null
          temperature_c: number | null
          updated_at: string
          weather: string | null
          work_done: string | null
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          crew_count?: number | null
          crew_names?: string | null
          hours_worked?: number | null
          id?: string
          issues?: string | null
          log_date?: string
          logged_by?: string | null
          metadata_json?: Json
          org_id: string
          photos_count?: number
          site_id?: string | null
          temperature_c?: number | null
          updated_at?: string
          weather?: string | null
          work_done?: string | null
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          crew_count?: number | null
          crew_names?: string | null
          hours_worked?: number | null
          id?: string
          issues?: string | null
          log_date?: string
          logged_by?: string | null
          metadata_json?: Json
          org_id?: string
          photos_count?: number
          site_id?: string | null
          temperature_c?: number | null
          updated_at?: string
          weather?: string | null
          work_done?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "daily_logs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_entities: {
        Row: {
          archived_at: string
          archived_by: string | null
          entity_id: string
          entity_type: string
          id: string
          onedrive_archive_path: string | null
          parent_id: string | null
          parent_type: string | null
          purged_at: string | null
          reason: string | null
          restored_at: string | null
          restored_by: string | null
          retention_expires_at: string
          snapshot: Json
          status: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          onedrive_archive_path?: string | null
          parent_id?: string | null
          parent_type?: string | null
          purged_at?: string | null
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          retention_expires_at?: string
          snapshot: Json
          status?: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          onedrive_archive_path?: string | null
          parent_id?: string | null
          parent_type?: string | null
          purged_at?: string | null
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          retention_expires_at?: string
          snapshot?: Json
          status?: string
        }
        Relationships: []
      }
      design_cables: {
        Row: {
          cable_type: string
          coordinates: Json
          created_at: string
          created_by: string
          id: string
          label: string | null
          length_m: number
          properties_json: Json
          scenario_id: string | null
          study_id: string
        }
        Insert: {
          cable_type: string
          coordinates?: Json
          created_at?: string
          created_by: string
          id?: string
          label?: string | null
          length_m?: number
          properties_json?: Json
          scenario_id?: string | null
          study_id: string
        }
        Update: {
          cable_type?: string
          coordinates?: Json
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          length_m?: number
          properties_json?: Json
          scenario_id?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_cables_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      design_elements: {
        Row: {
          created_at: string
          created_by: string
          element_type: string
          id: string
          label: string | null
          lat: number
          lng: number
          properties_json: Json
          scenario_id: string | null
          study_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          element_type: string
          id?: string
          label?: string | null
          lat: number
          lng: number
          properties_json?: Json
          scenario_id?: string | null
          study_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          element_type?: string
          id?: string
          label?: string | null
          lat?: number
          lng?: number
          properties_json?: Json
          scenario_id?: string | null
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_elements_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      design_reviews: {
        Row: {
          comments: string | null
          created_at: string
          decided_at: string
          decision: string
          design_submission_id: string
          id: string
          reviewer_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          decided_at?: string
          decision: string
          design_submission_id: string
          id?: string
          reviewer_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          decided_at?: string
          decision?: string
          design_submission_id?: string
          id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_reviews_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "design_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_reviews_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["ev_design_id"]
          },
          {
            foreignKeyName: "design_reviews_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["icp_design_id"]
          },
        ]
      }
      design_scenarios: {
        Row: {
          cost_high: number | null
          cost_low: number | null
          cost_mid: number | null
          created_at: string
          created_by: string
          demand_kva: number | null
          demand_kw: number | null
          dno: string | null
          id: string
          is_active: boolean
          name: string
          option_type: string | null
          recommendation: string | null
          risk_rating: string | null
          score: number | null
          status: string
          study_id: string
          updated_at: string
          voltage_level: string | null
        }
        Insert: {
          cost_high?: number | null
          cost_low?: number | null
          cost_mid?: number | null
          created_at?: string
          created_by: string
          demand_kva?: number | null
          demand_kw?: number | null
          dno?: string | null
          id?: string
          is_active?: boolean
          name: string
          option_type?: string | null
          recommendation?: string | null
          risk_rating?: string | null
          score?: number | null
          status?: string
          study_id: string
          updated_at?: string
          voltage_level?: string | null
        }
        Update: {
          cost_high?: number | null
          cost_low?: number | null
          cost_mid?: number | null
          created_at?: string
          created_by?: string
          demand_kva?: number | null
          demand_kw?: number | null
          dno?: string | null
          id?: string
          is_active?: boolean
          name?: string
          option_type?: string | null
          recommendation?: string | null
          risk_rating?: string | null
          score?: number | null
          status?: string
          study_id?: string
          updated_at?: string
          voltage_level?: string | null
        }
        Relationships: []
      }
      design_submissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decision: string | null
          design_type: string | null
          id: string
          is_current: boolean
          notes: string | null
          revision: number
          site_id: string | null
          status: string
          submitted_at: string
          submitted_by_partner_id: string | null
          submitted_by_user_id: string | null
          title: string | null
          updated_at: string
          work_package_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision?: string | null
          design_type?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          revision?: number
          site_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by_partner_id?: string | null
          submitted_by_user_id?: string | null
          title?: string | null
          updated_at?: string
          work_package_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision?: string | null
          design_type?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          revision?: number
          site_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by_partner_id?: string | null
          submitted_by_user_id?: string | null
          title?: string | null
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "design_submissions_submitted_by_partner_id_fkey"
            columns: ["submitted_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_submissions_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "design_submissions_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      design_workflow_events: {
        Row: {
          created_at: string
          created_by: string
          event_label: string | null
          event_type: string
          id: string
          metadata_json: Json
          scenario_id: string | null
          study_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_label?: string | null
          event_type: string
          id?: string
          metadata_json?: Json
          scenario_id?: string | null
          study_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_label?: string | null
          event_type?: string
          id?: string
          metadata_json?: Json
          scenario_id?: string | null
          study_id?: string
        }
        Relationships: []
      }
      dno_dataset_registry: {
        Row: {
          active: boolean
          attachment_urls: Json | null
          created_at: string
          dataset_id: string
          description: string | null
          dno: string
          endpoint_export_csv: string | null
          endpoint_export_geojson: string | null
          endpoint_export_json: string | null
          endpoint_export_parquet: string | null
          endpoint_metadata: string | null
          endpoint_records: string | null
          export_formats: Json | null
          fields_json: Json | null
          geometry_field: string | null
          geometry_type: string | null
          id: string
          is_geospatial: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_rows: number | null
          last_sync_status: string | null
          linked_layer_id: string | null
          portal_url: string | null
          primary_key_guess: string | null
          record_count: number | null
          refresh_strategy: string
          schedule: string | null
          schema_hash: string | null
          storage_table: string | null
          sync_cursor: Json | null
          title: string | null
          updated_at: string
          updated_at_source: string | null
        }
        Insert: {
          active?: boolean
          attachment_urls?: Json | null
          created_at?: string
          dataset_id: string
          description?: string | null
          dno?: string
          endpoint_export_csv?: string | null
          endpoint_export_geojson?: string | null
          endpoint_export_json?: string | null
          endpoint_export_parquet?: string | null
          endpoint_metadata?: string | null
          endpoint_records?: string | null
          export_formats?: Json | null
          fields_json?: Json | null
          geometry_field?: string | null
          geometry_type?: string | null
          id?: string
          is_geospatial?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_rows?: number | null
          last_sync_status?: string | null
          linked_layer_id?: string | null
          portal_url?: string | null
          primary_key_guess?: string | null
          record_count?: number | null
          refresh_strategy?: string
          schedule?: string | null
          schema_hash?: string | null
          storage_table?: string | null
          sync_cursor?: Json | null
          title?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Update: {
          active?: boolean
          attachment_urls?: Json | null
          created_at?: string
          dataset_id?: string
          description?: string | null
          dno?: string
          endpoint_export_csv?: string | null
          endpoint_export_geojson?: string | null
          endpoint_export_json?: string | null
          endpoint_export_parquet?: string | null
          endpoint_metadata?: string | null
          endpoint_records?: string | null
          export_formats?: Json | null
          fields_json?: Json | null
          geometry_field?: string | null
          geometry_type?: string | null
          id?: string
          is_geospatial?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_rows?: number | null
          last_sync_status?: string | null
          linked_layer_id?: string | null
          portal_url?: string | null
          primary_key_guess?: string | null
          record_count?: number | null
          refresh_strategy?: string
          schedule?: string | null
          schema_hash?: string | null
          storage_table?: string | null
          sync_cursor?: Json | null
          title?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dno_dataset_registry_linked_layer_id_fkey"
            columns: ["linked_layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      dno_offer_sites: {
        Row: {
          created_at: string
          dno_offer_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          dno_offer_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          dno_offer_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dno_offer_sites_dno_offer_id_fkey"
            columns: ["dno_offer_id"]
            isOneToOne: false
            referencedRelation: "dno_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dno_offer_sites_dno_offer_id_fkey"
            columns: ["dno_offer_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_offer_id"]
          },
          {
            foreignKeyName: "dno_offer_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dno_offer_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      dno_offers: {
        Row: {
          created_at: string
          created_by: string | null
          dno_key: string | null
          expires_at: string | null
          id: string
          notes: string | null
          offer_ref: string
          offer_value: number | null
          org_id: string | null
          received_at: string | null
          revision: number
          site_id: string | null
          status: string
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dno_key?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          offer_ref: string
          offer_value?: number | null
          org_id?: string | null
          received_at?: string | null
          revision?: number
          site_id?: string | null
          status?: string
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dno_key?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          offer_ref?: string
          offer_value?: number | null
          org_id?: string | null
          received_at?: string | null
          revision?: number
          site_id?: string | null
          status?: string
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dno_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dno_offers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dno_offers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "dno_offers_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "dno_offers_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      dno_rulesets: {
        Row: {
          created_at: string
          dno_code: string
          id: string
          is_active: boolean
          rules_json: Json
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          dno_code: string
          id?: string
          is_active?: boolean
          rules_json?: Json
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          dno_code?: string
          id?: string
          is_active?: boolean
          rules_json?: Json
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entity_move_log: {
        Row: {
          error_message: string | null
          from_wp_id: string | null
          id: string
          moved_at: string
          moved_by: string | null
          partner_change: Json | null
          reason: string
          records_moved: Json
          site_id: string
          status: string
          to_wp_id: string
        }
        Insert: {
          error_message?: string | null
          from_wp_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          partner_change?: Json | null
          reason: string
          records_moved?: Json
          site_id: string
          status?: string
          to_wp_id: string
        }
        Update: {
          error_message?: string | null
          from_wp_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          partner_change?: Json | null
          reason?: string
          records_moved?: Json
          site_id?: string
          status?: string
          to_wp_id?: string
        }
        Relationships: []
      }
      estimate_allowances: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string | null
          estimate_id: string
          id: string
          name: string
          sort_index: number
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          estimate_id: string
          id?: string
          name: string
          sort_index?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          estimate_id?: string
          id?: string
          name?: string
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_allowances_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_groups: {
        Row: {
          collapsed: boolean
          color: string | null
          cost_category: string | null
          cost_code: string | null
          created_at: string
          default_predecessor_stage_code: string | null
          estimate_id: string
          id: string
          name: string
          sort_index: number
          stage_code: string | null
          stage_color: string | null
          stage_order: number | null
          updated_at: string
        }
        Insert: {
          collapsed?: boolean
          color?: string | null
          cost_category?: string | null
          cost_code?: string | null
          created_at?: string
          default_predecessor_stage_code?: string | null
          estimate_id: string
          id?: string
          name: string
          sort_index?: number
          stage_code?: string | null
          stage_color?: string | null
          stage_order?: number | null
          updated_at?: string
        }
        Update: {
          collapsed?: boolean
          color?: string | null
          cost_category?: string | null
          cost_code?: string | null
          created_at?: string
          default_predecessor_stage_code?: string | null
          estimate_id?: string
          id?: string
          name?: string
          sort_index?: number
          stage_code?: string | null
          stage_color?: string | null
          stage_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_groups_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_lines: {
        Row: {
          attribute_group: string | null
          boq_description: string | null
          boq_item_name: string
          calculate_time: boolean | null
          charge_out_rate_used: string | null
          compare_list: string | null
          compare_title: string | null
          contingency_pct: number | null
          conversion_type: string | null
          cost_category: string | null
          cost_code: string | null
          created_at: string
          discount: number
          estimate_id: string
          fixed_price: boolean | null
          flexible_qty: boolean | null
          grand_total: number | null
          group_id: string | null
          id: string
          image_link: string | null
          include_in_create_task: boolean | null
          is_allowance: boolean | null
          is_prelim: boolean
          item_logic: string | null
          itemised: boolean | null
          lock_markup_dollar: boolean | null
          locked: boolean
          markup_dollar: number | null
          markup_pct: number | null
          markup_type: string | null
          milestone_for_sync: string | null
          net_markup_pct: number | null
          no_resources: number | null
          parent_line_id: string | null
          partner_visible: boolean
          pricing_notes: string | null
          product_service: string | null
          product_type: string | null
          project_description: string | null
          project_stage: string | null
          project_sync_type: string | null
          project_task_name: string | null
          qty: number
          rate_card_version_id: string | null
          rate_code: string | null
          rate_item_id: string | null
          recipe_id: string | null
          rfq_required: boolean | null
          show_image_in_proposal: boolean | null
          solution_link: string | null
          sort_index: number
          split_labour_materials: boolean | null
          stage: string | null
          sub_total: number
          supplier: string | null
          task_owner: string | null
          time_measure: string | null
          time_value: number | null
          total_cost: number
          total_markup: number
          total_price: number
          unit_cost: number
          unit_price: number
          uom: string | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          attribute_group?: string | null
          boq_description?: string | null
          boq_item_name?: string
          calculate_time?: boolean | null
          charge_out_rate_used?: string | null
          compare_list?: string | null
          compare_title?: string | null
          contingency_pct?: number | null
          conversion_type?: string | null
          cost_category?: string | null
          cost_code?: string | null
          created_at?: string
          discount?: number
          estimate_id: string
          fixed_price?: boolean | null
          flexible_qty?: boolean | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          image_link?: string | null
          include_in_create_task?: boolean | null
          is_allowance?: boolean | null
          is_prelim?: boolean
          item_logic?: string | null
          itemised?: boolean | null
          lock_markup_dollar?: boolean | null
          locked?: boolean
          markup_dollar?: number | null
          markup_pct?: number | null
          markup_type?: string | null
          milestone_for_sync?: string | null
          net_markup_pct?: number | null
          no_resources?: number | null
          parent_line_id?: string | null
          partner_visible?: boolean
          pricing_notes?: string | null
          product_service?: string | null
          product_type?: string | null
          project_description?: string | null
          project_stage?: string | null
          project_sync_type?: string | null
          project_task_name?: string | null
          qty?: number
          rate_card_version_id?: string | null
          rate_code?: string | null
          rate_item_id?: string | null
          recipe_id?: string | null
          rfq_required?: boolean | null
          show_image_in_proposal?: boolean | null
          solution_link?: string | null
          sort_index?: number
          split_labour_materials?: boolean | null
          stage?: string | null
          sub_total?: number
          supplier?: string | null
          task_owner?: string | null
          time_measure?: string | null
          time_value?: number | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          unit_cost?: number
          unit_price?: number
          uom?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          attribute_group?: string | null
          boq_description?: string | null
          boq_item_name?: string
          calculate_time?: boolean | null
          charge_out_rate_used?: string | null
          compare_list?: string | null
          compare_title?: string | null
          contingency_pct?: number | null
          conversion_type?: string | null
          cost_category?: string | null
          cost_code?: string | null
          created_at?: string
          discount?: number
          estimate_id?: string
          fixed_price?: boolean | null
          flexible_qty?: boolean | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          image_link?: string | null
          include_in_create_task?: boolean | null
          is_allowance?: boolean | null
          is_prelim?: boolean
          item_logic?: string | null
          itemised?: boolean | null
          lock_markup_dollar?: boolean | null
          locked?: boolean
          markup_dollar?: number | null
          markup_pct?: number | null
          markup_type?: string | null
          milestone_for_sync?: string | null
          net_markup_pct?: number | null
          no_resources?: number | null
          parent_line_id?: string | null
          partner_visible?: boolean
          pricing_notes?: string | null
          product_service?: string | null
          product_type?: string | null
          project_description?: string | null
          project_stage?: string | null
          project_sync_type?: string | null
          project_task_name?: string | null
          qty?: number
          rate_card_version_id?: string | null
          rate_code?: string | null
          rate_item_id?: string | null
          recipe_id?: string | null
          rfq_required?: boolean | null
          show_image_in_proposal?: boolean | null
          solution_link?: string | null
          sort_index?: number
          split_labour_materials?: boolean | null
          stage?: string | null
          sub_total?: number
          supplier?: string | null
          task_owner?: string | null
          time_measure?: string | null
          time_value?: number | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          unit_cost?: number
          unit_price?: number
          uom?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "estimate_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_lines_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_lines_rate_item_id_fkey"
            columns: ["rate_item_id"]
            isOneToOne: false
            referencedRelation: "rate_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_lines_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "estimate_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_recipes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          build_type: Database["public"]["Enums"]["recipe_build_type"]
          contract_id: string
          created_at: string
          delivering_partner: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          name: string
          notes: string | null
          socket_count: number | null
          source_workbook: string | null
          status: Database["public"]["Enums"]["rate_card_status"]
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          build_type?: Database["public"]["Enums"]["recipe_build_type"]
          contract_id: string
          created_at?: string
          delivering_partner?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          name: string
          notes?: string | null
          socket_count?: number | null
          source_workbook?: string | null
          status?: Database["public"]["Enums"]["rate_card_status"]
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          build_type?: Database["public"]["Enums"]["recipe_build_type"]
          contract_id?: string
          created_at?: string
          delivering_partner?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          name?: string
          notes?: string | null
          socket_count?: number | null
          source_workbook?: string | null
          status?: Database["public"]["Enums"]["rate_card_status"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_recipes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          awarded_at: string | null
          awarded_by: string | null
          awarded_partner_id: string | null
          boq_compact_view: boolean
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          exchange_rate: number
          expense_cost: number
          grand_total: number
          gross_margin_pct: number | null
          hire_cost: number
          id: string
          is_current: boolean
          labour_cost: number
          labour_hours: number
          locked: boolean
          material_cost: number
          name: string
          net_markup_pct: number | null
          org_id: string | null
          parent_estimate_id: string | null
          prelims_amount: number | null
          prelims_pct: number | null
          project_id: string | null
          rate_card_version_id: string | null
          ref: string | null
          revision: number
          show_recipe_totals: boolean
          source_estimate_id: string | null
          status: string
          sub_total: number
          subcontractor_cost: number
          total_cost: number
          total_discount: number
          total_markup: number
          total_price: number
          updated_at: string
          vat_total: number
          visibility_lens_default: string | null
          work_package_id: string | null
        }
        Insert: {
          awarded_at?: string | null
          awarded_by?: string | null
          awarded_partner_id?: string | null
          boq_compact_view?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_cost?: number
          grand_total?: number
          gross_margin_pct?: number | null
          hire_cost?: number
          id?: string
          is_current?: boolean
          labour_cost?: number
          labour_hours?: number
          locked?: boolean
          material_cost?: number
          name?: string
          net_markup_pct?: number | null
          org_id?: string | null
          parent_estimate_id?: string | null
          prelims_amount?: number | null
          prelims_pct?: number | null
          project_id?: string | null
          rate_card_version_id?: string | null
          ref?: string | null
          revision?: number
          show_recipe_totals?: boolean
          source_estimate_id?: string | null
          status?: string
          sub_total?: number
          subcontractor_cost?: number
          total_cost?: number
          total_discount?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          vat_total?: number
          visibility_lens_default?: string | null
          work_package_id?: string | null
        }
        Update: {
          awarded_at?: string | null
          awarded_by?: string | null
          awarded_partner_id?: string | null
          boq_compact_view?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_cost?: number
          grand_total?: number
          gross_margin_pct?: number | null
          hire_cost?: number
          id?: string
          is_current?: boolean
          labour_cost?: number
          labour_hours?: number
          locked?: boolean
          material_cost?: number
          name?: string
          net_markup_pct?: number | null
          org_id?: string | null
          parent_estimate_id?: string | null
          prelims_amount?: number | null
          prelims_pct?: number | null
          project_id?: string | null
          rate_card_version_id?: string | null
          ref?: string | null
          revision?: number
          show_recipe_totals?: boolean
          source_estimate_id?: string | null
          status?: string
          sub_total?: number
          subcontractor_cost?: number
          total_cost?: number
          total_discount?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          vat_total?: number
          visibility_lens_default?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_awarded_partner_id_fkey"
            columns: ["awarded_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_parent_estimate_id_fkey"
            columns: ["parent_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_hub_rulesets: {
        Row: {
          created_at: string
          created_by: string | null
          dno_key: string
          id: string
          is_active: boolean
          rule_set_id: string
          rules_json: Json
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dno_key: string
          id?: string
          is_active?: boolean
          rule_set_id?: string
          rules_json?: Json
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dno_key?: string
          id?: string
          is_active?: boolean
          rule_set_id?: string
          rules_json?: Json
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          org_id: string | null
          scope: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          org_id?: string | null
          scope: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          org_id?: string | null
          scope?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      feeders_ehv: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          feeder_ref: string | null
          geom: unknown
          id: string
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      feeders_hv_33kv: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          feeder_ref: string | null
          geom: unknown
          id: string
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      feeders_hv_66kv: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          feeder_ref: string | null
          geom: unknown
          id: string
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      frameworks: {
        Row: {
          awarding_body: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          rate_card_ref: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          awarding_body?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          rate_card_ref?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          awarding_body?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          rate_card_ref?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gas_dataset_registry: {
        Row: {
          active: boolean
          attachment_urls: Json | null
          created_at: string
          dataset_id: string
          description: string | null
          dno: string
          endpoint_export_csv: string | null
          endpoint_export_geojson: string | null
          endpoint_export_json: string | null
          endpoint_export_parquet: string | null
          endpoint_metadata: string | null
          endpoint_records: string | null
          export_formats: Json | null
          fields_json: Json | null
          geometry_field: string | null
          geometry_type: string | null
          id: string
          is_geospatial: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_rows: number | null
          last_sync_status: string | null
          linked_layer_id: string | null
          portal_url: string | null
          primary_key_guess: string | null
          record_count: number | null
          refresh_strategy: string
          schedule: string | null
          schema_hash: string | null
          storage_table: string | null
          title: string | null
          updated_at: string
          updated_at_source: string | null
        }
        Insert: {
          active?: boolean
          attachment_urls?: Json | null
          created_at?: string
          dataset_id: string
          description?: string | null
          dno?: string
          endpoint_export_csv?: string | null
          endpoint_export_geojson?: string | null
          endpoint_export_json?: string | null
          endpoint_export_parquet?: string | null
          endpoint_metadata?: string | null
          endpoint_records?: string | null
          export_formats?: Json | null
          fields_json?: Json | null
          geometry_field?: string | null
          geometry_type?: string | null
          id?: string
          is_geospatial?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_rows?: number | null
          last_sync_status?: string | null
          linked_layer_id?: string | null
          portal_url?: string | null
          primary_key_guess?: string | null
          record_count?: number | null
          refresh_strategy?: string
          schedule?: string | null
          schema_hash?: string | null
          storage_table?: string | null
          title?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Update: {
          active?: boolean
          attachment_urls?: Json | null
          created_at?: string
          dataset_id?: string
          description?: string | null
          dno?: string
          endpoint_export_csv?: string | null
          endpoint_export_geojson?: string | null
          endpoint_export_json?: string | null
          endpoint_export_parquet?: string | null
          endpoint_metadata?: string | null
          endpoint_records?: string | null
          export_formats?: Json | null
          fields_json?: Json | null
          geometry_field?: string | null
          geometry_type?: string | null
          id?: string
          is_geospatial?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_rows?: number | null
          last_sync_status?: string | null
          linked_layer_id?: string | null
          portal_url?: string | null
          primary_key_guess?: string | null
          record_count?: number | null
          refresh_strategy?: string
          schedule?: string | null
          schema_hash?: string | null
          storage_table?: string | null
          title?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gas_dataset_registry_linked_layer_id_fkey"
            columns: ["linked_layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_cables: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          capacity_flag: string | null
          capacity_unit: string | null
          capacity_value: number | null
          created_at: string
          dno: string
          geom: unknown
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          created_at?: string
          dno: string
          geom?: unknown
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          capacity_flag?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          created_at?: string
          dno?: string
          geom?: unknown
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_cables_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_constraints: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          constraint_type: string | null
          created_at: string
          dno: string
          geom: unknown
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
          status: string | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          constraint_type?: string | null
          created_at?: string
          dno: string
          geom?: unknown
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
          status?: string | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          constraint_type?: string | null
          created_at?: string
          dno?: string
          geom?: unknown
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_constraints_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_feeders: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          created_at: string
          dno: string
          feeder_ref: string | null
          geom: unknown
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno: string
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno?: string
          feeder_ref?: string | null
          geom?: unknown
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_feeders_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_points: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          created_at: string
          dno: string
          geom: unknown
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno: string
          geom?: unknown
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno?: string
          geom?: unknown
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_points_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_polygons: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          created_at: string
          dno: string
          geom: unknown
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno: string
          geom?: unknown
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          created_at?: string
          dno?: string
          geom?: unknown
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_polygons_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_substations: {
        Row: {
          asset_id: string | null
          attrs_json: Json | null
          capacity_kw: number | null
          created_at: string
          demand_kw: number | null
          dno: string
          geom: unknown
          headroom_kw: number | null
          id: string
          layer_id: string
          name: string | null
          source_date: string | null
          status: string | null
          utilisation_pct: number | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id?: string | null
          attrs_json?: Json | null
          capacity_kw?: number | null
          created_at?: string
          demand_kw?: number | null
          dno: string
          geom?: unknown
          headroom_kw?: number | null
          id?: string
          layer_id: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          utilisation_pct?: number | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string | null
          attrs_json?: Json | null
          capacity_kw?: number | null
          created_at?: string
          demand_kw?: number | null
          dno?: string
          geom?: unknown
          headroom_kw?: number | null
          id?: string
          layer_id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          utilisation_pct?: number | null
          voltage_kv?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_substations_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_packs: {
        Row: {
          client_signed_at: string | null
          client_signed_by_email: string | null
          client_signed_by_name: string | null
          created_at: string
          created_by: string | null
          handover_notes: string | null
          id: string
          metadata_json: Json
          om_bundle_file_id: string | null
          org_id: string
          pc_signed_at: string | null
          pc_signed_by: string | null
          pc_signed_by_name: string | null
          signature_ip: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["handover_status"]
          updated_at: string
          warranty_period_months: number | null
          warranty_start_date: string | null
          work_package_id: string | null
        }
        Insert: {
          client_signed_at?: string | null
          client_signed_by_email?: string | null
          client_signed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          handover_notes?: string | null
          id?: string
          metadata_json?: Json
          om_bundle_file_id?: string | null
          org_id: string
          pc_signed_at?: string | null
          pc_signed_by?: string | null
          pc_signed_by_name?: string | null
          signature_ip?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["handover_status"]
          updated_at?: string
          warranty_period_months?: number | null
          warranty_start_date?: string | null
          work_package_id?: string | null
        }
        Update: {
          client_signed_at?: string | null
          client_signed_by_email?: string | null
          client_signed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          handover_notes?: string | null
          id?: string
          metadata_json?: Json
          om_bundle_file_id?: string | null
          org_id?: string
          pc_signed_at?: string | null
          pc_signed_by?: string | null
          pc_signed_by_name?: string | null
          signature_ip?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["handover_status"]
          updated_at?: string
          warranty_period_months?: number | null
          warranty_start_date?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_packs_om_bundle_file_id_fkey"
            columns: ["om_bundle_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_packs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "handover_packs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      highway_widths: {
        Row: {
          attrs_json: Json | null
          carriageway_m: number | null
          footway_m: number | null
          geom: unknown
          id: string
          restriction_flag: string | null
          segment_id: string
          source_date: string | null
        }
        Insert: {
          attrs_json?: Json | null
          carriageway_m?: number | null
          footway_m?: number | null
          geom?: unknown
          id?: string
          restriction_flag?: string | null
          segment_id: string
          source_date?: string | null
        }
        Update: {
          attrs_json?: Json | null
          carriageway_m?: number | null
          footway_m?: number | null
          geom?: unknown
          id?: string
          restriction_flag?: string | null
          segment_id?: string
          source_date?: string | null
        }
        Relationships: []
      }
      import_audit: {
        Row: {
          action: string
          actor_id: string | null
          batch_id: string
          created_at: string
          diff_json: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          batch_id: string
          created_at?: string
          diff_json?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          diff_json?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          approved_at: string | null
          created_at: string
          created_by: string
          duplicate_rows: number
          error_rows: number
          file_path: string | null
          filename: string | null
          id: string
          mapping_json: Json
          new_client_name: string | null
          new_programme_json: Json | null
          new_wp_json: Json | null
          org_id: string | null
          parent_batch_id: string | null
          rolled_back_at: string | null
          source: string
          status: string
          summary_json: Json
          target_client_id: string | null
          target_programme_id: string | null
          target_wp_id: string | null
          total_rows: number
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          created_by: string
          duplicate_rows?: number
          error_rows?: number
          file_path?: string | null
          filename?: string | null
          id?: string
          mapping_json?: Json
          new_client_name?: string | null
          new_programme_json?: Json | null
          new_wp_json?: Json | null
          org_id?: string | null
          parent_batch_id?: string | null
          rolled_back_at?: string | null
          source: string
          status?: string
          summary_json?: Json
          target_client_id?: string | null
          target_programme_id?: string | null
          target_wp_id?: string | null
          total_rows?: number
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          created_by?: string
          duplicate_rows?: number
          error_rows?: number
          file_path?: string | null
          filename?: string | null
          id?: string
          mapping_json?: Json
          new_client_name?: string | null
          new_programme_json?: Json | null
          new_wp_json?: Json | null
          org_id?: string | null
          parent_batch_id?: string | null
          rolled_back_at?: string | null
          source?: string
          status?: string
          summary_json?: Json
          target_client_id?: string | null
          target_programme_id?: string | null
          target_wp_id?: string | null
          total_rows?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_parent_batch_id_fkey"
            columns: ["parent_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_column_mappings: {
        Row: {
          created_at: string
          created_by: string
          id: string
          mapping_json: Json
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          mapping_json: Json
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          mapping_json?: Json
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_created_records: {
        Row: {
          batch_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reversible: boolean
        }
        Insert: {
          batch_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reversible?: boolean
        }
        Update: {
          batch_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reversible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "import_created_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          dedupe_key: string | null
          errors_json: Json
          geocode_confidence: number | null
          geocode_source: string | null
          id: string
          lat: number | null
          lng: number | null
          mapped_json: Json
          raw_json: Json
          resolved_site_id: string | null
          row_index: number
          status: string
          updated_at: string
          warnings_json: Json
        }
        Insert: {
          batch_id: string
          created_at?: string
          dedupe_key?: string | null
          errors_json?: Json
          geocode_confidence?: number | null
          geocode_source?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          mapped_json?: Json
          raw_json: Json
          resolved_site_id?: string | null
          row_index: number
          status?: string
          updated_at?: string
          warnings_json?: Json
        }
        Update: {
          batch_id?: string
          created_at?: string
          dedupe_key?: string | null
          errors_json?: Json
          geocode_confidence?: number | null
          geocode_source?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          mapped_json?: Json
          raw_json?: Json
          resolved_site_id?: string | null
          row_index?: number
          status?: string
          updated_at?: string
          warnings_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          created_at: string
          created_by: string | null
          defects_json: Json
          followup_due: string | null
          followup_required: boolean
          id: string
          inspected_at: string
          inspection_type: string
          inspector_id: string | null
          inspector_name: string | null
          metadata_json: Json
          notes: string | null
          org_id: string
          result: Database["public"]["Enums"]["inspection_result"]
          score: number | null
          site_id: string | null
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          defects_json?: Json
          followup_due?: string | null
          followup_required?: boolean
          id?: string
          inspected_at?: string
          inspection_type: string
          inspector_id?: string | null
          inspector_name?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id: string
          result?: Database["public"]["Enums"]["inspection_result"]
          score?: number | null
          site_id?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          defects_json?: Json
          followup_due?: string | null
          followup_required?: boolean
          id?: string
          inspected_at?: string
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id?: string
          result?: Database["public"]["Enums"]["inspection_result"]
          score?: number | null
          site_id?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "inspections_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      layer_registry: {
        Row: {
          attribution: string | null
          bbox: Json | null
          category: string
          created_at: string
          created_by: string | null
          display_name: string
          dno: string
          enabled: boolean | null
          feature_count: number | null
          geometry_type: string
          id: string
          legend_json: Json
          max_zoom: number | null
          min_zoom: number | null
          slug: string
          source_date: string | null
          source_type: string
          storage_table: string
          style_json: Json
          subcategory: string | null
          updated_at: string
          visible_by_default: boolean | null
        }
        Insert: {
          attribution?: string | null
          bbox?: Json | null
          category: string
          created_at?: string
          created_by?: string | null
          display_name: string
          dno: string
          enabled?: boolean | null
          feature_count?: number | null
          geometry_type?: string
          id?: string
          legend_json?: Json
          max_zoom?: number | null
          min_zoom?: number | null
          slug: string
          source_date?: string | null
          source_type?: string
          storage_table: string
          style_json?: Json
          subcategory?: string | null
          updated_at?: string
          visible_by_default?: boolean | null
        }
        Update: {
          attribution?: string | null
          bbox?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          dno?: string
          enabled?: boolean | null
          feature_count?: number | null
          geometry_type?: string
          id?: string
          legend_json?: Json
          max_zoom?: number | null
          min_zoom?: number | null
          slug?: string
          source_date?: string | null
          source_type?: string
          storage_table?: string
          style_json?: Json
          subcategory?: string | null
          updated_at?: string
          visible_by_default?: boolean | null
        }
        Relationships: []
      }
      lv_capacity_lookup: {
        Row: {
          created_at: string
          direct_kva: number
          ducted_kva: number
          ev_compatible_55kva_80a: boolean
          family: string
          green_compatible: boolean
          id: string
          notes: string | null
          priority_tier: number
          size_unit: string
          size_value: number
        }
        Insert: {
          created_at?: string
          direct_kva?: number
          ducted_kva?: number
          ev_compatible_55kva_80a?: boolean
          family: string
          green_compatible?: boolean
          id?: string
          notes?: string | null
          priority_tier?: number
          size_unit: string
          size_value: number
        }
        Update: {
          created_at?: string
          direct_kva?: number
          ducted_kva?: number
          ev_compatible_55kva_80a?: boolean
          family?: string
          green_compatible?: boolean
          id?: string
          notes?: string | null
          priority_tier?: number
          size_unit?: string
          size_value?: number
        }
        Relationships: []
      }
      materials_deliveries: {
        Row: {
          condition_notes: string | null
          created_at: string
          created_by: string | null
          delivered_at: string
          delivery_note_ref: string | null
          description: string | null
          id: string
          item: string
          metadata_json: Json
          org_id: string
          po_line_id: string | null
          purchase_order_id: string | null
          qty: number
          received_by: string | null
          received_by_name: string | null
          site_id: string | null
          supplier: string | null
          uom: string | null
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          condition_notes?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          delivery_note_ref?: string | null
          description?: string | null
          id?: string
          item: string
          metadata_json?: Json
          org_id: string
          po_line_id?: string | null
          purchase_order_id?: string | null
          qty?: number
          received_by?: string | null
          received_by_name?: string | null
          site_id?: string | null
          supplier?: string | null
          uom?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          condition_notes?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          delivery_note_ref?: string | null
          description?: string | null
          id?: string
          item?: string
          metadata_json?: Json
          org_id?: string
          po_line_id?: string | null
          purchase_order_id?: string | null
          qty?: number
          received_by?: string | null
          received_by_name?: string | null
          site_id?: string | null
          supplier?: string | null
          uom?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_deliveries_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_deliveries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_deliveries_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "materials_deliveries_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      ndp_projects: {
        Row: {
          attrs_json: Json | null
          geom: unknown
          id: string
          planned_date: string | null
          project_id: string
          source_date: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          planned_date?: string | null
          project_id: string
          source_date?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          planned_date?: string | null
          project_id?: string
          source_date?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          message: string
          read_at: string | null
          study_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message: string
          read_at?: string | null
          study_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          study_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      onedrive_folder_cache: {
        Row: {
          category: string
          created_at: string
          folder_path: string
          id: string
          onedrive_item_id: string
          project_id: string | null
          work_package_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          folder_path: string
          id?: string
          onedrive_item_id: string
          project_id?: string | null
          work_package_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          folder_path?: string
          id?: string
          onedrive_item_id?: string
          project_id?: string | null
          work_package_id?: string | null
        }
        Relationships: []
      }
      onedrive_uploads: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          error: string | null
          filename: string | null
          id: string
          onedrive_item_id: string | null
          path: string
          project_id: string | null
          status: string
          web_url: string | null
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          error?: string | null
          filename?: string | null
          id?: string
          onedrive_item_id?: string | null
          path: string
          project_id?: string | null
          status: string
          web_url?: string | null
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          filename?: string | null
          id?: string
          onedrive_item_id?: string | null
          path?: string
          project_id?: string | null
          status?: string
          web_url?: string | null
          work_package_id?: string | null
        }
        Relationships: []
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      osm_ingestion_meta: {
        Row: {
          bbox: Json
          error_detail: string | null
          fetched_at: string
          fetched_by: string | null
          id: string
          layer_slug: string
          query_hash: string
          query_text: string | null
          row_count: number | null
          source_endpoint: string | null
          status: string
          tile_id: string | null
        }
        Insert: {
          bbox: Json
          error_detail?: string | null
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          layer_slug: string
          query_hash: string
          query_text?: string | null
          row_count?: number | null
          source_endpoint?: string | null
          status?: string
          tile_id?: string | null
        }
        Update: {
          bbox?: Json
          error_detail?: string | null
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          layer_slug?: string
          query_hash?: string
          query_text?: string | null
          row_count?: number | null
          source_endpoint?: string | null
          status?: string
          tile_id?: string | null
        }
        Relationships: []
      }
      osm_tile_cache: {
        Row: {
          expires_at: string
          feature_count: number
          fetched_at: string
          geojson: Json
          id: string
          layer_slug: string
          query_hash: string
          source_endpoint: string | null
          tile_id: string
        }
        Insert: {
          expires_at?: string
          feature_count?: number
          fetched_at?: string
          geojson?: Json
          id?: string
          layer_slug: string
          query_hash: string
          source_endpoint?: string | null
          tile_id: string
        }
        Update: {
          expires_at?: string
          feature_count?: number
          fetched_at?: string
          geojson?: Json
          id?: string
          layer_slug?: string
          query_hash?: string
          source_endpoint?: string | null
          tile_id?: string
        }
        Relationships: []
      }
      partner_users: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          created_by: string | null
          default_rate_card_id: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          primary_contact_email: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_rate_card_id?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          primary_contact_email?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_rate_card_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          primary_contact_email?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_default_rate_card_id_fkey"
            columns: ["default_rate_card_id"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          applied_on: string | null
          approved_on: string | null
          authority: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          metadata_json: Json
          notes: string | null
          org_id: string
          permit_type: string
          reference: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["permit_status"]
          updated_at: string
          valid_from: string | null
          work_package_id: string | null
        }
        Insert: {
          applied_on?: string | null
          approved_on?: string | null
          authority?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          metadata_json?: Json
          notes?: string | null
          org_id: string
          permit_type: string
          reference?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          updated_at?: string
          valid_from?: string | null
          work_package_id?: string | null
        }
        Update: {
          applied_on?: string | null
          approved_on?: string | null
          authority?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          metadata_json?: Json
          notes?: string | null
          org_id?: string
          permit_type?: string
          reference?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          updated_at?: string
          valid_from?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "permits_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_sites: {
        Row: {
          po_line_id: string
          qty: number | null
          site_id: string
          value: number | null
        }
        Insert: {
          po_line_id: string
          qty?: number | null
          site_id: string
          value?: number | null
        }
        Update: {
          po_line_id?: string
          qty?: number | null
          site_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_line_sites_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      po_lines: {
        Row: {
          created_at: string
          description: string | null
          estimate_line_id: string | null
          id: string
          line_value: number
          po_id: string
          sort_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimate_line_id?: string | null
          id?: string
          line_value?: number
          po_id: string
          sort_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimate_line_id?: string | null
          id?: string
          line_value?: number
          po_id?: string
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_estimate_line_id_fkey"
            columns: ["estimate_line_id"]
            isOneToOne: false
            referencedRelation: "estimate_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      poc_estimate_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          line_cost: number | null
          line_price: number | null
          poc_estimate_id: string
          quantity: number
          rate_item_id: string | null
          sort_index: number
          unit: string
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          line_cost?: number | null
          line_price?: number | null
          poc_estimate_id: string
          quantity?: number
          rate_item_id?: string | null
          sort_index?: number
          unit?: string
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_cost?: number | null
          line_price?: number | null
          poc_estimate_id?: string
          quantity?: number
          rate_item_id?: string | null
          sort_index?: number
          unit?: string
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poc_estimate_lines_poc_estimate_id_fkey"
            columns: ["poc_estimate_id"]
            isOneToOne: false
            referencedRelation: "poc_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_estimate_lines_rate_item_id_fkey"
            columns: ["rate_item_id"]
            isOneToOne: false
            referencedRelation: "rate_items"
            referencedColumns: ["id"]
          },
        ]
      }
      poc_estimates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          dno_offer_id: string | null
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          ref: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["poc_estimate_status"]
          total_cost: number
          total_price: number
          updated_at: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          dno_offer_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          rate_card_version_id?: string | null
          ref?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["poc_estimate_status"]
          total_cost?: number
          total_price?: number
          updated_at?: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          dno_offer_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          rate_card_version_id?: string | null
          ref?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["poc_estimate_status"]
          total_cost?: number
          total_price?: number
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poc_estimates_dno_offer_id_fkey"
            columns: ["dno_offer_id"]
            isOneToOne: false
            referencedRelation: "dno_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_estimates_dno_offer_id_fkey"
            columns: ["dno_offer_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_offer_id"]
          },
          {
            foreignKeyName: "poc_estimates_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_estimates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_estimates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "poc_estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "poc_estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      primary_substations_33kv: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          geom: unknown
          id: string
          name: string | null
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      primary_substations_66kv: {
        Row: {
          asset_id: string
          attrs_json: Json | null
          geom: unknown
          id: string
          name: string | null
          source_date: string | null
          status: string | null
          voltage_kv: number | null
        }
        Insert: {
          asset_id: string
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Update: {
          asset_id?: string
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          name?: string | null
          source_date?: string | null
          status?: string | null
          voltage_kv?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          is_approved: boolean
          is_platform_admin: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          is_platform_admin?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          is_platform_admin?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programme_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          key: string
          name: string
          template_json: Json
          updated_at: string
          version: number
          wp_type_key: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          key: string
          name: string
          template_json?: Json
          updated_at?: string
          version?: number
          wp_type_key?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          key?: string
          name?: string
          template_json?: Json
          updated_at?: string
          version?: number
          wp_type_key?: string | null
        }
        Relationships: []
      }
      programmes: {
        Row: {
          account_id: string
          code: string | null
          created_at: string
          end_date: string | null
          framework_id: string | null
          id: string
          import_batch_id: string | null
          name: string
          start_date: string | null
          status: string
          target_site_count: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          code?: string | null
          created_at?: string
          end_date?: string | null
          framework_id?: string | null
          id?: string
          import_batch_id?: string | null
          name: string
          start_date?: string | null
          status?: string
          target_site_count?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          code?: string | null
          created_at?: string
          end_date?: string | null
          framework_id?: string | null
          id?: string
          import_batch_id?: string | null
          name?: string
          start_date?: string | null
          status?: string
          target_site_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programmes_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programmes_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          diff_json: Json
          entity_id: string | null
          entity_type: string
          id: string
          project_id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          diff_json?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          project_id: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          diff_json?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          project_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comments: {
        Row: {
          author_user_id: string
          body_md: string
          created_at: string
          id: string
          mentions_json: Json
          milestone_id: string | null
          project_id: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body_md: string
          created_at?: string
          id?: string
          mentions_json?: Json
          milestone_id?: string | null
          project_id: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body_md?: string
          created_at?: string
          id?: string
          mentions_json?: Json
          milestone_id?: string | null
          project_id?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          filename: string
          id: string
          mime: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string
          task_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          filename: string
          id?: string
          mime?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path: string
          task_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          filename?: string
          id?: string
          mime?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          actual_date: string | null
          created_at: string
          description: string | null
          gate_notes: string | null
          gate_status: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type: Database["public"]["Enums"]["milestone_gate_type"]
          id: string
          name: string
          owner_user_id: string | null
          passed_at: string | null
          passed_by: string | null
          percent_complete: number
          phase: Database["public"]["Enums"]["milestone_phase"]
          planned_date: string | null
          project_id: string
          sequence: number
          status: Database["public"]["Enums"]["milestone_status"]
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          created_at?: string
          description?: string | null
          gate_notes?: string | null
          gate_status?: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type?: Database["public"]["Enums"]["milestone_gate_type"]
          id?: string
          name: string
          owner_user_id?: string | null
          passed_at?: string | null
          passed_by?: string | null
          percent_complete?: number
          phase?: Database["public"]["Enums"]["milestone_phase"]
          planned_date?: string | null
          project_id: string
          sequence?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          created_at?: string
          description?: string | null
          gate_notes?: string | null
          gate_status?: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type?: Database["public"]["Enums"]["milestone_gate_type"]
          id?: string
          name?: string
          owner_user_id?: string | null
          passed_at?: string | null
          passed_by?: string | null
          percent_complete?: number
          phase?: Database["public"]["Enums"]["milestone_phase"]
          planned_date?: string | null
          project_id?: string
          sequence?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_dependencies: {
        Row: {
          created_at: string
          depends_on_task_id: string
          id: string
          lag_days: number
          task_id: string
          type: Database["public"]["Enums"]["task_dep_type"]
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          id?: string
          lag_days?: number
          task_id: string
          type?: Database["public"]["Enums"]["task_dep_type"]
        }
        Update: {
          created_at?: string
          depends_on_task_id?: string
          id?: string
          lag_days?: number
          task_id?: string
          type?: Database["public"]["Enums"]["task_dep_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          actual_hours: number | null
          boq_ref: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          metadata_json: Json
          milestone_id: string | null
          owner_user_id: string | null
          parent_task_id: string | null
          percent_complete: number
          priority: Database["public"]["Enums"]["project_priority"]
          project_id: string
          scope: string
          site_id: string | null
          sort_index: number
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          boq_ref?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata_json?: Json
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["project_priority"]
          project_id: string
          scope?: string
          site_id?: string | null
          sort_index?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          boq_ref?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata_json?: Json
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["project_priority"]
          project_id?: string
          scope?: string
          site_id?: string | null
          sort_index?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string | null
          actual_end_date: string | null
          code: string | null
          config_json: Json
          created_at: string
          created_by: string
          description: string | null
          health: Database["public"]["Enums"]["project_health"]
          id: string
          name: string
          org_id: string | null
          percent_complete: number
          priority: Database["public"]["Enums"]["project_priority"]
          proposal_id: string | null
          site_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          study_id: string | null
          target_end_date: string | null
          template_id: string | null
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          account_id?: string | null
          actual_end_date?: string | null
          code?: string | null
          config_json?: Json
          created_at?: string
          created_by: string
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          id?: string
          name: string
          org_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["project_priority"]
          proposal_id?: string | null
          site_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          study_id?: string | null
          target_end_date?: string | null
          template_id?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          account_id?: string | null
          actual_end_date?: string | null
          code?: string | null
          config_json?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          id?: string
          name?: string
          org_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["project_priority"]
          proposal_id?: string | null
          site_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          study_id?: string | null
          target_end_date?: string | null
          template_id?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "projects_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "projects_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          account_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          notes: string | null
          org_id: string | null
          rejected_at: string | null
          sent_at: string | null
          snapshot_json: Json
          status: Database["public"]["Enums"]["proposal_status"]
          study_id: string
          title: string | null
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          study_id: string
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          study_id?: string
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          notes: string | null
          order_value: number
          org_id: string | null
          po_number: string
          status: string
          updated_at: string
          work_package_id: string
          xero_purchase_order_id: string | null
          xero_status: string | null
          xero_synced_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          order_value?: number
          org_id?: string | null
          po_number: string
          status?: string
          updated_at?: string
          work_package_id: string
          xero_purchase_order_id?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          order_value?: number
          org_id?: string | null
          po_number?: string
          status?: string
          updated_at?: string
          work_package_id?: string
          xero_purchase_order_id?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "purchase_orders_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_sends: {
        Row: {
          cc_emails: string[] | null
          created_at: string
          error_message: string | null
          estimate_id: string
          id: string
          message: string | null
          pdf_signed_url: string | null
          pdf_storage_path: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          cc_emails?: string[] | null
          created_at?: string
          error_message?: string | null
          estimate_id: string
          id?: string
          message?: string | null
          pdf_signed_url?: string | null
          pdf_storage_path: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          cc_emails?: string[] | null
          created_at?: string
          error_message?: string | null
          estimate_id?: string
          id?: string
          message?: string | null
          pdf_signed_url?: string | null
          pdf_storage_path?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_sends_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata_json: Json
          org_id: string
          site_id: string | null
          status: Database["public"]["Enums"]["rams_status"]
          summary: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          version: string
          work_package_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata_json?: Json
          org_id: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["rams_status"]
          summary?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string
          work_package_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata_json?: Json
          org_id?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["rams_status"]
          summary?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_documents_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "rams_documents_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          notes: string | null
          rate_card_id: string
          source_workbook: string | null
          status: Database["public"]["Enums"]["rate_card_status"]
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          notes?: string | null
          rate_card_id: string
          source_workbook?: string | null
          status?: Database["public"]["Enums"]["rate_card_status"]
          updated_at?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          notes?: string | null
          rate_card_id?: string
          source_workbook?: string | null
          status?: Database["public"]["Enums"]["rate_card_status"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_versions_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_cards: {
        Row: {
          code: string | null
          contract_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          contract_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          contract_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_items: {
        Row: {
          category: string | null
          client_unit_price: number | null
          cost_code: string | null
          cost_code_category: string | null
          cost_split_available: boolean
          created_at: string
          default_crew_size: number | null
          default_stage: string | null
          description: string
          id: string
          labour_cost: number | null
          material_cost: number | null
          needs_pricing: boolean
          notes: string | null
          plant_cost: number | null
          productivity_qty_per_day: number | null
          provided_by: Database["public"]["Enums"]["rate_provided_by"]
          rate_card_version_id: string
          rate_code: string
          source_ser: string | null
          source_sheet: string | null
          subcontract_cost: number | null
          total_unit_cost: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_unit_price?: number | null
          cost_code?: string | null
          cost_code_category?: string | null
          cost_split_available?: boolean
          created_at?: string
          default_crew_size?: number | null
          default_stage?: string | null
          description: string
          id?: string
          labour_cost?: number | null
          material_cost?: number | null
          needs_pricing?: boolean
          notes?: string | null
          plant_cost?: number | null
          productivity_qty_per_day?: number | null
          provided_by?: Database["public"]["Enums"]["rate_provided_by"]
          rate_card_version_id: string
          rate_code: string
          source_ser?: string | null
          source_sheet?: string | null
          subcontract_cost?: number | null
          total_unit_cost?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_unit_price?: number | null
          cost_code?: string | null
          cost_code_category?: string | null
          cost_split_available?: boolean
          created_at?: string
          default_crew_size?: number | null
          default_stage?: string | null
          description?: string
          id?: string
          labour_cost?: number | null
          material_cost?: number | null
          needs_pricing?: boolean
          notes?: string | null
          plant_cost?: number | null
          productivity_qty_per_day?: number | null
          provided_by?: Database["public"]["Enums"]["rate_provided_by"]
          rate_card_version_id?: string
          rate_code?: string
          source_ser?: string | null
          source_sheet?: string | null
          subcontract_cost?: number | null
          total_unit_cost?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_items_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          cost_code: string | null
          cost_code_category: string | null
          create_project_task: boolean
          created_at: string
          default_quantity: number
          description_override: string | null
          id: string
          is_allowance: boolean
          markup_amount: number
          markup_pct: number | null
          notes: string | null
          quantity_rule_confirmed: boolean
          quantity_rule_json: Json
          rate_item_id: string | null
          recipe_id: string
          related_allowance_ref: string | null
          sort_index: number
          stage: string | null
          task_stage_tag: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          cost_code?: string | null
          cost_code_category?: string | null
          create_project_task?: boolean
          created_at?: string
          default_quantity?: number
          description_override?: string | null
          id?: string
          is_allowance?: boolean
          markup_amount?: number
          markup_pct?: number | null
          notes?: string | null
          quantity_rule_confirmed?: boolean
          quantity_rule_json?: Json
          rate_item_id?: string | null
          recipe_id: string
          related_allowance_ref?: string | null
          sort_index?: number
          stage?: string | null
          task_stage_tag?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          cost_code?: string | null
          cost_code_category?: string | null
          create_project_task?: boolean
          created_at?: string
          default_quantity?: number
          description_override?: string | null
          id?: string
          is_allowance?: boolean
          markup_amount?: number
          markup_pct?: number | null
          notes?: string | null
          quantity_rule_confirmed?: boolean
          quantity_rule_json?: Json
          rate_item_id?: string | null
          recipe_id?: string
          related_allowance_ref?: string | null
          sort_index?: number
          stage?: string | null
          task_stage_tag?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_rate_item_id_fkey"
            columns: ["rate_item_id"]
            isOneToOne: false
            referencedRelation: "rate_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "estimate_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_allocations: {
        Row: {
          actual_hours: number | null
          allocation_pct: number
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          planned_hours: number | null
          resource_id: string
          role: string | null
          site_id: string | null
          start_date: string
          status: string
          updated_at: string
          work_package_id: string | null
          wp_task_id: string | null
        }
        Insert: {
          actual_hours?: number | null
          allocation_pct?: number
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          planned_hours?: number | null
          resource_id: string
          role?: string | null
          site_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
          work_package_id?: string | null
          wp_task_id?: string | null
        }
        Update: {
          actual_hours?: number | null
          allocation_pct?: number
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          planned_hours?: number | null
          resource_id?: string
          role?: string | null
          site_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          work_package_id?: string | null
          wp_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "resource_allocations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "resource_allocations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_wp_task_id_fkey"
            columns: ["wp_task_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["poc_task_id"]
          },
          {
            foreignKeyName: "resource_allocations_wp_task_id_fkey"
            columns: ["wp_task_id"]
            isOneToOne: false
            referencedRelation: "wp_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_availability: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          hours_per_day: number | null
          id: string
          kind: string
          notes: string | null
          resource_id: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          hours_per_day?: number | null
          id?: string
          kind?: string
          notes?: string | null
          resource_id: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          hours_per_day?: number | null
          id?: string
          kind?: string
          notes?: string | null
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_availability_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_rates: {
        Row: {
          charge_rate: number
          cost_rate: number
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          resource_id: string
          uom: string
        }
        Insert: {
          charge_rate?: number
          cost_rate?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          resource_id: string
          uom?: string
        }
        Update: {
          charge_rate?: number
          cost_rate?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          resource_id?: string
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_rates_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_skills: {
        Row: {
          certification: string | null
          created_at: string
          expires_on: string | null
          id: string
          level: number
          resource_id: string
          skill: string
        }
        Insert: {
          certification?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          level?: number
          resource_id: string
          skill: string
        }
        Update: {
          certification?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          level?: number
          resource_id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_skills_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string | null
          partner_id: string | null
          phone: string | null
          resource_type: string
          role_title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id?: string | null
          partner_id?: string | null
          phone?: string | null
          resource_type?: string
          role_title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string | null
          partner_id?: string | null
          phone?: string | null
          resource_type?: string
          role_title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_forecast_budget: {
        Row: {
          budget_gp: number | null
          budget_revenue: number | null
          created_at: string
          id: string
          month: number
          org_id: string
          stream: string
          updated_at: string
          year: number
        }
        Insert: {
          budget_gp?: number | null
          budget_revenue?: number | null
          created_at?: string
          id?: string
          month: number
          org_id: string
          stream: string
          updated_at?: string
          year: number
        }
        Update: {
          budget_gp?: number | null
          budget_revenue?: number | null
          created_at?: string
          id?: string
          month?: number
          org_id?: string
          stream?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      revenue_invoice_counters: {
        Row: {
          last_seq: number
          org_id: string
        }
        Insert: {
          last_seq?: number
          org_id: string
        }
        Update: {
          last_seq?: number
          org_id?: string
        }
        Relationships: []
      }
      revenue_invoices: {
        Row: {
          certified_amount: number | null
          certified_by: string | null
          certified_date: string | null
          created_at: string
          created_by: string | null
          doc_type: string
          due_date: string | null
          gross_amount: number
          id: string
          invoice_number: string
          issue_date: string | null
          locked: boolean
          milestone_id: string | null
          net_amount: number
          notes: string | null
          org_id: string
          paid_amount: number | null
          paid_date: string | null
          period_from: string | null
          period_to: string | null
          po_number: string | null
          project_id: string
          rejection_reason: string | null
          status: string
          updated_at: string
          vat_amount: number
          vat_rate: number
          xero_amount_due: number | null
          xero_amount_paid: number | null
          xero_invoice_id: string | null
          xero_status: string | null
          xero_synced_at: string | null
        }
        Insert: {
          certified_amount?: number | null
          certified_by?: string | null
          certified_date?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string
          due_date?: string | null
          gross_amount?: number
          id?: string
          invoice_number: string
          issue_date?: string | null
          locked?: boolean
          milestone_id?: string | null
          net_amount?: number
          notes?: string | null
          org_id: string
          paid_amount?: number | null
          paid_date?: string | null
          period_from?: string | null
          period_to?: string | null
          po_number?: string | null
          project_id: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          xero_amount_due?: number | null
          xero_amount_paid?: number | null
          xero_invoice_id?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          certified_amount?: number | null
          certified_by?: string | null
          certified_date?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string
          due_date?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string
          issue_date?: string | null
          locked?: boolean
          milestone_id?: string | null
          net_amount?: number
          notes?: string | null
          org_id?: string
          paid_amount?: number | null
          paid_date?: string | null
          period_from?: string | null
          period_to?: string | null
          po_number?: string | null
          project_id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          xero_amount_due?: number | null
          xero_amount_paid?: number | null
          xero_invoice_id?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_invoices_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "revenue_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "revenue_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_milestones: {
        Row: {
          actual_civils: number | null
          actual_elec: number | null
          actual_revenue: number | null
          baseline_civils: number | null
          baseline_elec: number | null
          baseline_revenue: number | null
          created_at: string
          forecast_civils: number | null
          forecast_elec: number | null
          forecast_revenue: number | null
          id: string
          invoice_month: string | null
          invoice_pct: number | null
          invoice_ref: string | null
          milestone_status: string
          notes: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          actual_civils?: number | null
          actual_elec?: number | null
          actual_revenue?: number | null
          baseline_civils?: number | null
          baseline_elec?: number | null
          baseline_revenue?: number | null
          created_at?: string
          forecast_civils?: number | null
          forecast_elec?: number | null
          forecast_revenue?: number | null
          id?: string
          invoice_month?: string | null
          invoice_pct?: number | null
          invoice_ref?: string | null
          milestone_status: string
          notes?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          actual_civils?: number | null
          actual_elec?: number | null
          actual_revenue?: number | null
          baseline_civils?: number | null
          baseline_elec?: number | null
          baseline_revenue?: number | null
          created_at?: string
          forecast_civils?: number | null
          forecast_elec?: number | null
          forecast_revenue?: number | null
          id?: string
          invoice_month?: string | null
          invoice_pct?: number | null
          invoice_ref?: string | null
          milestone_status?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "revenue_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_projects: {
        Row: {
          app_date: string | null
          civils_contractor: string | null
          client_id: string | null
          completion_date: string | null
          contract_value: number | null
          created_at: string
          created_by: string | null
          elec_contractor: string | null
          energisation_date: string | null
          id: string
          notes: string | null
          org_id: string
          package_id: string | null
          po_number: string | null
          programme: string | null
          project_code: string | null
          site_id: string | null
          site_location: string | null
          start_date: string | null
          stream: string
          updated_at: string
          wp_id: string | null
        }
        Insert: {
          app_date?: string | null
          civils_contractor?: string | null
          client_id?: string | null
          completion_date?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          elec_contractor?: string | null
          energisation_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          package_id?: string | null
          po_number?: string | null
          programme?: string | null
          project_code?: string | null
          site_id?: string | null
          site_location?: string | null
          start_date?: string | null
          stream: string
          updated_at?: string
          wp_id?: string | null
        }
        Update: {
          app_date?: string | null
          civils_contractor?: string | null
          client_id?: string | null
          completion_date?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          elec_contractor?: string | null
          energisation_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          package_id?: string | null
          po_number?: string | null
          programme?: string | null
          project_code?: string | null
          site_id?: string | null
          site_location?: string | null
          start_date?: string | null
          stream?: string
          updated_at?: string
          wp_id?: string | null
        }
        Relationships: []
      }
      role_requests: {
        Row: {
          created_at: string
          id: string
          requested_role: Database["public"]["Enums"]["app_role"]
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_role: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_role?: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      route_amendments: {
        Row: {
          ai_cost_estimate: Json | null
          ai_distance_m: number | null
          ai_poc_lat: number | null
          ai_poc_lng: number | null
          ai_route_geojson: Json | null
          ai_surface_split: Json | null
          amendment_notes: string | null
          approved_for_training: boolean
          cost_delta_pct: number | null
          created_at: string
          created_by: string
          distance_delta_m: number | null
          dno_region: string | null
          eng_cost_estimate: Json | null
          eng_distance_m: number | null
          eng_poc_lat: number | null
          eng_poc_lng: number | null
          eng_route_geojson: Json | null
          eng_surface_split: Json | null
          id: string
          poc_shift_m: number | null
          proposed_kw: number | null
          site_id: string | null
          study_id: string | null
          voltage_level: string | null
        }
        Insert: {
          ai_cost_estimate?: Json | null
          ai_distance_m?: number | null
          ai_poc_lat?: number | null
          ai_poc_lng?: number | null
          ai_route_geojson?: Json | null
          ai_surface_split?: Json | null
          amendment_notes?: string | null
          approved_for_training?: boolean
          cost_delta_pct?: number | null
          created_at?: string
          created_by: string
          distance_delta_m?: number | null
          dno_region?: string | null
          eng_cost_estimate?: Json | null
          eng_distance_m?: number | null
          eng_poc_lat?: number | null
          eng_poc_lng?: number | null
          eng_route_geojson?: Json | null
          eng_surface_split?: Json | null
          id?: string
          poc_shift_m?: number | null
          proposed_kw?: number | null
          site_id?: string | null
          study_id?: string | null
          voltage_level?: string | null
        }
        Update: {
          ai_cost_estimate?: Json | null
          ai_distance_m?: number | null
          ai_poc_lat?: number | null
          ai_poc_lng?: number | null
          ai_route_geojson?: Json | null
          ai_surface_split?: Json | null
          amendment_notes?: string | null
          approved_for_training?: boolean
          cost_delta_pct?: number | null
          created_at?: string
          created_by?: string
          distance_delta_m?: number | null
          dno_region?: string | null
          eng_cost_estimate?: Json | null
          eng_distance_m?: number | null
          eng_poc_lat?: number | null
          eng_poc_lng?: number | null
          eng_route_geojson?: Json | null
          eng_surface_split?: Json | null
          id?: string
          poc_shift_m?: number | null
          proposed_kw?: number | null
          site_id?: string | null
          study_id?: string | null
          voltage_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_amendments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_amendments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "route_amendments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      ruleset_change_log: {
        Row: {
          change_summary: string
          change_type: string
          changed_at: string
          changed_by: string
          diff_json: Json | null
          id: string
          new_version: string
          previous_version: string | null
          ruleset_id: string
        }
        Insert: {
          change_summary: string
          change_type: string
          changed_at?: string
          changed_by: string
          diff_json?: Json | null
          id?: string
          new_version: string
          previous_version?: string | null
          ruleset_id: string
        }
        Update: {
          change_summary?: string
          change_type?: string
          changed_at?: string
          changed_by?: string
          diff_json?: Json | null
          id?: string
          new_version?: string
          previous_version?: string | null
          ruleset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruleset_change_log_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "ev_hub_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      site_design_submissions: {
        Row: {
          created_at: string
          design_submission_id: string
          is_current: boolean
          site_id: string
        }
        Insert: {
          created_at?: string
          design_submission_id: string
          is_current?: boolean
          site_id: string
        }
        Update: {
          created_at?: string
          design_submission_id?: string
          is_current?: boolean
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_design_submissions_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "design_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_design_submissions_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["ev_design_id"]
          },
          {
            foreignKeyName: "site_design_submissions_design_submission_id_fkey"
            columns: ["design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["icp_design_id"]
          },
          {
            foreignKeyName: "site_design_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_design_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_estimate_exceptions: {
        Row: {
          created_at: string
          details_json: Json
          id: string
          kind: Database["public"]["Enums"]["site_estimate_exception_kind"]
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["site_estimate_exception_severity"]
          site_estimate_id: string
          site_estimate_line_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details_json?: Json
          id?: string
          kind: Database["public"]["Enums"]["site_estimate_exception_kind"]
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["site_estimate_exception_severity"]
          site_estimate_id: string
          site_estimate_line_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details_json?: Json
          id?: string
          kind?: Database["public"]["Enums"]["site_estimate_exception_kind"]
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["site_estimate_exception_severity"]
          site_estimate_id?: string
          site_estimate_line_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_estimate_exceptions_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "site_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimate_exceptions_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_site_estimate_id"]
          },
          {
            foreignKeyName: "site_estimate_exceptions_site_estimate_line_id_fkey"
            columns: ["site_estimate_line_id"]
            isOneToOne: false
            referencedRelation: "site_estimate_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      site_estimate_lines: {
        Row: {
          cost_code: string | null
          cost_code_category: string | null
          created_at: string
          description: string
          id: string
          is_allowance: boolean
          is_locked: boolean
          is_manual_addition: boolean
          line_cost: number
          line_price: number
          markup_amount: number
          markup_pct: number | null
          quantity: number
          rate_code: string | null
          rate_item_id: string | null
          recipe_item_id: string | null
          site_estimate_id: string
          sort_index: number
          source: string
          stage: string | null
          unit: string | null
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          cost_code?: string | null
          cost_code_category?: string | null
          created_at?: string
          description: string
          id?: string
          is_allowance?: boolean
          is_locked?: boolean
          is_manual_addition?: boolean
          line_cost?: number
          line_price?: number
          markup_amount?: number
          markup_pct?: number | null
          quantity?: number
          rate_code?: string | null
          rate_item_id?: string | null
          recipe_item_id?: string | null
          site_estimate_id: string
          sort_index?: number
          source?: string
          stage?: string | null
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          cost_code?: string | null
          cost_code_category?: string | null
          created_at?: string
          description?: string
          id?: string
          is_allowance?: boolean
          is_locked?: boolean
          is_manual_addition?: boolean
          line_cost?: number
          line_price?: number
          markup_amount?: number
          markup_pct?: number | null
          quantity?: number
          rate_code?: string | null
          rate_item_id?: string | null
          recipe_item_id?: string | null
          site_estimate_id?: string
          sort_index?: number
          source?: string
          stage?: string | null
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_estimate_lines_rate_item_id_fkey"
            columns: ["rate_item_id"]
            isOneToOne: false
            referencedRelation: "rate_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimate_lines_recipe_item_id_fkey"
            columns: ["recipe_item_id"]
            isOneToOne: false
            referencedRelation: "recipe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimate_lines_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "site_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimate_lines_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_site_estimate_id"]
          },
        ]
      }
      site_estimates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_decision: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          recipe_id: string | null
          site_id: string
          status: Database["public"]["Enums"]["site_estimate_status"]
          study_id: string | null
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_decision?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          name: string
          notes?: string | null
          rate_card_version_id?: string | null
          recipe_id?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["site_estimate_status"]
          study_id?: string | null
          superseded_by_estimate_id?: string | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_decision?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          name?: string
          notes?: string | null
          rate_card_version_id?: string | null
          recipe_id?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["site_estimate_status"]
          study_id?: string | null
          superseded_by_estimate_id?: string | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_estimates_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "estimate_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_estimates_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_superseded_by_estimate_id_fkey"
            columns: ["superseded_by_estimate_id"]
            isOneToOne: false
            referencedRelation: "site_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_estimates_superseded_by_estimate_id_fkey"
            columns: ["superseded_by_estimate_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_site_estimate_id"]
          },
        ]
      }
      site_handover_docs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          doc_type: string
          filename: string
          id: string
          mime: string | null
          notes: string | null
          site_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          work_package_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          doc_type: string
          filename: string
          id?: string
          mime?: string | null
          notes?: string | null
          site_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          work_package_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          doc_type?: string
          filename?: string
          id?: string
          mime?: string | null
          notes?: string | null
          site_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_handover_docs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_handover_docs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_handover_docs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "site_handover_docs_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_notes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          site_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note: string
          site_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_notes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_notes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_photos: {
        Row: {
          bearing: number | null
          caption: string | null
          created_at: string
          created_by: string | null
          daily_log_id: string | null
          exif_json: Json
          id: string
          latitude: number | null
          longitude: number | null
          org_id: string
          photo_url: string | null
          project_file_id: string | null
          site_id: string | null
          site_survey_response_id: string | null
          source: string | null
          tags: string[] | null
          taken_at: string | null
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          bearing?: number | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          daily_log_id?: string | null
          exif_json?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id: string
          photo_url?: string | null
          project_file_id?: string | null
          site_id?: string | null
          site_survey_response_id?: string | null
          source?: string | null
          tags?: string[] | null
          taken_at?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          bearing?: number | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          daily_log_id?: string | null
          exif_json?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string
          photo_url?: string | null
          project_file_id?: string | null
          site_id?: string | null
          site_survey_response_id?: string | null
          source?: string | null
          tags?: string[] | null
          taken_at?: string | null
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_photos_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_project_file_id_fkey"
            columns: ["project_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "site_photos_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_precon_gates: {
        Row: {
          archived_at: string | null
          created_at: string
          evidence_ref: string | null
          gate_key: string
          id: string
          notes: string | null
          passed_at: string | null
          passed_by: string | null
          site_id: string
          state: string
          updated_at: string
          work_package_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          evidence_ref?: string | null
          gate_key: string
          id?: string
          notes?: string | null
          passed_at?: string | null
          passed_by?: string | null
          site_id: string
          state?: string
          updated_at?: string
          work_package_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          evidence_ref?: string | null
          gate_key?: string
          id?: string
          notes?: string | null
          passed_at?: string | null
          passed_by?: string | null
          site_id?: string
          state?: string
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_precon_gates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_precon_gates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_precon_gates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "site_precon_gates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_socket_groups: {
        Row: {
          created_at: string
          id: string
          phases: number
          power_rating_kw: number
          quantity: number
          site_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          phases: number
          power_rating_kw: number
          quantity: number
          site_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          phases?: number
          power_rating_kw?: number
          quantity?: number
          site_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_socket_groups_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_socket_groups_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          id: string
          metadata_json: Json
          reason: string | null
          site_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          metadata_json?: Json
          reason?: string | null
          site_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          metadata_json?: Json
          reason?: string | null
          site_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_stage_status: {
        Row: {
          actual_finish_date: string | null
          actual_start_date: string | null
          blocked_reason: string | null
          created_at: string
          id: string
          owner_id: string | null
          planned_finish_date: string | null
          planned_start_date: string | null
          review_notes: string | null
          site_id: string
          stage: Database["public"]["Enums"]["site_stage_key"]
          updated_at: string
          updated_by: string | null
          work_package_id: string
          workflow_status: Database["public"]["Enums"]["site_stage_state"]
        }
        Insert: {
          actual_finish_date?: string | null
          actual_start_date?: string | null
          blocked_reason?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          planned_finish_date?: string | null
          planned_start_date?: string | null
          review_notes?: string | null
          site_id: string
          stage: Database["public"]["Enums"]["site_stage_key"]
          updated_at?: string
          updated_by?: string | null
          work_package_id: string
          workflow_status?: Database["public"]["Enums"]["site_stage_state"]
        }
        Update: {
          actual_finish_date?: string | null
          actual_start_date?: string | null
          blocked_reason?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          planned_finish_date?: string | null
          planned_start_date?: string | null
          review_notes?: string | null
          site_id?: string
          stage?: Database["public"]["Enums"]["site_stage_key"]
          updated_at?: string
          updated_by?: string | null
          work_package_id?: string
          workflow_status?: Database["public"]["Enums"]["site_stage_state"]
        }
        Relationships: [
          {
            foreignKeyName: "site_stage_status_site_id_fkey1"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_status_site_id_fkey1"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_stage_status_work_package_id_fkey1"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "site_stage_status_work_package_id_fkey1"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_stage_status_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["site_stage_state"]
          previous_status:
            | Database["public"]["Enums"]["site_stage_state"]
            | null
          reason: string | null
          site_id: string
          stage: Database["public"]["Enums"]["site_stage_key"]
          work_package_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["site_stage_state"]
          previous_status?:
            | Database["public"]["Enums"]["site_stage_state"]
            | null
          reason?: string | null
          site_id: string
          stage: Database["public"]["Enums"]["site_stage_key"]
          work_package_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["site_stage_state"]
          previous_status?:
            | Database["public"]["Enums"]["site_stage_state"]
            | null
          reason?: string | null
          site_id?: string
          stage?: Database["public"]["Enums"]["site_stage_key"]
          work_package_id?: string
        }
        Relationships: []
      }
      site_stage_status_legacy: {
        Row: {
          civils: Database["public"]["Enums"]["site_stage_state"]
          design: Database["public"]["Enums"]["site_stage_state"]
          dno: Database["public"]["Enums"]["site_stage_state"]
          electrical: Database["public"]["Enums"]["site_stage_state"]
          handover: Database["public"]["Enums"]["site_stage_state"]
          id: string
          meter: Database["public"]["Enums"]["site_stage_state"]
          permit: Database["public"]["Enums"]["site_stage_state"]
          site_id: string
          survey: Database["public"]["Enums"]["site_stage_state"]
          updated_at: string
          work_package_id: string
        }
        Insert: {
          civils?: Database["public"]["Enums"]["site_stage_state"]
          design?: Database["public"]["Enums"]["site_stage_state"]
          dno?: Database["public"]["Enums"]["site_stage_state"]
          electrical?: Database["public"]["Enums"]["site_stage_state"]
          handover?: Database["public"]["Enums"]["site_stage_state"]
          id?: string
          meter?: Database["public"]["Enums"]["site_stage_state"]
          permit?: Database["public"]["Enums"]["site_stage_state"]
          site_id: string
          survey?: Database["public"]["Enums"]["site_stage_state"]
          updated_at?: string
          work_package_id: string
        }
        Update: {
          civils?: Database["public"]["Enums"]["site_stage_state"]
          design?: Database["public"]["Enums"]["site_stage_state"]
          dno?: Database["public"]["Enums"]["site_stage_state"]
          electrical?: Database["public"]["Enums"]["site_stage_state"]
          handover?: Database["public"]["Enums"]["site_stage_state"]
          id?: string
          meter?: Database["public"]["Enums"]["site_stage_state"]
          permit?: Database["public"]["Enums"]["site_stage_state"]
          site_id?: string
          survey?: Database["public"]["Enums"]["site_stage_state"]
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_stage_status_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_status_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_stage_status_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "site_stage_status_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_survey_responses: {
        Row: {
          created_at: string
          id: string
          image_urls: Json
          org_id: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          signature_url: string | null
          site_id: string
          submission: Json
          submitted_at: string
          submitter_email: string | null
          submitter_name: string | null
          survey_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_urls?: Json
          org_id?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          signature_url?: string | null
          site_id: string
          submission?: Json
          submitted_at?: string
          submitter_email?: string | null
          submitter_name?: string | null
          survey_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_urls?: Json
          org_id?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          signature_url?: string | null
          site_id?: string
          submission?: Json
          submitted_at?: string
          submitter_email?: string | null
          submitter_name?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_survey_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_survey_responses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_survey_responses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "site_surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_survey_id"]
          },
        ]
      }
      site_surveys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          message: string | null
          org_id: string | null
          response_id: string | null
          sent_by: string
          sent_to_email: string
          sent_to_name: string | null
          site_id: string
          status: string
          submitted_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          org_id?: string | null
          response_id?: string | null
          sent_by: string
          sent_to_email: string
          sent_to_name?: string | null
          site_id: string
          status?: string
          submitted_at?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          org_id?: string | null
          response_id?: string | null
          sent_by?: string
          sent_to_email?: string
          sent_to_name?: string | null
          site_id?: string
          status?: string
          submitted_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_surveys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_surveys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_utilisation: {
        Row: {
          ams_site_asset_id: string | null
          attrs_json: Json | null
          connected_customers: number | null
          firm_capacity_kw: number | null
          geo_point: string | null
          geom: unknown
          headroom_band: string | null
          id: string
          licence_area: string | null
          loadings_data_source: string | null
          local_authority: string | null
          local_authority_code: string | null
          lsoa_code: string | null
          lsoa_name: string | null
          max_demand_kw: number | null
          msoa_code: string | null
          msoa_name: string | null
          site_band: string | null
          site_easting: number | null
          site_id: string
          site_name: string
          site_northing: number | null
          substation_class: string | null
          substation_type: string | null
          three_phase: string | null
          transformer_headroom_kw: number | null
          transformer_id: string | null
          upstream_site: string | null
          utilisation_band: string | null
          utilisation_pct: number | null
          ward_code: string | null
          ward_name: string | null
        }
        Insert: {
          ams_site_asset_id?: string | null
          attrs_json?: Json | null
          connected_customers?: number | null
          firm_capacity_kw?: number | null
          geo_point?: string | null
          geom?: unknown
          headroom_band?: string | null
          id?: string
          licence_area?: string | null
          loadings_data_source?: string | null
          local_authority?: string | null
          local_authority_code?: string | null
          lsoa_code?: string | null
          lsoa_name?: string | null
          max_demand_kw?: number | null
          msoa_code?: string | null
          msoa_name?: string | null
          site_band?: string | null
          site_easting?: number | null
          site_id: string
          site_name: string
          site_northing?: number | null
          substation_class?: string | null
          substation_type?: string | null
          three_phase?: string | null
          transformer_headroom_kw?: number | null
          transformer_id?: string | null
          upstream_site?: string | null
          utilisation_band?: string | null
          utilisation_pct?: number | null
          ward_code?: string | null
          ward_name?: string | null
        }
        Update: {
          ams_site_asset_id?: string | null
          attrs_json?: Json | null
          connected_customers?: number | null
          firm_capacity_kw?: number | null
          geo_point?: string | null
          geom?: unknown
          headroom_band?: string | null
          id?: string
          licence_area?: string | null
          loadings_data_source?: string | null
          local_authority?: string | null
          local_authority_code?: string | null
          lsoa_code?: string | null
          lsoa_name?: string | null
          max_demand_kw?: number | null
          msoa_code?: string | null
          msoa_name?: string | null
          site_band?: string | null
          site_easting?: number | null
          site_id?: string
          site_name?: string
          site_northing?: number | null
          substation_class?: string | null
          substation_type?: string | null
          three_phase?: string | null
          transformer_headroom_kw?: number | null
          transformer_id?: string | null
          upstream_site?: string | null
          utilisation_band?: string | null
          utilisation_pct?: number | null
          ward_code?: string | null
          ward_name?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          blocker_reason: string | null
          build_type: string | null
          client_org: string | null
          client_site_code: string | null
          connection_options: Json | null
          cost_band: string | null
          created_at: string
          created_by: string
          current_stage_id: string | null
          deployment_class: string | null
          geom: unknown
          grid_readiness: string | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          next_action_due: string | null
          next_action_label: string | null
          next_steps: Json | null
          org_id: string | null
          postcode: string | null
          primary_partner_id: string | null
          proposed_kw: number | null
          raw_score_data: Json | null
          reinforcement_probability: number | null
          score: string | null
          score_reasons: Json | null
          site_name: string
          site_type: string | null
          socket_count: number | null
          status: string
          surveyor_email: string | null
          updated_at: string
          viability_index: number | null
        }
        Insert: {
          blocker_reason?: string | null
          build_type?: string | null
          client_org?: string | null
          client_site_code?: string | null
          connection_options?: Json | null
          cost_band?: string | null
          created_at?: string
          created_by: string
          current_stage_id?: string | null
          deployment_class?: string | null
          geom?: unknown
          grid_readiness?: string | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          next_action_due?: string | null
          next_action_label?: string | null
          next_steps?: Json | null
          org_id?: string | null
          postcode?: string | null
          primary_partner_id?: string | null
          proposed_kw?: number | null
          raw_score_data?: Json | null
          reinforcement_probability?: number | null
          score?: string | null
          score_reasons?: Json | null
          site_name: string
          site_type?: string | null
          socket_count?: number | null
          status?: string
          surveyor_email?: string | null
          updated_at?: string
          viability_index?: number | null
        }
        Update: {
          blocker_reason?: string | null
          build_type?: string | null
          client_org?: string | null
          client_site_code?: string | null
          connection_options?: Json | null
          cost_band?: string | null
          created_at?: string
          created_by?: string
          current_stage_id?: string | null
          deployment_class?: string | null
          geom?: unknown
          grid_readiness?: string | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          next_action_due?: string | null
          next_action_label?: string | null
          next_steps?: Json | null
          org_id?: string | null
          postcode?: string | null
          primary_partner_id?: string | null
          proposed_kw?: number | null
          raw_score_data?: Json | null
          reinforcement_probability?: number | null
          score?: string | null
          score_reasons?: Json | null
          site_name?: string
          site_type?: string | null
          socket_count?: number | null
          status?: string
          surveyor_email?: string | null
          updated_at?: string
          viability_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_primary_partner_id_fkey"
            columns: ["primary_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      snagging_items: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string | null
          id: string
          metadata_json: Json
          org_id: string
          owner_partner_id: string | null
          owner_user_id: string | null
          partner_ack_notes: string | null
          partner_acknowledged_at: string | null
          partner_acknowledged_by: string | null
          photo_file_id: string | null
          raised_at: string
          raised_by: string | null
          resolution_notes: string | null
          severity: Database["public"]["Enums"]["snag_severity"]
          site_id: string | null
          status: Database["public"]["Enums"]["snag_status"]
          target_close_date: string | null
          title: string
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata_json?: Json
          org_id: string
          owner_partner_id?: string | null
          owner_user_id?: string | null
          partner_ack_notes?: string | null
          partner_acknowledged_at?: string | null
          partner_acknowledged_by?: string | null
          photo_file_id?: string | null
          raised_at?: string
          raised_by?: string | null
          resolution_notes?: string | null
          severity?: Database["public"]["Enums"]["snag_severity"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["snag_status"]
          target_close_date?: string | null
          title: string
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata_json?: Json
          org_id?: string
          owner_partner_id?: string | null
          owner_user_id?: string | null
          partner_ack_notes?: string | null
          partner_acknowledged_at?: string | null
          partner_acknowledged_by?: string | null
          photo_file_id?: string | null
          raised_at?: string
          raised_by?: string | null
          resolution_notes?: string | null
          severity?: Database["public"]["Enums"]["snag_severity"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["snag_status"]
          target_close_date?: string | null
          title?: string
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "snagging_items_photo_file_id_fkey"
            columns: ["photo_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snagging_items_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "snagging_items_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      ssen_ltds_demand: {
        Row: {
          created_at: string
          firm_capacity_mva: number | null
          forecast_json: Json | null
          gsp_group: string | null
          id: string
          power_factor: number | null
          raw_json: Json | null
          recorded_demand_mva: number | null
          region: string
          site_name: string
          site_name_normalised: string
          source_date: string | null
          updated_at: string
          voltage_kv: number | null
        }
        Insert: {
          created_at?: string
          firm_capacity_mva?: number | null
          forecast_json?: Json | null
          gsp_group?: string | null
          id?: string
          power_factor?: number | null
          raw_json?: Json | null
          recorded_demand_mva?: number | null
          region: string
          site_name: string
          site_name_normalised: string
          source_date?: string | null
          updated_at?: string
          voltage_kv?: number | null
        }
        Update: {
          created_at?: string
          firm_capacity_mva?: number | null
          forecast_json?: Json | null
          gsp_group?: string | null
          id?: string
          power_factor?: number | null
          raw_json?: Json | null
          recorded_demand_mva?: number | null
          region?: string
          site_name?: string
          site_name_normalised?: string
          source_date?: string | null
          updated_at?: string
          voltage_kv?: number | null
        }
        Relationships: []
      }
      ssen_ltds_fault: {
        Row: {
          cb_break_ka: number | null
          cb_make_ka: number | null
          created_at: string
          fault_eq_mva: number | null
          gsp_group: string | null
          id: string
          raw_json: Json | null
          region: string
          site_name: string
          site_name_normalised: string
          source_date: string | null
          three_phase_break_ka: number | null
          three_phase_peak_make_ka: number | null
          updated_at: string
          voltage_kv: number | null
        }
        Insert: {
          cb_break_ka?: number | null
          cb_make_ka?: number | null
          created_at?: string
          fault_eq_mva?: number | null
          gsp_group?: string | null
          id?: string
          raw_json?: Json | null
          region: string
          site_name: string
          site_name_normalised: string
          source_date?: string | null
          three_phase_break_ka?: number | null
          three_phase_peak_make_ka?: number | null
          updated_at?: string
          voltage_kv?: number | null
        }
        Update: {
          cb_break_ka?: number | null
          cb_make_ka?: number | null
          created_at?: string
          fault_eq_mva?: number | null
          gsp_group?: string | null
          id?: string
          raw_json?: Json | null
          region?: string
          site_name?: string
          site_name_normalised?: string
          source_date?: string | null
          three_phase_break_ka?: number | null
          three_phase_peak_make_ka?: number | null
          updated_at?: string
          voltage_kv?: number | null
        }
        Relationships: []
      }
      stage_definitions: {
        Row: {
          category: string
          colour: string | null
          created_at: string
          id: string
          is_terminal: boolean
          key: string
          label: string
          order_index: number
          org_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          colour?: string | null
          created_at?: string
          id?: string
          is_terminal?: boolean
          key: string
          label: string
          order_index?: number
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          colour?: string | null
          created_at?: string
          id?: string
          is_terminal?: boolean
          key?: string
          label?: string
          order_index?: number
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transition_rules: {
        Row: {
          created_at: string
          from_stage_id: string | null
          id: string
          required_gate: string | null
          required_role: string | null
          to_stage_id: string
          workflow_set_id: string | null
        }
        Insert: {
          created_at?: string
          from_stage_id?: string | null
          id?: string
          required_gate?: string | null
          required_role?: string | null
          to_stage_id: string
          workflow_set_id?: string | null
        }
        Update: {
          created_at?: string
          from_stage_id?: string | null
          id?: string
          required_gate?: string | null
          required_role?: string | null
          to_stage_id?: string
          workflow_set_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_transition_rules_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_rules_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_rules_workflow_set_id_fkey"
            columns: ["workflow_set_id"]
            isOneToOne: false
            referencedRelation: "workflow_stage_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          bom_json: Json | null
          boundary_geojson: Json | null
          cost_estimate_json: Json | null
          created_at: string
          created_by: string
          dno: string | null
          engine_input_json: Json | null
          engine_output_json: Json | null
          id: string
          mode: string
          org_id: string | null
          proposed_kw: number | null
          route_geojson: Json | null
          ruleset_version: string | null
          site_id: string | null
          status: string
          study_name: string
          updated_at: string
          voltage_level: string | null
          workflow_status: string
          wp_id: string | null
        }
        Insert: {
          bom_json?: Json | null
          boundary_geojson?: Json | null
          cost_estimate_json?: Json | null
          created_at?: string
          created_by: string
          dno?: string | null
          engine_input_json?: Json | null
          engine_output_json?: Json | null
          id?: string
          mode?: string
          org_id?: string | null
          proposed_kw?: number | null
          route_geojson?: Json | null
          ruleset_version?: string | null
          site_id?: string | null
          status?: string
          study_name: string
          updated_at?: string
          voltage_level?: string | null
          workflow_status?: string
          wp_id?: string | null
        }
        Update: {
          bom_json?: Json | null
          boundary_geojson?: Json | null
          cost_estimate_json?: Json | null
          created_at?: string
          created_by?: string
          dno?: string | null
          engine_input_json?: Json | null
          engine_output_json?: Json | null
          id?: string
          mode?: string
          org_id?: string | null
          proposed_kw?: number | null
          route_geojson?: Json | null
          ruleset_version?: string | null
          site_id?: string | null
          status?: string
          study_name?: string
          updated_at?: string
          voltage_level?: string | null
          workflow_status?: string
          wp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "studies_wp_id_fkey"
            columns: ["wp_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "studies_wp_id_fkey"
            columns: ["wp_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      study_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          study_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          study_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          study_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "study_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_comments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_shares: {
        Row: {
          created_at: string
          id: string
          role: string
          shared_by: string
          shared_with: string
          study_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          shared_by: string
          shared_with: string
          study_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          shared_by?: string
          shared_with?: string
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_shares_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_snapshots: {
        Row: {
          cable_configuration: Json
          cost_summary: Json
          created_at: string
          created_by: string
          electrical_inputs: Json
          engine_version: string
          id: string
          notes: string | null
          optimiser_output: Json | null
          pricebook_version: string
          ruleset_version: string
          snapshot_label: string | null
          study_id: string
          validation_results: Json
        }
        Insert: {
          cable_configuration?: Json
          cost_summary?: Json
          created_at?: string
          created_by: string
          electrical_inputs?: Json
          engine_version?: string
          id?: string
          notes?: string | null
          optimiser_output?: Json | null
          pricebook_version?: string
          ruleset_version?: string
          snapshot_label?: string | null
          study_id: string
          validation_results?: Json
        }
        Update: {
          cable_configuration?: Json
          cost_summary?: Json
          created_at?: string
          created_by?: string
          electrical_inputs?: Json
          engine_version?: string
          id?: string
          notes?: string | null
          optimiser_output?: Json | null
          pricebook_version?: string
          ruleset_version?: string
          snapshot_label?: string | null
          study_id?: string
          validation_results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "study_snapshots_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      test_certificates: {
        Row: {
          cert_number: string | null
          cert_type: string
          commissioning_record_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          file_id: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          issued_by_user_id: string | null
          metadata_json: Json
          notes: string | null
          org_id: string
          site_id: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          cert_number?: string | null
          cert_type: string
          commissioning_record_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          file_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          issued_by_user_id?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          cert_number?: string | null
          cert_type?: string
          commissioning_record_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          file_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          issued_by_user_id?: string | null
          metadata_json?: Json
          notes?: string | null
          org_id?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_certificates_commissioning_record_id_fkey"
            columns: ["commissioning_record_id"]
            isOneToOne: false
            referencedRelation: "commissioning_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_certificates_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_certificates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "test_certificates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_management_plans: {
        Row: {
          approval_state: Database["public"]["Enums"]["tm_approval_state"]
          authority: string | null
          contractor: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata_json: Json
          notes: string | null
          org_id: string
          reference: string | null
          site_id: string | null
          tm_type: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          work_package_id: string | null
        }
        Insert: {
          approval_state?: Database["public"]["Enums"]["tm_approval_state"]
          authority?: string | null
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata_json?: Json
          notes?: string | null
          org_id: string
          reference?: string | null
          site_id?: string | null
          tm_type: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          work_package_id?: string | null
        }
        Update: {
          approval_state?: Database["public"]["Enums"]["tm_approval_state"]
          authority?: string | null
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata_json?: Json
          notes?: string | null
          org_id?: string
          reference?: string | null
          site_id?: string | null
          tm_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_management_plans_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "traffic_management_plans_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      ukpn_circuit_monthly: {
        Row: {
          circuit_id: string
          created_at: string
          licence_area: string | null
          month: number
          peak_amps: number | null
          peak_mva: number | null
          peak_mvar: number | null
          peak_mw: number | null
          rating_mva: number | null
          raw_json: Json | null
          updated_at: string
          utilisation_pct: number | null
          voltage_kv: number
          year: number
        }
        Insert: {
          circuit_id: string
          created_at?: string
          licence_area?: string | null
          month: number
          peak_amps?: number | null
          peak_mva?: number | null
          peak_mvar?: number | null
          peak_mw?: number | null
          rating_mva?: number | null
          raw_json?: Json | null
          updated_at?: string
          utilisation_pct?: number | null
          voltage_kv: number
          year: number
        }
        Update: {
          circuit_id?: string
          created_at?: string
          licence_area?: string | null
          month?: number
          peak_amps?: number | null
          peak_mva?: number | null
          peak_mvar?: number | null
          peak_mw?: number | null
          rating_mva?: number | null
          raw_json?: Json | null
          updated_at?: string
          utilisation_pct?: number | null
          voltage_kv?: number
          year?: number
        }
        Relationships: []
      }
      ukpn_ltds_fault_3ph: {
        Row: {
          created_at: string
          fault_level_ka: number | null
          id: string
          raw_json: Json | null
          site_name: string | null
          sitefunctionallocation: string
          voltage_kv: number | null
          x_r_ratio: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          fault_level_ka?: number | null
          id?: string
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation: string
          voltage_kv?: number | null
          x_r_ratio?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          fault_level_ka?: number | null
          id?: string
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation?: string
          voltage_kv?: number | null
          x_r_ratio?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ukpn_ltds_fault_earth: {
        Row: {
          created_at: string
          fault_level_ka: number | null
          id: string
          raw_json: Json | null
          site_name: string | null
          sitefunctionallocation: string
          voltage_kv: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          fault_level_ka?: number | null
          id?: string
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation: string
          voltage_kv?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          fault_level_ka?: number | null
          id?: string
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation?: string
          voltage_kv?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ukpn_ltds_peak_demand_observed: {
        Row: {
          created_at: string
          id: string
          peak_mvar: number | null
          peak_mw: number | null
          raw_json: Json | null
          season: string | null
          site_name: string | null
          sitefunctionallocation: string
          voltage_kv: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          peak_mvar?: number | null
          peak_mw?: number | null
          raw_json?: Json | null
          season?: string | null
          site_name?: string | null
          sitefunctionallocation: string
          voltage_kv?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          peak_mvar?: number | null
          peak_mw?: number | null
          raw_json?: Json | null
          season?: string | null
          site_name?: string | null
          sitefunctionallocation?: string
          voltage_kv?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ukpn_ltds_peak_demand_true: {
        Row: {
          created_at: string
          id: string
          peak_mvar: number | null
          peak_mw: number | null
          raw_json: Json | null
          season: string | null
          site_name: string | null
          sitefunctionallocation: string
          voltage_kv: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          peak_mvar?: number | null
          peak_mw?: number | null
          raw_json?: Json | null
          season?: string | null
          site_name?: string | null
          sitefunctionallocation: string
          voltage_kv?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          peak_mvar?: number | null
          peak_mw?: number | null
          raw_json?: Json | null
          season?: string | null
          site_name?: string | null
          sitefunctionallocation?: string
          voltage_kv?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ukpn_ltds_transformers_2w: {
        Row: {
          created_at: string
          cyclic_rating_mva: number | null
          firm_capacity_mva: number | null
          id: string
          nameplate_mva: number | null
          raw_json: Json | null
          site_name: string | null
          sitefunctionallocation: string
          voltage_kv: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          cyclic_rating_mva?: number | null
          firm_capacity_mva?: number | null
          id?: string
          nameplate_mva?: number | null
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation: string
          voltage_kv?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          cyclic_rating_mva?: number | null
          firm_capacity_mva?: number | null
          id?: string
          nameplate_mva?: number | null
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation?: string
          voltage_kv?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ukpn_ltds_transformers_3w: {
        Row: {
          created_at: string
          cyclic_rating_mva: number | null
          firm_capacity_mva: number | null
          id: string
          nameplate_mva: number | null
          raw_json: Json | null
          site_name: string | null
          sitefunctionallocation: string
          tertiary_rating_mva: number | null
          tertiary_voltage_kv: number | null
          voltage_kv: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          cyclic_rating_mva?: number | null
          firm_capacity_mva?: number | null
          id?: string
          nameplate_mva?: number | null
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation: string
          tertiary_rating_mva?: number | null
          tertiary_voltage_kv?: number | null
          voltage_kv?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          cyclic_rating_mva?: number | null
          firm_capacity_mva?: number | null
          id?: string
          nameplate_mva?: number | null
          raw_json?: Json | null
          site_name?: string | null
          sitefunctionallocation?: string
          tertiary_rating_mva?: number | null
          tertiary_voltage_kv?: number | null
          voltage_kv?: number | null
          year?: number | null
        }
        Relationships: []
      }
      unit_rates: {
        Row: {
          build_buildout_4: number
          build_horizontal_4: number
          build_horizontal_6: number
          build_vertical_4: number
          build_vertical_6: number
          cable_ehv_per_m: number
          cable_hv_per_m: number
          cable_joint_kit_185mm: number
          cable_joint_kit_pot_end: number
          cable_lv_per_m: number
          cable_marker_tape_per_m: number
          contingency_pct: number
          cutout_100a_3ph: number
          design_fee_pct: number
          duct_per_m: number
          earthing_lot: number
          excavation_carriageway_per_m: number
          excavation_footway_per_m: number
          excavation_verge_per_m: number
          feeder_pillar_each: number
          id: string
          joint_bay_carriageway: number
          joint_bay_footway: number
          joint_bay_soft: number
          jointing_each: number
          jointing_lv_each: number
          lv_joint_team_day: number
          mains_extension_threshold_m: number
          metering_ct: number
          metering_wc: number
          project_management_pct: number
          reinforcement_per_kw_over_capacity: number
          service_cable_35mm_per_m: number
          socket_build_2: number
          socket_build_4: number
          socket_build_6: number
          socket_build_8: number
          switchgear_circuit_breaker: number
          switchgear_ring_main: number
          termination_each: number
          transformer_1000kva: number
          transformer_1500kva: number
          transformer_500kva: number
          transformer_plinth_each: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          build_buildout_4?: number
          build_horizontal_4?: number
          build_horizontal_6?: number
          build_vertical_4?: number
          build_vertical_6?: number
          cable_ehv_per_m?: number
          cable_hv_per_m?: number
          cable_joint_kit_185mm?: number
          cable_joint_kit_pot_end?: number
          cable_lv_per_m?: number
          cable_marker_tape_per_m?: number
          contingency_pct?: number
          cutout_100a_3ph?: number
          design_fee_pct?: number
          duct_per_m?: number
          earthing_lot?: number
          excavation_carriageway_per_m?: number
          excavation_footway_per_m?: number
          excavation_verge_per_m?: number
          feeder_pillar_each?: number
          id?: string
          joint_bay_carriageway?: number
          joint_bay_footway?: number
          joint_bay_soft?: number
          jointing_each?: number
          jointing_lv_each?: number
          lv_joint_team_day?: number
          mains_extension_threshold_m?: number
          metering_ct?: number
          metering_wc?: number
          project_management_pct?: number
          reinforcement_per_kw_over_capacity?: number
          service_cable_35mm_per_m?: number
          socket_build_2?: number
          socket_build_4?: number
          socket_build_6?: number
          socket_build_8?: number
          switchgear_circuit_breaker?: number
          switchgear_ring_main?: number
          termination_each?: number
          transformer_1000kva?: number
          transformer_1500kva?: number
          transformer_500kva?: number
          transformer_plinth_each?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          build_buildout_4?: number
          build_horizontal_4?: number
          build_horizontal_6?: number
          build_vertical_4?: number
          build_vertical_6?: number
          cable_ehv_per_m?: number
          cable_hv_per_m?: number
          cable_joint_kit_185mm?: number
          cable_joint_kit_pot_end?: number
          cable_lv_per_m?: number
          cable_marker_tape_per_m?: number
          contingency_pct?: number
          cutout_100a_3ph?: number
          design_fee_pct?: number
          duct_per_m?: number
          earthing_lot?: number
          excavation_carriageway_per_m?: number
          excavation_footway_per_m?: number
          excavation_verge_per_m?: number
          feeder_pillar_each?: number
          id?: string
          joint_bay_carriageway?: number
          joint_bay_footway?: number
          joint_bay_soft?: number
          jointing_each?: number
          jointing_lv_each?: number
          lv_joint_team_day?: number
          mains_extension_threshold_m?: number
          metering_ct?: number
          metering_wc?: number
          project_management_pct?: number
          reinforcement_per_kw_over_capacity?: number
          service_cable_35mm_per_m?: number
          socket_build_2?: number
          socket_build_4?: number
          socket_build_6?: number
          socket_build_8?: number
          switchgear_circuit_breaker?: number
          switchgear_ring_main?: number
          termination_each?: number
          transformer_1000kva?: number
          transformer_1500kva?: number
          transformer_500kva?: number
          transformer_plinth_each?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wayleaves: {
        Row: {
          attrs_json: Json | null
          geom: unknown
          id: string
          owner: string | null
          source_date: string | null
          type: string | null
          wayleave_id: string
        }
        Insert: {
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          owner?: string | null
          source_date?: string | null
          type?: string | null
          wayleave_id: string
        }
        Update: {
          attrs_json?: Json | null
          geom?: unknown
          id?: string
          owner?: string | null
          source_date?: string | null
          type?: string | null
          wayleave_id?: string
        }
        Relationships: []
      }
      work_package_estimates: {
        Row: {
          adjustments_total_cost: number
          adjustments_total_price: number
          approved_at: string | null
          approved_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          sites_total_cost: number
          sites_total_price: number
          status: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
          work_package_id: string
        }
        Insert: {
          adjustments_total_cost?: number
          adjustments_total_price?: number
          approved_at?: string | null
          approved_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          notes?: string | null
          rate_card_version_id?: string | null
          sites_total_cost?: number
          sites_total_price?: number
          status?: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id?: string | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          version_number?: number
          work_package_id: string
        }
        Update: {
          adjustments_total_cost?: number
          adjustments_total_price?: number
          approved_at?: string | null
          approved_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          notes?: string | null
          rate_card_version_id?: string | null
          sites_total_cost?: number
          sites_total_price?: number
          status?: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id?: string | null
          total_cost?: number
          total_markup?: number
          total_price?: number
          updated_at?: string
          version_number?: number
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_estimates_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_estimates_rate_card_version_id_fkey"
            columns: ["rate_card_version_id"]
            isOneToOne: false
            referencedRelation: "rate_card_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_estimates_superseded_by_estimate_id_fkey"
            columns: ["superseded_by_estimate_id"]
            isOneToOne: false
            referencedRelation: "work_package_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "work_package_estimates_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_package_types: {
        Row: {
          created_at: string
          default_template_bundle_ref: string | null
          default_workflow_id: string | null
          description: string | null
          id: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_template_bundle_ref?: string | null
          default_workflow_id?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_template_bundle_ref?: string | null
          default_workflow_id?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_types_default_workflow_id_fkey"
            columns: ["default_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      work_packages: {
        Row: {
          budget_amount: number | null
          code: string
          commercial_user_id: string | null
          config_json: Json | null
          created_at: string
          created_by: string | null
          delivery_project_id: string | null
          delivery_user_id: string | null
          id: string
          import_batch_id: string | null
          latest_design_submission_id: string | null
          metadata_json: Json
          name: string
          pm_user_id: string | null
          programme_id: string
          start_date: string | null
          status: string
          target_end_date: string | null
          updated_at: string
          workflow_stage_set_id: string | null
          wp_procurement_unlocked: boolean
          wp_type_id: string | null
        }
        Insert: {
          budget_amount?: number | null
          code: string
          commercial_user_id?: string | null
          config_json?: Json | null
          created_at?: string
          created_by?: string | null
          delivery_project_id?: string | null
          delivery_user_id?: string | null
          id?: string
          import_batch_id?: string | null
          latest_design_submission_id?: string | null
          metadata_json?: Json
          name: string
          pm_user_id?: string | null
          programme_id: string
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
          workflow_stage_set_id?: string | null
          wp_procurement_unlocked?: boolean
          wp_type_id?: string | null
        }
        Update: {
          budget_amount?: number | null
          code?: string
          commercial_user_id?: string | null
          config_json?: Json | null
          created_at?: string
          created_by?: string | null
          delivery_project_id?: string | null
          delivery_user_id?: string | null
          id?: string
          import_batch_id?: string | null
          latest_design_submission_id?: string | null
          metadata_json?: Json
          name?: string
          pm_user_id?: string | null
          programme_id?: string
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
          workflow_stage_set_id?: string | null
          wp_procurement_unlocked?: boolean
          wp_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_latest_design_submission_id_fkey"
            columns: ["latest_design_submission_id"]
            isOneToOne: false
            referencedRelation: "design_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_latest_design_submission_id_fkey"
            columns: ["latest_design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["ev_design_id"]
          },
          {
            foreignKeyName: "work_packages_latest_design_submission_id_fkey"
            columns: ["latest_design_submission_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["icp_design_id"]
          },
          {
            foreignKeyName: "work_packages_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_workflow_stage_set_id_fkey"
            columns: ["workflow_stage_set_id"]
            isOneToOne: false
            referencedRelation: "workflow_stage_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_wp_type_id_fkey"
            columns: ["wp_type_id"]
            isOneToOne: false
            referencedRelation: "work_package_types"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          created_at: string
          current_stage: string
          id: string
          site_id: string | null
          state_json: Json
          updated_at: string
          work_package_id: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          current_stage: string
          id?: string
          site_id?: string | null
          state_json?: Json
          updated_at?: string
          work_package_id?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          current_stage?: string
          id?: string
          site_id?: string | null
          state_json?: Json
          updated_at?: string
          work_package_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "workflow_instances_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "workflow_instances_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stage_set_stages: {
        Row: {
          order_index: number
          set_id: string
          stage_id: string
        }
        Insert: {
          order_index?: number
          set_id: string
          stage_id: string
        }
        Update: {
          order_index?: number
          set_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stage_set_stages_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "workflow_stage_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stage_set_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stage_sets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stage_sets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          key: string
          name: string
          stages_json: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          key: string
          name: string
          stages_json: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          key?: string
          name?: string
          stages_json?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      wp_access: {
        Row: {
          access_role: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          user_id: string
          work_package_id: string
        }
        Insert: {
          access_role: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          user_id: string
          work_package_id: string
        }
        Update: {
          access_role?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_access_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_access_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_estimate_adjustments: {
        Row: {
          amount_cost: number
          amount_price: number
          applies_to: string
          created_at: string
          description: string | null
          id: string
          is_percentage: boolean
          kind: Database["public"]["Enums"]["wp_estimate_adjustment_kind"]
          label: string
          percentage: number | null
          sort_index: number
          updated_at: string
          wp_estimate_id: string
        }
        Insert: {
          amount_cost?: number
          amount_price?: number
          applies_to?: string
          created_at?: string
          description?: string | null
          id?: string
          is_percentage?: boolean
          kind: Database["public"]["Enums"]["wp_estimate_adjustment_kind"]
          label: string
          percentage?: number | null
          sort_index?: number
          updated_at?: string
          wp_estimate_id: string
        }
        Update: {
          amount_cost?: number
          amount_price?: number
          applies_to?: string
          created_at?: string
          description?: string | null
          id?: string
          is_percentage?: boolean
          kind?: Database["public"]["Enums"]["wp_estimate_adjustment_kind"]
          label?: string
          percentage?: number | null
          sort_index?: number
          updated_at?: string
          wp_estimate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_estimate_adjustments_wp_estimate_id_fkey"
            columns: ["wp_estimate_id"]
            isOneToOne: false
            referencedRelation: "work_package_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_estimate_sites: {
        Row: {
          contribution_cost: number
          contribution_price: number
          created_at: string
          id: string
          included: boolean
          notes: string | null
          site_estimate_id: string
          site_id: string
          sort_index: number
          updated_at: string
          wp_estimate_id: string
        }
        Insert: {
          contribution_cost?: number
          contribution_price?: number
          created_at?: string
          id?: string
          included?: boolean
          notes?: string | null
          site_estimate_id: string
          site_id: string
          sort_index?: number
          updated_at?: string
          wp_estimate_id: string
        }
        Update: {
          contribution_cost?: number
          contribution_price?: number
          created_at?: string
          id?: string
          included?: boolean
          notes?: string | null
          site_estimate_id?: string
          site_id?: string
          sort_index?: number
          updated_at?: string
          wp_estimate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_estimate_sites_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "site_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_estimate_sites_site_estimate_id_fkey"
            columns: ["site_estimate_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["latest_site_estimate_id"]
          },
          {
            foreignKeyName: "wp_estimate_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_estimate_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "wp_estimate_sites_wp_estimate_id_fkey"
            columns: ["wp_estimate_id"]
            isOneToOne: false
            referencedRelation: "work_package_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_estimate_variation_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          line_cost: number
          line_price: number
          quantity: number
          rate_code: string | null
          rate_item_id: string | null
          site_id: string | null
          sort_index: number
          unit: string | null
          unit_cost: number
          unit_price: number
          updated_at: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind?: string
          line_cost?: number
          line_price?: number
          quantity?: number
          rate_code?: string | null
          rate_item_id?: string | null
          site_id?: string | null
          sort_index?: number
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          line_cost?: number
          line_price?: number
          quantity?: number
          rate_code?: string | null
          rate_item_id?: string | null
          site_id?: string | null
          sort_index?: number
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_estimate_variation_lines_rate_item_id_fkey"
            columns: ["rate_item_id"]
            isOneToOne: false
            referencedRelation: "rate_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_estimate_variation_lines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_estimate_variation_lines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "wp_estimate_variation_lines_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "wp_estimate_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_estimate_variations: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          delta_cost: number
          delta_price: number
          description: string | null
          id: string
          reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
          variation_number: number
          wp_estimate_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          delta_cost?: number
          delta_price?: number
          description?: string | null
          id?: string
          reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
          variation_number: number
          wp_estimate_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          delta_cost?: number
          delta_price?: number
          description?: string | null
          id?: string
          reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
          variation_number?: number
          wp_estimate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_estimate_variations_wp_estimate_id_fkey"
            columns: ["wp_estimate_id"]
            isOneToOne: false
            referencedRelation: "work_package_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_milestones: {
        Row: {
          actual_date: string | null
          created_at: string
          created_by: string | null
          depends_on_rule_json: Json | null
          description: string | null
          gate_notes: string | null
          gate_status: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type: Database["public"]["Enums"]["milestone_gate_type"]
          id: string
          name: string
          owner_user_id: string | null
          passed_at: string | null
          passed_by: string | null
          percent_complete: number
          phase: Database["public"]["Enums"]["wp_milestone_phase"]
          planned_date: string | null
          sequence: number
          status: Database["public"]["Enums"]["wp_item_status"]
          updated_at: string
          work_package_id: string
        }
        Insert: {
          actual_date?: string | null
          created_at?: string
          created_by?: string | null
          depends_on_rule_json?: Json | null
          description?: string | null
          gate_notes?: string | null
          gate_status?: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type?: Database["public"]["Enums"]["milestone_gate_type"]
          id?: string
          name: string
          owner_user_id?: string | null
          passed_at?: string | null
          passed_by?: string | null
          percent_complete?: number
          phase?: Database["public"]["Enums"]["wp_milestone_phase"]
          planned_date?: string | null
          sequence?: number
          status?: Database["public"]["Enums"]["wp_item_status"]
          updated_at?: string
          work_package_id: string
        }
        Update: {
          actual_date?: string | null
          created_at?: string
          created_by?: string | null
          depends_on_rule_json?: Json | null
          description?: string | null
          gate_notes?: string | null
          gate_status?: Database["public"]["Enums"]["milestone_gate_status"]
          gate_type?: Database["public"]["Enums"]["milestone_gate_type"]
          id?: string
          name?: string
          owner_user_id?: string | null
          passed_at?: string | null
          passed_by?: string | null
          percent_complete?: number
          phase?: Database["public"]["Enums"]["wp_milestone_phase"]
          planned_date?: string | null
          sequence?: number
          status?: Database["public"]["Enums"]["wp_item_status"]
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_milestones_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_milestones_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_partner_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          id: string
          partner_id: string
          site_id: string | null
          work_package_id: string
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          id?: string
          partner_id: string
          site_id?: string | null
          work_package_id: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          id?: string
          partner_id?: string
          site_id?: string | null
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_partner_allocations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_partner_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_partner_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "wp_partner_allocations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_partner_allocations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_sites: {
        Row: {
          created_at: string
          id: string
          local_ref: string | null
          partner_id: string | null
          sequence: number | null
          site_id: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          local_ref?: string | null
          partner_id?: string | null
          sequence?: number | null
          site_id: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          local_ref?: string | null
          partner_id?: string | null
          sequence?: number | null
          site_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_sites_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "wp_sites_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_sites_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_task_dependencies: {
        Row: {
          created_at: string
          depends_on_site_stage_json: Json | null
          depends_on_task_id: string | null
          id: string
          lag_days: number
          link_type: string
          task_id: string
          type: string
        }
        Insert: {
          created_at?: string
          depends_on_site_stage_json?: Json | null
          depends_on_task_id?: string | null
          id?: string
          lag_days?: number
          link_type?: string
          task_id: string
          type?: string
        }
        Update: {
          created_at?: string
          depends_on_site_stage_json?: Json | null
          depends_on_task_id?: string | null
          id?: string
          lag_days?: number
          link_type?: string
          task_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["poc_task_id"]
          },
          {
            foreignKeyName: "wp_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "wp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["poc_task_id"]
          },
          {
            foreignKeyName: "wp_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_tasks: {
        Row: {
          actual_hours: number | null
          created_at: string
          created_by: string | null
          crew_size: number | null
          description: string | null
          due_date: string | null
          duration_days: number | null
          estimate_line_id: string | null
          estimated_hours: number | null
          gantt_color: string | null
          generated_from_estimate_id: string | null
          id: string
          metadata_json: Json
          milestone_id: string | null
          owner_user_id: string | null
          parent_task_id: string | null
          percent_complete: number
          priority: Database["public"]["Enums"]["wp_priority"]
          productivity_qty_per_day: number | null
          qty: number | null
          scope: string
          site_id: string | null
          sort_index: number
          stage_code: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["wp_item_status"]
          task_kind: Database["public"]["Enums"]["wp_task_kind"]
          title: string
          uom: string | null
          updated_at: string
          work_package_id: string
        }
        Insert: {
          actual_hours?: number | null
          created_at?: string
          created_by?: string | null
          crew_size?: number | null
          description?: string | null
          due_date?: string | null
          duration_days?: number | null
          estimate_line_id?: string | null
          estimated_hours?: number | null
          gantt_color?: string | null
          generated_from_estimate_id?: string | null
          id?: string
          metadata_json?: Json
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["wp_priority"]
          productivity_qty_per_day?: number | null
          qty?: number | null
          scope?: string
          site_id?: string | null
          sort_index?: number
          stage_code?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["wp_item_status"]
          task_kind?: Database["public"]["Enums"]["wp_task_kind"]
          title: string
          uom?: string | null
          updated_at?: string
          work_package_id: string
        }
        Update: {
          actual_hours?: number | null
          created_at?: string
          created_by?: string | null
          crew_size?: number | null
          description?: string | null
          due_date?: string | null
          duration_days?: number | null
          estimate_line_id?: string | null
          estimated_hours?: number | null
          gantt_color?: string | null
          generated_from_estimate_id?: string | null
          id?: string
          metadata_json?: Json
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: Database["public"]["Enums"]["wp_priority"]
          productivity_qty_per_day?: number | null
          qty?: number | null
          scope?: string
          site_id?: string | null
          sort_index?: number
          stage_code?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["wp_item_status"]
          task_kind?: Database["public"]["Enums"]["wp_task_kind"]
          title?: string
          uom?: string | null
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "wp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["poc_task_id"]
          },
          {
            foreignKeyName: "wp_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "wp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_tasks_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_tasks_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_team: {
        Row: {
          created_at: string
          id: string
          team_role: string
          user_id: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_role: string
          user_id: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_role?: string
          user_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_team_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_team_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_connection: {
        Row: {
          access_token: string
          connected_by: string | null
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scopes: string | null
          tenant_id: string
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scopes?: string | null
          tenant_id: string
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scopes?: string | null
          tenant_id?: string
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      xero_contacts: {
        Row: {
          contact_status: string | null
          created_at: string
          email: string | null
          id: string
          is_customer: boolean | null
          is_supplier: boolean | null
          last_synced_at: string
          name: string
          updated_at: string
          xero_contact_id: string
        }
        Insert: {
          contact_status?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_customer?: boolean | null
          is_supplier?: boolean | null
          last_synced_at?: string
          name: string
          updated_at?: string
          xero_contact_id: string
        }
        Update: {
          contact_status?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_customer?: boolean | null
          is_supplier?: boolean | null
          last_synced_at?: string
          name?: string
          updated_at?: string
          xero_contact_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      revenue_debtor_aging: {
        Row: {
          aging_bucket: string | null
          certified_amount: number | null
          doc_type: string | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          issue_date: string | null
          net_amount: number | null
          org_id: string | null
          outstanding: number | null
          paid_amount: number | null
          project_id: string | null
          status: string | null
        }
        Insert: {
          aging_bucket?: never
          certified_amount?: number | null
          doc_type?: string | null
          due_date?: string | null
          id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          net_amount?: number | null
          org_id?: string | null
          outstanding?: never
          paid_amount?: number | null
          project_id?: string | null
          status?: string | null
        }
        Update: {
          aging_bucket?: never
          certified_amount?: number | null
          doc_type?: string | null
          due_date?: string | null
          id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          net_amount?: number | null
          org_id?: string | null
          outstanding?: never
          paid_amount?: number | null
          project_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "revenue_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_milestones: {
        Row: {
          actual_date: string | null
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
          owner_user_id: string | null
          percent_complete: number | null
          phase: Database["public"]["Enums"]["milestone_phase"] | null
          planned_date: string | null
          project_id: string | null
          sequence: number | null
          status: Database["public"]["Enums"]["milestone_status"] | null
          updated_at: string | null
        }
        Insert: {
          actual_date?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          percent_complete?: number | null
          phase?: Database["public"]["Enums"]["milestone_phase"] | null
          planned_date?: string | null
          project_id?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["milestone_status"] | null
          updated_at?: string | null
        }
        Update: {
          actual_date?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          percent_complete?: number | null
          phase?: Database["public"]["Enums"]["milestone_phase"] | null
          planned_date?: string | null
          project_id?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["milestone_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      site_programmes: {
        Row: {
          account_id: string | null
          actual_end_date: string | null
          code: string | null
          config_json: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          health: Database["public"]["Enums"]["project_health"] | null
          id: string | null
          name: string | null
          org_id: string | null
          percent_complete: number | null
          priority: Database["public"]["Enums"]["project_priority"] | null
          proposal_id: string | null
          site_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          study_id: string | null
          target_end_date: string | null
          template_id: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          account_id?: string | null
          actual_end_date?: string | null
          code?: string | null
          config_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"] | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["project_priority"] | null
          proposal_id?: string | null
          site_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          study_id?: string | null
          target_end_date?: string | null
          template_id?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          account_id?: string | null
          actual_end_date?: string | null
          code?: string | null
          config_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"] | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["project_priority"] | null
          proposal_id?: string | null
          site_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          study_id?: string | null
          target_end_date?: string | null
          template_id?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_wp_site_precon_status"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "projects_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "projects_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      site_tasks: {
        Row: {
          actual_hours: number | null
          boq_ref: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string | null
          metadata_json: Json | null
          milestone_id: string | null
          owner_user_id: string | null
          parent_task_id: string | null
          percent_complete: number | null
          priority: Database["public"]["Enums"]["project_priority"] | null
          project_id: string | null
          sort_index: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          boq_ref?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string | null
          metadata_json?: Json | null
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["project_priority"] | null
          project_id?: string | null
          sort_index?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          boq_ref?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string | null
          metadata_json?: Json | null
          milestone_id?: string | null
          owner_user_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["project_priority"] | null
          project_id?: string | null
          sort_index?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "site_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      ukpn_circuit_latest_utilisation: {
        Row: {
          circuit_id: string | null
          licence_area: string | null
          month: number | null
          peak_12mo_mw: number | null
          peak_amps: number | null
          peak_mw: number | null
          rating_mva: number | null
          utilisation_pct: number | null
          voltage_kv: number | null
          year: number | null
        }
        Relationships: []
      }
      v_site_handover_readiness: {
        Row: {
          cert_count: number | null
          cert_expired_count: number | null
          cert_issued_count: number | null
          client_signed_at: string | null
          commissioned_at: string | null
          energised_at: string | null
          handover_status: Database["public"]["Enums"]["handover_status"] | null
          has_om_bundle: boolean | null
          is_commissioned: boolean | null
          is_energised: boolean | null
          org_id: string | null
          pc_signed_at: string | null
          ready_for_handover: boolean | null
          site_id: string | null
          snag_open: number | null
          snag_open_critical: number | null
          snag_open_major: number | null
          snag_total: number | null
          work_package_id: string | null
        }
        Relationships: []
      }
      v_wp_commercial_position: {
        Row: {
          actual_cost: number | null
          actual_expense: number | null
          actual_labour: number | null
          actual_material: number | null
          actual_other: number | null
          actual_plant: number | null
          actual_subcontractor: number | null
          awarded_cost: number | null
          awarded_grand_total: number | null
          awarded_price: number | null
          budget_amount: number | null
          budget_amount_manual: number | null
          budget_variance: number | null
          code: string | null
          cost_pct_of_awarded: number | null
          cost_variance: number | null
          forecast_margin: number | null
          forecast_margin_pct: number | null
          name: string | null
          programme_id: string | null
          status: string | null
          work_package_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_wp_site_precon_status: {
        Row: {
          blocker_reason: string | null
          current_stage_id: string | null
          current_stage_label: string | null
          estimate_approved_at: string | null
          estimate_status:
            | Database["public"]["Enums"]["site_estimate_status"]
            | null
          ev_design_id: string | null
          ev_design_status: string | null
          final_review_state: string | null
          icp_design_id: string | null
          icp_design_status: string | null
          last_activity_at: string | null
          latest_offer_at: string | null
          latest_offer_id: string | null
          latest_offer_status: string | null
          latest_offer_value: number | null
          latest_rams_id: string | null
          latest_site_estimate_id: string | null
          latest_survey_id: string | null
          local_ref: string | null
          next_action_due: string | null
          next_action_label: string | null
          poc_sla_date: string | null
          poc_status: string | null
          poc_task_id: string | null
          postcode: string | null
          primary_partner_id: string | null
          rams_status: Database["public"]["Enums"]["rams_status"] | null
          sequence: number | null
          site_id: string | null
          site_name: string | null
          survey_status: string | null
          survey_submitted_at: string | null
          viability_index: number | null
          work_package_id: string | null
          wp_site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_primary_partner_id_fkey"
            columns: ["primary_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_sites_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "v_wp_commercial_position"
            referencedColumns: ["work_package_id"]
          },
          {
            foreignKeyName: "wp_sites_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_proposal_into_wp: {
        Args: {
          _new_wp_code?: string
          _new_wp_name?: string
          _programme_id?: string
          _proposal_id: string
          _template_key?: string
          _wp_id?: string
        }
        Returns: Json
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_get_profile_phone: {
        Args: { target_user: string }
        Returns: string
      }
      advisor_search_geo_feeders: {
        Args: {
          center_lat: number
          center_lng: number
          max_rows?: number
          radius_m: number
          v_max?: number
          v_min?: number
        }
        Returns: {
          distance_m: number
          dno: string
          id: string
          lat: number
          lng: number
          name: string
          voltage_kv: number
        }[]
      }
      advisor_search_geo_substations: {
        Args: {
          center_lat: number
          center_lng: number
          max_rows?: number
          max_util?: number
          min_headroom?: number
          radius_m: number
          v_max?: number
          v_min?: number
        }
        Returns: {
          distance_m: number
          dno: string
          headroom_kw: number
          id: string
          lat: number
          lng: number
          name: string
          utilisation_pct: number
          voltage_kv: number
        }[]
      }
      advisor_search_site_utilisation: {
        Args: {
          center_lat: number
          center_lng: number
          la?: string
          max_rows?: number
          max_util?: number
          min_headroom?: number
          radius_m: number
        }
        Returns: {
          distance_m: number
          dno: string
          headroom_kw: number
          id: string
          lat: number
          lng: number
          local_authority: string
          name: string
          utilisation_pct: number
        }[]
      }
      apply_programme_template: {
        Args: { _project_id: string; _template_key: string }
        Returns: Json
      }
      approve_estimate_recipe: {
        Args: { _recipe_id: string }
        Returns: undefined
      }
      approve_rate_card_version: {
        Args: { _version_id: string }
        Returns: string
      }
      approve_site_estimate: {
        Args: { p_estimate_id: string; p_notes?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          client_decision: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          recipe_id: string | null
          site_id: string
          status: Database["public"]["Enums"]["site_estimate_status"]
          study_id: string | null
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "site_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_wp_estimate: {
        Args: { p_estimate_id: string; p_notes?: string }
        Returns: {
          adjustments_total_cost: number
          adjustments_total_price: number
          approved_at: string | null
          approved_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          sites_total_cost: number
          sites_total_price: number
          status: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
          work_package_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_package_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_entity: {
        Args: { _entity_id: string; _entity_type: string; _reason: string }
        Returns: string
      }
      auto_create_dno_layers: {
        Args: { p_dno: string; p_force?: boolean }
        Returns: Json
      }
      batch_insert_geo_features: {
        Args: { _features_json: string; _table_name: string }
        Returns: number
      }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_wp: {
        Args: { _user_id: string; _wp_id: string }
        Returns: boolean
      }
      can_manage_wp: {
        Args: { _user_id: string; _wp_id: string }
        Returns: boolean
      }
      certify_invoice: {
        Args: {
          _certified_amount: number
          _certified_date: string
          _id: string
        }
        Returns: undefined
      }
      clear_layer_features: {
        Args: { _layer_id: string; _table_name: string }
        Returns: number
      }
      clone_estimate_as_revision: {
        Args: { _estimate_id: string }
        Returns: string
      }
      clone_estimate_recipe_to_draft: {
        Args: { _recipe_id: string }
        Returns: string
      }
      clone_rate_card_version_to_draft: {
        Args: { _version_id: string }
        Returns: string
      }
      clone_site_estimate_to_draft: {
        Args: { p_estimate_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          client_decision: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          recipe_id: string | null
          site_id: string
          status: Database["public"]["Enums"]["site_estimate_status"]
          study_id: string | null
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "site_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clone_wp_estimate_to_draft: {
        Args: { p_estimate_id: string }
        Returns: {
          adjustments_total_cost: number
          adjustments_total_price: number
          approved_at: string | null
          approved_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          sites_total_cost: number
          sites_total_price: number
          status: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
          work_package_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_package_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notification_for_user: {
        Args: {
          notification_message: string
          notification_type: string
          target_study: string
          target_user: string
        }
        Returns: string
      }
      create_wp_estimate_variation: {
        Args: {
          _description?: string
          _reason?: string
          _title: string
          _wp_estimate_id: string
        }
        Returns: string
      }
      decide_wp_estimate_variation: {
        Args: { _approve: boolean; _notes?: string; _variation_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_work_package: {
        Args: { _reason: string; _wp_id: string }
        Returns: string
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_nearest_compatible_lv_main: {
        Args: { p_lat: number; p_lon: number; p_search_m?: number }
        Returns: {
          asset_id: string
          cable_id: string
          conducting_section_type: string
          direct_kva: number
          distance_m: number
          ducted_kva: number
          ev_compatible: boolean
          feeder_name: string
          green_compatible: boolean
          is_main_like: boolean
          is_service_like: boolean
          is_unknown: boolean
          parsed_construction: string
          parsed_family: string
          parsed_material: string
          parsed_size_unit: string
          parsed_size_value: number
          score: number
          snap_lat: number
          snap_lon: number
          source_site_name: string
        }[]
      }
      find_nearest_compatible_lv_main_route: {
        Args: { p_route_geojson: Json; p_search_m?: number }
        Returns: {
          asset_id: string
          cable_id: string
          conducting_section_type: string
          direct_kva: number
          distance_m: number
          ducted_kva: number
          ev_compatible: boolean
          feeder_name: string
          green_compatible: boolean
          is_main_like: boolean
          is_service_like: boolean
          is_unknown: boolean
          parsed_construction: string
          parsed_family: string
          parsed_material: string
          parsed_size_unit: string
          parsed_size_value: number
          route_snap_lat: number
          route_snap_lon: number
          score: number
          snap_lat: number
          snap_lon: number
          source_site_name: string
        }[]
      }
      find_nearest_hv_asset: {
        Args: {
          p_lat: number
          p_lon: number
          p_max_voltage_kv?: number
          p_min_voltage_kv?: number
          p_search_m?: number
        }
        Returns: {
          asset_id: string
          asset_type: string
          attrs_json: Json
          capacity_flag: string
          capacity_value: number
          distance_m: number
          name: string
          snap_distance_m: number
          snap_lat: number
          snap_lon: number
          source_table: string
          voltage_kv: number
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_geo_layer_geojson: {
        Args: {
          _bbox?: string
          _dno_clip?: string
          _layer_id: string
          _limit?: number
          _storage_table: string
        }
        Returns: Json
      }
      get_layer_geojson: {
        Args: { _bbox_filter?: string; _limit?: number; _table_name: string }
        Returns: Json
      }
      get_own_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          is_approved: boolean
          is_platform_admin: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_sites_for_poc: {
        Args: { _site_ids: string[] }
        Returns: {
          client_site_code: string
          id: string
          lat: number
          lng: number
          postcode: string
          proposed_kw: number
          site_name: string
          socket_count: number
          socket_groups: Json
        }[]
      }
      get_survey_by_token: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          postcode: string
          sent_to_email: string
          sent_to_name: string
          site_id: string
          site_name: string
          status: string
          survey_id: string
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      has_capability: {
        Args: { _capability: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_wp_access: {
        Args: { _user_id: string; _wp_id: string }
        Returns: boolean
      }
      has_wp_team_access: {
        Args: { _user_id: string; _wp_id: string }
        Returns: boolean
      }
      is_gridwise_staff: { Args: { _user_id: string }; Returns: boolean }
      is_open_site_survey: { Args: { _survey_id: string }; Returns: boolean }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_partner_for_site: { Args: { _site_id: string }; Returns: boolean }
      is_partner_for_wp: { Args: { _wp_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      lookup_dno_by_location: {
        Args: { p_lat: number; p_lng: number }
        Returns: string
      }
      mark_invoice_paid: {
        Args: { _id: string; _paid_amount: number; _paid_date: string }
        Returns: undefined
      }
      maybe_auto_pass_final_review: {
        Args: { p_site: string; p_wp: string }
        Returns: undefined
      }
      move_sites_between_wps: {
        Args: {
          _adopt_destination_partner?: boolean
          _reason: string
          _site_ids: string[]
          _to_wp_id: string
        }
        Returns: {
          message: string
          records_moved: Json
          site_id: string
          status: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      nearby_geo_points_by_slug: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_m?: number
          p_slug: string
        }
        Returns: {
          asset_id: string
          attrs_json: Json
          distance_m: number
          id: string
          name: string
        }[]
      }
      partner_acknowledge_snag: {
        Args: { _notes?: string; _snag_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string | null
          id: string
          metadata_json: Json
          org_id: string
          owner_partner_id: string | null
          owner_user_id: string | null
          partner_ack_notes: string | null
          partner_acknowledged_at: string | null
          partner_acknowledged_by: string | null
          photo_file_id: string | null
          raised_at: string
          raised_by: string | null
          resolution_notes: string | null
          severity: Database["public"]["Enums"]["snag_severity"]
          site_id: string | null
          status: Database["public"]["Enums"]["snag_status"]
          target_close_date: string | null
          title: string
          updated_at: string
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "snagging_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      preview_accept_proposal: {
        Args: { _proposal_id: string; _template_key?: string; _wp_id?: string }
        Returns: Json
      }
      purge_entity: { Args: { _archive_id: string }; Returns: boolean }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_site_stage: { Args: { _project_id: string }; Returns: undefined }
      recalc_wp_estimate_variation: {
        Args: { _variation_id: string }
        Returns: undefined
      }
      recalc_wp_milestone_progress: {
        Args: { _milestone_id: string }
        Returns: undefined
      }
      recalculate_wp_estimate_totals: {
        Args: { p_estimate_id: string }
        Returns: {
          adjustments_total_cost: number
          adjustments_total_price: number
          approved_at: string | null
          approved_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          notes: string | null
          rate_card_version_id: string | null
          sites_total_cost: number
          sites_total_price: number
          status: Database["public"]["Enums"]["wp_estimate_status"]
          superseded_by_estimate_id: string | null
          total_cost: number
          total_markup: number
          total_price: number
          updated_at: string
          version_number: number
          work_package_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_package_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_invoice: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      remove_sites_from_wp: {
        Args: { _site_ids: string[]; _wp_id: string }
        Returns: Json
      }
      restore_entity: { Args: { _archive_id: string }; Returns: string }
      revenue_monthly_rollup: {
        Args: { _org_id: string; _year: number }
        Returns: {
          actual_civils: number
          actual_elec: number
          actual_gp: number
          actual_revenue: number
          baseline_revenue: number
          forecast_civils: number
          forecast_elec: number
          forecast_gp: number
          forecast_revenue: number
          invoice_count: number
          month: number
          stream: string
        }[]
      }
      rollup_project_progress: {
        Args: { _project_id: string }
        Returns: undefined
      }
      route_crossing_detect: {
        Args: { route_wkt: string }
        Returns: {
          asset_name: string
          crossing_type: string
          dno: string
          voltage_kv: number
        }[]
      }
      route_nearby_cables: {
        Args: { radius_m?: number; route_wkt: string }
        Returns: {
          asset_id: string
          capacity_flag: string
          distance_m: number
          dno: string
          id: string
          layer_name: string
          name: string
          voltage_kv: number
        }[]
      }
      route_surface_classify: {
        Args: { buffer_m?: number; route_wkt: string }
        Returns: {
          carriageway_width_m: number
          footway_width_m: number
          length_m: number
          restriction_flag: string
          segment_id: string
          surface_type: string
        }[]
      }
      scan_entity_dependencies: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: Json
      }
      score_site: {
        Args: { _proposed_kw?: number; _site_geom: unknown }
        Returns: Json
      }
      score_site_from_lnglat: {
        Args: { _lat: number; _lng: number; _proposed_kw?: number }
        Returns: Json
      }
      search_substations_in_polygon: {
        Args: { _geojson: string; _limit?: number }
        Returns: {
          connected_customers: number
          firm_capacity_kw: number
          headroom_band: string
          id: string
          max_demand_kw: number
          site_id: string
          site_name: string
          transformer_headroom_kw: number
          upstream_site: string
          utilisation_band: string
          utilisation_pct: number
        }[]
      }
      set_site_geom_wgs84: {
        Args: { _lat: number; _lng: number; _site_id: string }
        Returns: undefined
      }
      site_move_blockers: {
        Args: { _site_id: string }
        Returns: {
          blocker: string
          detail: string
        }[]
      }
      ssen_substation_capacity_lookup: {
        Args: { _name: string }
        Returns: {
          fault_break_ka: number
          fault_make_ka: number
          firm_capacity_mva: number
          forecast_json: Json
          headroom_mva: number
          power_factor: number
          recorded_demand_mva: number
          region: string
          site_name: string
          source_date: string
          voltage_kv: number
        }[]
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      submit_survey_by_token: {
        Args: {
          _image_urls: Json
          _pdf_url: string
          _signature_url: string
          _submission: Json
          _submitter_email: string
          _submitter_name: string
          _token: string
        }
        Returns: string
      }
      submit_wp_estimate_variation: {
        Args: { _variation_id: string }
        Returns: undefined
      }
      sweep_expired_archives: {
        Args: never
        Returns: {
          failed_count: number
          purged_count: number
        }[]
      }
      ukpn_circuits_for_substation: {
        Args: { p_name: string }
        Returns: {
          circuit_id: string
          feeder_description: string
          from_node: string
          grid_supply_point: string
          latest_month: number
          latest_year: number
          months_12_peak_mw: number
          peak_amps: number
          peak_mw: number
          to_node: string
          voltage_kv: number
        }[]
      }
      ukpn_substation_capacity_lookup: {
        Args: { _sfl: string }
        Returns: {
          cyclic_rating_mva: number
          fault_3ph_ka: number
          fault_earth_ka: number
          firm_capacity_mva: number
          headroom_observed_mva: number
          headroom_true_mva: number
          peak_observed_mw: number
          peak_true_mw: number
          sitefunctionallocation: string
          voltage_kv: number
          year: number
        }[]
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_site_utilisation_geom: { Args: never; Returns: undefined }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_precon_gate: {
        Args: { p_gate: string; p_site: string; p_state: string; p_wp: string }
        Returns: undefined
      }
      user_can_access_study: {
        Args: { _study_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_study_editor_share: {
        Args: { _study_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_study_share: {
        Args: { _study_id: string; _user_id: string }
        Returns: boolean
      }
      user_org_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      actual_cost_category:
        | "labour"
        | "material"
        | "plant"
        | "subcontractor"
        | "expense"
        | "other"
      actual_cost_source: "manual" | "invoice" | "timesheet" | "po" | "import"
      app_role: "admin" | "engineer" | "client"
      certificate_status: "draft" | "issued" | "expired" | "revoked"
      commissioning_status:
        | "pending"
        | "in_progress"
        | "energised"
        | "commissioned"
        | "failed"
      handover_status:
        | "pending"
        | "practical_completion"
        | "client_signed"
        | "completed"
        | "on_hold"
      inspection_result: "pending" | "passed" | "passed_with_defects" | "failed"
      milestone_gate_status: "open" | "passed" | "blocked" | "waived"
      milestone_gate_type:
        | "information"
        | "stage_gate"
        | "payment"
        | "dno_energisation"
        | "commissioning"
        | "handover"
        | "commercial"
        | "compliance"
      milestone_phase:
        | "procurement"
        | "delivery"
        | "commissioning"
        | "handover"
        | "custom"
      milestone_status: "not_started" | "in_progress" | "completed" | "blocked"
      permit_status:
        | "draft"
        | "applied"
        | "approved"
        | "rejected"
        | "expired"
        | "cancelled"
      poc_estimate_status: "draft" | "sent" | "accepted" | "rejected"
      project_health: "green" | "amber" | "red"
      project_member_role:
        | "owner"
        | "pm"
        | "engineer"
        | "commercial"
        | "delivery"
        | "client_viewer"
        | "dno_viewer"
        | "icp"
      project_priority: "low" | "medium" | "high" | "critical"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      proposal_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      rams_status:
        | "draft"
        | "under_review"
        | "approved"
        | "superseded"
        | "rejected"
      rate_card_status: "DRAFT" | "APPROVED" | "SUPERSEDED"
      rate_provided_by: "partner" | "client" | "both" | "unknown"
      recipe_build_type: "horizontal" | "vertical" | "buildout" | "other"
      site_estimate_exception_kind:
        | "missing_rate"
        | "unconfirmed_quantity"
        | "price_override"
        | "manual_addition"
        | "allowance_review"
        | "other"
      site_estimate_exception_severity: "info" | "warning" | "blocker"
      site_estimate_status: "DRAFT" | "APPROVED" | "SUPERSEDED"
      site_stage_key:
        | "survey"
        | "design"
        | "dno"
        | "permit"
        | "civils"
        | "electrical"
        | "meter"
        | "handover"
      site_stage_state:
        | "not_started"
        | "in_progress"
        | "blocked"
        | "review"
        | "done"
      snag_severity: "minor" | "major" | "critical"
      snag_status: "open" | "in_progress" | "resolved" | "closed" | "wont_fix"
      task_dep_type: "FS" | "SS" | "FF" | "SF"
      task_status: "todo" | "in_progress" | "blocked" | "review" | "done"
      tm_approval_state:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "expired"
      wp_estimate_adjustment_kind:
        | "contingency"
        | "preliminaries"
        | "overhead"
        | "discount"
        | "risk"
        | "management_fee"
        | "other"
      wp_estimate_status: "DRAFT" | "APPROVED" | "SUPERSEDED"
      wp_item_status:
        | "not_started"
        | "in_progress"
        | "blocked"
        | "review"
        | "done"
        | "cancelled"
      wp_milestone_phase:
        | "mobilisation"
        | "design_batch"
        | "procurement"
        | "construction"
        | "commissioning"
        | "handover"
        | "commercial"
        | "custom"
      wp_priority: "low" | "medium" | "high" | "critical"
      wp_task_kind:
        | "site_summary"
        | "stage_summary"
        | "work"
        | "poc"
        | "estimate"
        | "client_decision"
        | "survey_alloc"
        | "design_ev"
        | "design_icp"
        | "rams"
        | "design_review"
        | "precon_gate"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      actual_cost_category: [
        "labour",
        "material",
        "plant",
        "subcontractor",
        "expense",
        "other",
      ],
      actual_cost_source: ["manual", "invoice", "timesheet", "po", "import"],
      app_role: ["admin", "engineer", "client"],
      certificate_status: ["draft", "issued", "expired", "revoked"],
      commissioning_status: [
        "pending",
        "in_progress",
        "energised",
        "commissioned",
        "failed",
      ],
      handover_status: [
        "pending",
        "practical_completion",
        "client_signed",
        "completed",
        "on_hold",
      ],
      inspection_result: ["pending", "passed", "passed_with_defects", "failed"],
      milestone_gate_status: ["open", "passed", "blocked", "waived"],
      milestone_gate_type: [
        "information",
        "stage_gate",
        "payment",
        "dno_energisation",
        "commissioning",
        "handover",
        "commercial",
        "compliance",
      ],
      milestone_phase: [
        "procurement",
        "delivery",
        "commissioning",
        "handover",
        "custom",
      ],
      milestone_status: ["not_started", "in_progress", "completed", "blocked"],
      permit_status: [
        "draft",
        "applied",
        "approved",
        "rejected",
        "expired",
        "cancelled",
      ],
      poc_estimate_status: ["draft", "sent", "accepted", "rejected"],
      project_health: ["green", "amber", "red"],
      project_member_role: [
        "owner",
        "pm",
        "engineer",
        "commercial",
        "delivery",
        "client_viewer",
        "dno_viewer",
        "icp",
      ],
      project_priority: ["low", "medium", "high", "critical"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      proposal_status: ["draft", "sent", "accepted", "rejected", "expired"],
      rams_status: [
        "draft",
        "under_review",
        "approved",
        "superseded",
        "rejected",
      ],
      rate_card_status: ["DRAFT", "APPROVED", "SUPERSEDED"],
      rate_provided_by: ["partner", "client", "both", "unknown"],
      recipe_build_type: ["horizontal", "vertical", "buildout", "other"],
      site_estimate_exception_kind: [
        "missing_rate",
        "unconfirmed_quantity",
        "price_override",
        "manual_addition",
        "allowance_review",
        "other",
      ],
      site_estimate_exception_severity: ["info", "warning", "blocker"],
      site_estimate_status: ["DRAFT", "APPROVED", "SUPERSEDED"],
      site_stage_key: [
        "survey",
        "design",
        "dno",
        "permit",
        "civils",
        "electrical",
        "meter",
        "handover",
      ],
      site_stage_state: [
        "not_started",
        "in_progress",
        "blocked",
        "review",
        "done",
      ],
      snag_severity: ["minor", "major", "critical"],
      snag_status: ["open", "in_progress", "resolved", "closed", "wont_fix"],
      task_dep_type: ["FS", "SS", "FF", "SF"],
      task_status: ["todo", "in_progress", "blocked", "review", "done"],
      tm_approval_state: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "expired",
      ],
      wp_estimate_adjustment_kind: [
        "contingency",
        "preliminaries",
        "overhead",
        "discount",
        "risk",
        "management_fee",
        "other",
      ],
      wp_estimate_status: ["DRAFT", "APPROVED", "SUPERSEDED"],
      wp_item_status: [
        "not_started",
        "in_progress",
        "blocked",
        "review",
        "done",
        "cancelled",
      ],
      wp_milestone_phase: [
        "mobilisation",
        "design_batch",
        "procurement",
        "construction",
        "commissioning",
        "handover",
        "commercial",
        "custom",
      ],
      wp_priority: ["low", "medium", "high", "critical"],
      wp_task_kind: [
        "site_summary",
        "stage_summary",
        "work",
        "poc",
        "estimate",
        "client_decision",
        "survey_alloc",
        "design_ev",
        "design_icp",
        "rams",
        "design_review",
        "precon_gate",
      ],
    },
  },
} as const
