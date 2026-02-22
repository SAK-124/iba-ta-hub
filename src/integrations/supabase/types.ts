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
          created_at: string
          id: string
          roster_verification_enabled: boolean
          tickets_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          roster_verification_enabled?: boolean
          tickets_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          roster_verification_enabled?: boolean
          tickets_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          erp: string
          id: string
          naming_penalty: boolean
          session_id: string
          status: string
        }
        Insert: {
          created_at?: string
          erp: string
          id?: string
          naming_penalty?: boolean
          session_id: string
          status?: string
        }
        Update: {
          created_at?: string
          erp?: string
          id?: string
          naming_penalty?: boolean
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_erp_fkey"
            columns: ["erp"]
            isOneToOne: false
            referencedRelation: "students_roster"
            referencedColumns: ["erp"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      late_day_adjustments: {
        Row: {
          created_at: string
          created_by_email: string
          days_delta: number
          id: string
          reason: string | null
          student_erp: string
        }
        Insert: {
          created_at?: string
          created_by_email: string
          days_delta: number
          id?: string
          reason?: string | null
          student_erp: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          days_delta?: number
          id?: string
          reason?: string | null
          student_erp?: string
        }
        Relationships: []
      }
      late_day_assignments: {
        Row: {
          active: boolean
          created_at: string
          due_at: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          due_at?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          due_at?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      late_day_claims: {
        Row: {
          assignment_id: string
          claimed_at: string
          created_at: string
          days_used: number
          due_at_after_claim: string
          due_at_before_claim: string
          id: string
          student_email: string
          student_erp: string
        }
        Insert: {
          assignment_id: string
          claimed_at?: string
          created_at?: string
          days_used: number
          due_at_after_claim: string
          due_at_before_claim: string
          id?: string
          student_email: string
          student_erp: string
        }
        Update: {
          assignment_id?: string
          claimed_at?: string
          created_at?: string
          days_used?: number
          due_at_after_claim?: string
          due_at_before_claim?: string
          id?: string
          student_email?: string
          student_erp?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_day_claims_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "late_day_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          time_window_hours: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          time_window_hours?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          time_window_hours?: number
        }
        Relationships: []
      }
      rule_exceptions: {
        Row: {
          active: boolean | null
          assigned_day: string | null
          class_no: string | null
          created_at: string | null
          erp: string
          id: string
          issue_type: string | null
          notes: string | null
          student_name: string | null
        }
        Insert: {
          active?: boolean | null
          assigned_day?: string | null
          class_no?: string | null
          created_at?: string | null
          erp: string
          id?: string
          issue_type?: string | null
          notes?: string | null
          student_name?: string | null
        }
        Update: {
          active?: boolean | null
          assigned_day?: string | null
          class_no?: string | null
          created_at?: string | null
          erp?: string
          id?: string
          issue_type?: string | null
          notes?: string | null
          student_name?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          day_of_week: string
          end_time: string | null
          id: string
          session_date: string
          session_number: number
        }
        Insert: {
          created_at?: string
          day_of_week: string
          end_time?: string | null
          id?: string
          session_date: string
          session_number: number
        }
        Update: {
          created_at?: string
          day_of_week?: string
          end_time?: string | null
          id?: string
          session_date?: string
          session_number?: number
        }
        Relationships: []
      }
      students_roster: {
        Row: {
          class_no: string
          created_at: string
          erp: string
          id: string
          student_name: string
        }
        Insert: {
          class_no: string
          created_at?: string
          erp: string
          id?: string
          student_name: string
        }
        Update: {
          class_no?: string
          created_at?: string
          erp?: string
          id?: string
          student_name?: string
        }
        Relationships: []
      }
      submissions_list: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      ta_allowlist: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          initial_password: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          initial_password?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          initial_password?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          category: string
          created_at: string
          created_by_email: string
          details_json: Json | null
          details_text: string | null
          entered_erp: string
          group_type: string
          id: string
          roster_class_no: string | null
          roster_name: string | null
          status: string
          subcategory: string | null
          ta_response: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by_email: string
          details_json?: Json | null
          details_text?: string | null
          entered_erp: string
          group_type: string
          id?: string
          roster_class_no?: string | null
          roster_name?: string | null
          status?: string
          subcategory?: string | null
          ta_response?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_email?: string
          details_json?: Json | null
          details_text?: string | null
          entered_erp?: string
          group_type?: string
          id?: string
          roster_class_no?: string | null
          roster_name?: string | null
          status?: string
          subcategory?: string | null
          ta_response?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_roster: { Args: { check_erp: string }; Returns: Json }
      check_ta_allowlist: { Args: { check_email: string }; Returns: boolean }
      claim_late_days: {
        Args: { p_assignment_id: string; p_days: number }
        Returns: Json
      }
      get_public_attendance_board: { Args: never; Returns: Json }
      get_student_attendance: { Args: { student_erp: string }; Returns: Json }
      is_ta: { Args: { user_email: string }; Returns: boolean }
      ta_add_late_day: {
        Args: { p_days: number; p_reason?: string; p_student_erp: string }
        Returns: Json
      }
      verify_ta_setup: {
        Args: { check_email: string; check_password: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
