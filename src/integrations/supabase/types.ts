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
      app_settings: {
        Row: {
          id: string
          require_approval: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
            foreignKeyName: "dno_dataset_registry_linked_layer_id_fkey"
            columns: ["linked_layer_id"]
            isOneToOne: false
            referencedRelation: "layer_registry"
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
          storage_table?: string
          style_json?: Json
          subcategory?: string | null
          updated_at?: string
          visible_by_default?: boolean | null
        }
        Relationships: []
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
          id: string
          message: string
          read_at: string | null
          study_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          study_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          phone?: string | null
          updated_at?: string
          user_id?: string
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
          client_org: string | null
          connection_options: Json | null
          cost_band: string | null
          created_at: string
          created_by: string
          deployment_class: string | null
          geom: unknown
          grid_readiness: string | null
          id: string
          next_steps: Json | null
          postcode: string | null
          proposed_kw: number | null
          raw_score_data: Json | null
          reinforcement_probability: number | null
          score: string | null
          score_reasons: Json | null
          site_name: string
          site_type: string | null
          status: string
          updated_at: string
          viability_index: number | null
        }
        Insert: {
          client_org?: string | null
          connection_options?: Json | null
          cost_band?: string | null
          created_at?: string
          created_by: string
          deployment_class?: string | null
          geom?: unknown
          grid_readiness?: string | null
          id?: string
          next_steps?: Json | null
          postcode?: string | null
          proposed_kw?: number | null
          raw_score_data?: Json | null
          reinforcement_probability?: number | null
          score?: string | null
          score_reasons?: Json | null
          site_name: string
          site_type?: string | null
          status?: string
          updated_at?: string
          viability_index?: number | null
        }
        Update: {
          client_org?: string | null
          connection_options?: Json | null
          cost_band?: string | null
          created_at?: string
          created_by?: string
          deployment_class?: string | null
          geom?: unknown
          grid_readiness?: string | null
          id?: string
          next_steps?: Json | null
          postcode?: string | null
          proposed_kw?: number | null
          raw_score_data?: Json | null
          reinforcement_probability?: number | null
          score?: string | null
          score_reasons?: Json | null
          site_name?: string
          site_type?: string | null
          status?: string
          updated_at?: string
          viability_index?: number | null
        }
        Relationships: []
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
          proposed_kw: number | null
          route_geojson: Json | null
          ruleset_version: string | null
          site_id: string | null
          status: string
          study_name: string
          updated_at: string
          voltage_level: string | null
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
          proposed_kw?: number | null
          route_geojson?: Json | null
          ruleset_version?: string | null
          site_id?: string | null
          status?: string
          study_name: string
          updated_at?: string
          voltage_level?: string | null
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
          proposed_kw?: number | null
          route_geojson?: Json | null
          ruleset_version?: string | null
          site_id?: string | null
          status?: string
          study_name?: string
          updated_at?: string
          voltage_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studies_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      unit_rates: {
        Row: {
          cable_ehv_per_m: number
          cable_hv_per_m: number
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
          jointing_each: number
          jointing_lv_each: number
          metering_ct: number
          metering_wc: number
          project_management_pct: number
          reinforcement_per_kw_over_capacity: number
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
          cable_ehv_per_m?: number
          cable_hv_per_m?: number
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
          jointing_each?: number
          jointing_lv_each?: number
          metering_ct?: number
          metering_wc?: number
          project_management_pct?: number
          reinforcement_per_kw_over_capacity?: number
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
          cable_ehv_per_m?: number
          cable_hv_per_m?: number
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
          jointing_each?: number
          jointing_lv_each?: number
          metering_ct?: number
          metering_wc?: number
          project_management_pct?: number
          reinforcement_per_kw_over_capacity?: number
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
      batch_insert_geo_features: {
        Args: { _features_json: string; _table_name: string }
        Returns: number
      }
      clear_layer_features: {
        Args: { _layer_id: string; _table_name: string }
        Returns: number
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
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
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
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      lookup_dno_by_location: {
        Args: { p_lat: number; p_lng: number }
        Returns: string
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
    }
    Enums: {
      app_role: "admin" | "engineer" | "client"
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
      app_role: ["admin", "engineer", "client"],
    },
  },
} as const
