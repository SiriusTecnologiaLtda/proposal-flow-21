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
          created_at: string
          display_name: string
          email: string | null
          id: string
          sales_team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          sales_team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
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
      proposal_defaults: {
        Row: {
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
      proposal_scope_items: {
        Row: {
          description: string
          hours: number
          id: string
          included: boolean
          notes: string | null
          parent_id: string | null
          phase: number
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
          gp_percentage: number
          gsn_id: string | null
          hourly_rate: number
          id: string
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
          gp_percentage?: number
          gsn_id?: string | null
          hourly_rate?: number
          id?: string
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
          gp_percentage?: number
          gsn_id?: string | null
          hourly_rate?: number
          id?: string
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
      sales_team: {
        Row: {
          code: string
          created_at: string
          email: string | null
          id: string
          linked_gsn_id: string | null
          name: string
          role: Database["public"]["Enums"]["sales_role"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          id?: string
          linked_gsn_id?: string | null
          name: string
          role: Database["public"]["Enums"]["sales_role"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          linked_gsn_id?: string | null
          name?: string
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
      unit_info: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "arquiteto" | "gsn"
      proposal_status:
        | "rascunho"
        | "em_revisao"
        | "aprovada"
        | "enviada"
        | "cancelada"
        | "ganha"
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
      app_role: ["admin", "vendedor", "arquiteto", "gsn"],
      proposal_status: [
        "rascunho",
        "em_revisao",
        "aprovada",
        "enviada",
        "cancelada",
        "ganha",
      ],
      proposal_type: ["projeto", "banco_de_horas"],
      sales_role: ["esn", "gsn", "arquiteto"],
      scope_type: ["detalhado", "macro"],
    },
  },
} as const
