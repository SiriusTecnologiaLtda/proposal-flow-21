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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      api_integrations: {
        Row: {
          auth_type: string
          auth_value: string | null
          body_template: string | null
          created_at: string
          endpoint_url: string
          entity: string
          field_mapping: Json
          headers: Json | null
          http_method: string
          id: string
          label: string
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          pagination_enabled: boolean
          pagination_order_by: string | null
          pagination_page_size: number
          pagination_param_limit: string
          pagination_param_offset: string
          pagination_type: string
          schedule_cron: string | null
          schedule_days: Json
          schedule_enabled: boolean
          schedule_time: string | null
          updated_at: string
        }
        Insert: {
          auth_type?: string
          auth_value?: string | null
          body_template?: string | null
          created_at?: string
          endpoint_url: string
          entity?: string
          field_mapping?: Json
          headers?: Json | null
          http_method?: string
          id?: string
          label: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          pagination_enabled?: boolean
          pagination_order_by?: string | null
          pagination_page_size?: number
          pagination_param_limit?: string
          pagination_param_offset?: string
          pagination_type?: string
          schedule_cron?: string | null
          schedule_days?: Json
          schedule_enabled?: boolean
          schedule_time?: string | null
          updated_at?: string
        }
        Update: {
          auth_type?: string
          auth_value?: string | null
          body_template?: string | null
          created_at?: string
          endpoint_url?: string
          entity?: string
          field_mapping?: Json
          headers?: Json | null
          http_method?: string
          id?: string
          label?: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          pagination_enabled?: boolean
          pagination_order_by?: string | null
          pagination_page_size?: number
          pagination_param_limit?: string
          pagination_param_offset?: string
          pagination_type?: string
          schedule_cron?: string | null
          schedule_days?: Json
          schedule_enabled?: boolean
          schedule_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          department: string | null
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          department?: string | null
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_edit_logs: {
        Row: {
          changes: Json
          client_id: string
          context: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          changes?: Json
          client_id: string
          context?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          changes?: Json
          client_id?: string
          context?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_edit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          cnpj: string
          code: string
          contact: string | null
          created_at: string
          email: string | null
          esn_id: string | null
          gsn_id: string | null
          id: string
          name: string
          phone: string | null
          state_registration: string | null
          store_code: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj: string
          code: string
          contact?: string | null
          created_at?: string
          email?: string | null
          esn_id?: string | null
          gsn_id?: string | null
          id?: string
          name: string
          phone?: string | null
          state_registration?: string | null
          store_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string
          code?: string
          contact?: string | null
          created_at?: string
          email?: string | null
          esn_id?: string | null
          gsn_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          state_registration?: string | null
          store_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_esn_id_fkey"
            columns: ["esn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_gsn_id_fkey"
            columns: ["gsn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit_info"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_projections: {
        Row: {
          amount: number
          commission_pct: number
          commission_value: number
          created_at: string
          due_date: string
          esn_id: string
          id: string
          installment: number
          proposal_id: string
          proposal_status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          commission_pct?: number
          commission_value?: number
          created_at?: string
          due_date: string
          esn_id: string
          id?: string
          installment: number
          proposal_id: string
          proposal_status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          commission_pct?: number
          commission_value?: number
          created_at?: string
          due_date?: string
          esn_id?: string
          id?: string
          installment?: number
          proposal_id?: string
          proposal_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_projections_esn_id_fkey"
            columns: ["esn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_projections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_request_votes: {
        Row: {
          created_at: string
          feature_request_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_request_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_request_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_votes_feature_request_id_fkey"
            columns: ["feature_request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          admin_response: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          created_by: string
          description?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_integrations: {
        Row: {
          auth_type: string
          created_at: string
          drive_folder_id: string
          id: string
          is_default: boolean
          label: string
          oauth_client_id: string | null
          oauth_client_secret: string | null
          oauth_refresh_token: string | null
          output_folder_id: string | null
          sender_email: string | null
          service_account_key: string | null
          updated_at: string
        }
        Insert: {
          auth_type?: string
          created_at?: string
          drive_folder_id: string
          id?: string
          is_default?: boolean
          label: string
          oauth_client_id?: string | null
          oauth_client_secret?: string | null
          oauth_refresh_token?: string | null
          output_folder_id?: string | null
          sender_email?: string | null
          service_account_key?: string | null
          updated_at?: string
        }
        Update: {
          auth_type?: string
          created_at?: string
          drive_folder_id?: string
          id?: string
          is_default?: boolean
          label?: string
          oauth_client_id?: string | null
          oauth_client_secret?: string | null
          oauth_refresh_token?: string | null
          output_folder_id?: string | null
          sender_email?: string | null
          service_account_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          cleared_before: boolean
          created_at: string
          duration_ms: number | null
          entity: string
          error_details: Json | null
          errors: number
          file_name: string
          finished_at: string | null
          id: string
          imported: number
          skipped: number
          started_at: string
          status: string
          summary: string | null
          total_rows: number
          updated: number
          user_id: string | null
        }
        Insert: {
          cleared_before?: boolean
          created_at?: string
          duration_ms?: number | null
          entity: string
          error_details?: Json | null
          errors?: number
          file_name: string
          finished_at?: string | null
          id?: string
          imported?: number
          skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          total_rows?: number
          updated?: number
          user_id?: string | null
        }
        Update: {
          cleared_before?: boolean
          created_at?: string
          duration_ms?: number | null
          entity?: string
          error_details?: Json | null
          errors?: number
          file_name?: string
          finished_at?: string | null
          id?: string
          imported?: number
          skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          total_rows?: number
          updated?: number
          user_id?: string | null
        }
        Relationships: []
      }
      payment_conditions: {
        Row: {
          amount: number
          due_date: string | null
          id: string
          installment: number
          proposal_id: string
        }
        Insert: {
          amount?: number
          due_date?: string | null
          id?: string
          installment: number
          proposal_id: string
        }
        Update: {
          amount?: number
          due_date?: string | null
          id?: string
          installment?: number
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_conditions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          gmail_refresh_token: string | null
          gmail_sender_email: string | null
          id: string
          is_cra: boolean
          phone: string | null
          sales_team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          gmail_refresh_token?: string | null
          gmail_sender_email?: string | null
          id?: string
          is_cra?: boolean
          phone?: string | null
          sales_team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          gmail_refresh_token?: string | null
          gmail_sender_email?: string | null
          id?: string
          is_cra?: boolean
          phone?: string | null
          sales_team_member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_sales_team"
            columns: ["sales_team_member_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
        ]
      }
      project_attachments: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          project_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          project_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          project_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scope_items: {
        Row: {
          description: string
          hours: number
          id: string
          included: boolean
          notes: string | null
          parent_id: string | null
          phase: number
          project_id: string
          sort_order: number
          template_id: string | null
        }
        Insert: {
          description: string
          hours?: number
          id?: string
          included?: boolean
          notes?: string | null
          parent_id?: string | null
          phase?: number
          project_id: string
          sort_order?: number
          template_id?: string | null
        }
        Update: {
          description?: string
          hours?: number
          id?: string
          included?: boolean
          notes?: string | null
          parent_id?: string | null
          phase?: number
          project_id?: string
          sort_order?: number
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_scope_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scope_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "scope_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          arquiteto_id: string | null
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          group_notes: Json | null
          id: string
          product: string
          proposal_id: string | null
          proposal_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          arquiteto_id?: string | null
          client_id: string
          created_at?: string
          created_by: string
          description?: string | null
          group_notes?: Json | null
          id?: string
          product?: string
          proposal_id?: string | null
          proposal_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          arquiteto_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          group_notes?: Json | null
          id?: string
          product?: string
          proposal_id?: string | null
          proposal_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_arquiteto_id_fkey"
            columns: ["arquiteto_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_defaults: {
        Row: {
          accomp_analyst_percentage: number
          accomp_gp_percentage: number
          additional_analyst_rate: number
          additional_gp_rate: number
          gp_percentage: number
          hourly_rate: number
          id: string
          travel_hourly_rate: number
          travel_local_hours: number
          travel_trip_hours: number
          updated_at: string
        }
        Insert: {
          accomp_analyst_percentage?: number
          accomp_gp_percentage?: number
          additional_analyst_rate?: number
          additional_gp_rate?: number
          gp_percentage?: number
          hourly_rate?: number
          id?: string
          travel_hourly_rate?: number
          travel_local_hours?: number
          travel_trip_hours?: number
          updated_at?: string
        }
        Update: {
          accomp_analyst_percentage?: number
          accomp_gp_percentage?: number
          additional_analyst_rate?: number
          additional_gp_rate?: number
          gp_percentage?: number
          hourly_rate?: number
          id?: string
          travel_hourly_rate?: number
          travel_local_hours?: number
          travel_trip_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_documents: {
        Row: {
          created_at: string
          created_by: string
          doc_id: string
          doc_type: string
          doc_url: string
          file_name: string
          id: string
          is_official: boolean
          proposal_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          doc_id: string
          doc_type?: string
          doc_url: string
          file_name: string
          id?: string
          is_official?: boolean
          proposal_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          doc_id?: string
          doc_type?: string
          doc_url?: string
          file_name?: string
          id?: string
          is_official?: boolean
          proposal_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_documents_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_macro_scope: {
        Row: {
          analyst_hours: number
          description: string | null
          gp_hours: number
          id: string
          phase: number
          proposal_id: string
          scope: string
          sort_order: number
        }
        Insert: {
          analyst_hours?: number
          description?: string | null
          gp_hours?: number
          id?: string
          phase?: number
          proposal_id: string
          scope: string
          sort_order?: number
        }
        Update: {
          analyst_hours?: number
          description?: string | null
          gp_hours?: number
          id?: string
          phase?: number
          proposal_id?: string
          scope?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_macro_scope_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_process_logs: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          error_code: string | null
          error_details: Json
          error_message: string | null
          id: string
          metadata: Json
          occurred_at: string
          payload: Json
          proposal_id: string | null
          proposal_number: string | null
          severity: string
          stage: string
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action?: string
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          payload?: Json
          proposal_id?: string | null
          proposal_number?: string | null
          severity?: string
          stage: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          payload?: Json
          proposal_id?: string | null
          proposal_number?: string | null
          severity?: string
          stage?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_process_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_process_logs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_scope_items: {
        Row: {
          description: string
          hours: number
          id: string
          included: boolean
          notes: string | null
          parent_id: string | null
          phase: number
          project_id: string | null
          proposal_id: string
          sort_order: number
          template_id: string | null
        }
        Insert: {
          description: string
          hours?: number
          id?: string
          included?: boolean
          notes?: string | null
          parent_id?: string | null
          phase?: number
          project_id?: string | null
          proposal_id: string
          sort_order?: number
          template_id?: string | null
        }
        Update: {
          description?: string
          hours?: number
          id?: string
          included?: boolean
          notes?: string | null
          parent_id?: string | null
          phase?: number
          project_id?: string | null
          proposal_id?: string
          sort_order?: number
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_scope_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_scope_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_scope_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "scope_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_signatories: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          role: string | null
          signature_id: string
          signed_at: string | null
          status: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          signature_id: string
          signed_at?: string | null
          status?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          signature_id?: string
          signed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_signatories_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_signatories_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "proposal_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_signatures: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          proposal_id: string
          sent_at: string
          sent_by: string
          status: string
          tae_document_id: string | null
          tae_publication_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proposal_id: string
          sent_at?: string
          sent_by: string
          status?: string
          tae_document_id?: string | null
          tae_publication_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proposal_id?: string
          sent_at?: string
          sent_by?: string
          status?: string
          tae_document_id?: string | null
          tae_publication_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_signatures_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_types: {
        Row: {
          allow_project: boolean
          allow_standalone_scope: boolean
          analyst_label: string
          created_at: string
          gp_label: string
          id: string
          mit_template_doc_id: string | null
          name: string
          require_project: boolean
          rounding_factor: number
          slug: string
          template_doc_id: string | null
          updated_at: string
        }
        Insert: {
          allow_project?: boolean
          allow_standalone_scope?: boolean
          analyst_label?: string
          created_at?: string
          gp_label?: string
          id?: string
          mit_template_doc_id?: string | null
          name: string
          require_project?: boolean
          rounding_factor?: number
          slug: string
          template_doc_id?: string | null
          updated_at?: string
        }
        Update: {
          allow_project?: boolean
          allow_standalone_scope?: boolean
          analyst_label?: string
          created_at?: string
          gp_label?: string
          id?: string
          mit_template_doc_id?: string | null
          name?: string
          require_project?: boolean
          rounding_factor?: number
          slug?: string
          template_doc_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          accomp_analyst: number
          accomp_gp: number
          additional_analyst_rate: number
          additional_gp_rate: number
          arquiteto_id: string | null
          client_id: string
          created_at: string
          created_by: string
          date_validity: string | null
          description: string | null
          esn_id: string | null
          expected_close_date: string | null
          gp_percentage: number
          group_notes: Json | null
          gsn_id: string | null
          hourly_rate: number
          id: string
          needs_regen: boolean
          negotiation: string | null
          num_companies: number
          number: string
          product: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          status: Database["public"]["Enums"]["proposal_status"]
          travel_hourly_rate: number
          travel_local_hours: number
          travel_trip_hours: number
          type: Database["public"]["Enums"]["proposal_type"]
          updated_at: string
        }
        Insert: {
          accomp_analyst?: number
          accomp_gp?: number
          additional_analyst_rate?: number
          additional_gp_rate?: number
          arquiteto_id?: string | null
          client_id: string
          created_at?: string
          created_by: string
          date_validity?: string | null
          description?: string | null
          esn_id?: string | null
          expected_close_date?: string | null
          gp_percentage?: number
          group_notes?: Json | null
          gsn_id?: string | null
          hourly_rate?: number
          id?: string
          needs_regen?: boolean
          negotiation?: string | null
          num_companies?: number
          number: string
          product: string
          scope_type?: Database["public"]["Enums"]["scope_type"]
          status?: Database["public"]["Enums"]["proposal_status"]
          travel_hourly_rate?: number
          travel_local_hours?: number
          travel_trip_hours?: number
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
        }
        Update: {
          accomp_analyst?: number
          accomp_gp?: number
          additional_analyst_rate?: number
          additional_gp_rate?: number
          arquiteto_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          date_validity?: string | null
          description?: string | null
          esn_id?: string | null
          expected_close_date?: string | null
          gp_percentage?: number
          group_notes?: Json | null
          gsn_id?: string | null
          hourly_rate?: number
          id?: string
          needs_regen?: boolean
          negotiation?: string | null
          num_companies?: number
          number?: string
          product?: string
          scope_type?: Database["public"]["Enums"]["scope_type"]
          status?: Database["public"]["Enums"]["proposal_status"]
          travel_hourly_rate?: number
          travel_local_hours?: number
          travel_trip_hours?: number
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_arquiteto_id_fkey"
            columns: ["arquiteto_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_esn_id_fkey"
            columns: ["esn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_gsn_id_fkey"
            columns: ["gsn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          amount: number
          created_at: string
          esn_id: string
          id: string
          month: number
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          esn_id: string
          id?: string
          month: number
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          esn_id?: string
          id?: string
          month?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_esn_id_fkey"
            columns: ["esn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_team: {
        Row: {
          code: string
          commission_pct: number
          created_at: string
          email: string | null
          id: string
          linked_gsn_id: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["sales_role"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          commission_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          linked_gsn_id?: string | null
          name: string
          phone?: string | null
          role: Database["public"]["Enums"]["sales_role"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          commission_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          linked_gsn_id?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["sales_role"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_team_linked_gsn_id_fkey"
            columns: ["linked_gsn_id"]
            isOneToOne: false
            referencedRelation: "sales_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_team_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit_info"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_template_items: {
        Row: {
          default_hours: number
          description: string
          id: string
          parent_id: string | null
          sort_order: number
          template_id: string
        }
        Insert: {
          default_hours?: number
          description: string
          id?: string
          parent_id?: string | null
          sort_order?: number
          template_id: string
        }
        Update: {
          default_hours?: number
          description?: string
          id?: string
          parent_id?: string | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_template_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "scope_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "scope_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_templates: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          product: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          product: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          product?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_log_events: {
        Row: {
          created_at: string
          curl_command: string | null
          duration_ms: number | null
          error_message: string | null
          http_status: number | null
          id: string
          page_number: number
          page_offset: number
          records_in_page: number | null
          response_preview: string | null
          sync_log_id: string
        }
        Insert: {
          created_at?: string
          curl_command?: string | null
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          page_number?: number
          page_offset?: number
          records_in_page?: number | null
          response_preview?: string | null
          sync_log_id: string
        }
        Update: {
          created_at?: string
          curl_command?: string | null
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          page_number?: number
          page_offset?: number
          records_in_page?: number | null
          response_preview?: string | null
          sync_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_events_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          current_offset: number | null
          error_message: string | null
          errors: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          inserted: number
          integration_id: string
          last_page_count: number | null
          page_size: number | null
          pages_processed: number | null
          records_fetched: number | null
          request_log: string | null
          started_at: string
          status: string
          total_records: number
          trigger_type: string
          updated: number
        }
        Insert: {
          current_offset?: number | null
          error_message?: string | null
          errors?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          inserted?: number
          integration_id: string
          last_page_count?: number | null
          page_size?: number | null
          pages_processed?: number | null
          records_fetched?: number | null
          request_log?: string | null
          started_at?: string
          status?: string
          total_records?: number
          trigger_type?: string
          updated?: number
        }
        Update: {
          current_offset?: number | null
          error_message?: string | null
          errors?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          inserted?: number
          integration_id?: string
          last_page_count?: number | null
          page_size?: number | null
          pages_processed?: number | null
          records_fetched?: number | null
          request_log?: string | null
          started_at?: string
          status?: string
          total_records?: number
          trigger_type?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "api_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tae_config: {
        Row: {
          application_id: string | null
          base_url: string
          company_cnpj: string | null
          environment: string
          id: string
          notes: string | null
          service_user_email: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          base_url?: string
          company_cnpj?: string | null
          environment?: string
          id?: string
          notes?: string | null
          service_user_email?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          base_url?: string
          company_cnpj?: string | null
          environment?: string
          id?: string
          notes?: string | null
          service_user_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      unit_contacts: {
        Row: {
          created_at: string
          department: string | null
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          role: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit_info"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_info: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          code: string | null
          contact: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_factor: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contact?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_factor?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          contact?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_factor?: number
          updated_at?: string
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
      user_unit_access: {
        Row: {
          created_at: string
          id: string
          unit_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unit_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unit_access_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit_info"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          ai_model: string
          ai_system_prompt: string | null
          enabled: boolean
          id: string
          max_context_messages: number
          twilio_phone_number: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          ai_model?: string
          ai_system_prompt?: string | null
          enabled?: boolean
          id?: string
          max_context_messages?: number
          twilio_phone_number?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          ai_model?: string
          ai_system_prompt?: string | null
          enabled?: boolean
          id?: string
          max_context_messages?: number
          twilio_phone_number?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          ai_response: string | null
          created_at: string
          direction: string
          id: string
          message_text: string
          phone_number: string
          twilio_sid: string | null
          user_id: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_text: string
          phone_number: string
          twilio_sid?: string | null
          user_id?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_text?: string
          phone_number?: string
          twilio_sid?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_proposal: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_client_esn: {
        Args: { _esn_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "arquiteto" | "gsn" | "consulta"
      proposal_status:
        | "pendente"
        | "proposta_gerada"
        | "em_analise_ev"
        | "analise_ev_concluida"
        | "em_assinatura"
        | "ganha"
        | "cancelada"
      proposal_type: "projeto" | "banco_de_horas"
      sales_role: "esn" | "gsn" | "arquiteto"
      scope_type: "detalhado" | "macro"
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
      app_role: ["admin", "vendedor", "arquiteto", "gsn", "consulta"],
      proposal_status: [
        "pendente",
        "proposta_gerada",
        "em_analise_ev",
        "analise_ev_concluida",
        "em_assinatura",
        "ganha",
        "cancelada",
      ],
      proposal_type: ["projeto", "banco_de_horas"],
      sales_role: ["esn", "gsn", "arquiteto"],
      scope_type: ["detalhado", "macro"],
    },
  },
} as const
