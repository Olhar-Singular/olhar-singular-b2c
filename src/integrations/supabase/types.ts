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
      adaptations: {
        Row: {
          barrier_profile_id: string | null
          content: Json
          created_at: string
          credits_spent: number
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barrier_profile_id?: string | null
          content?: Json
          created_at?: string
          credits_spent?: number
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          barrier_profile_id?: string | null
          content?: Json
          created_at?: string
          credits_spent?: number
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adaptations_barrier_profile_id_fkey"
            columns: ["barrier_profile_id"]
            isOneToOne: false
            referencedRelation: "barrier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_pricing: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          model: string
          price_input_per_million: number
          price_output_per_million: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          model: string
          price_input_per_million?: number
          price_output_per_million?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string
          price_input_per_million?: number
          price_output_per_million?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          action_type: string
          cost_input: number | null
          cost_output: number | null
          cost_total: number | null
          created_at: string
          endpoint: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string
          output_tokens: number | null
          request_duration_ms: number | null
          school_id: string | null
          status: string
          tokens_source: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          cost_input?: number | null
          cost_output?: number | null
          cost_total?: number | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model: string
          output_tokens?: number | null
          request_duration_ms?: number | null
          school_id?: string | null
          status?: string
          tokens_source?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          cost_input?: number | null
          cost_output?: number | null
          cost_total?: number | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string
          output_tokens?: number | null
          request_duration_ms?: number | null
          school_id?: string | null
          status?: string
          tokens_source?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      barrier_profiles: {
        Row: {
          barriers: string[]
          created_at: string
          id: string
          observation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barriers?: string[]
          created_at?: string
          id?: string
          observation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barriers?: string[]
          created_at?: string
          id?: string
          observation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_purchases: {
        Row: {
          amount_brl: number
          created_at: string
          credits_granted: number
          id: string
          payment_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_brl: number
          created_at?: string
          credits_granted: number
          id?: string
          payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_brl?: number
          created_at?: string
          credits_granted?: number
          id?: string
          payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          payment_id: string | null
          ref_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          payment_id?: string | null
          ref_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          payment_id?: string | null
          ref_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pdf_uploads: {
        Row: {
          credits_spent: number | null
          description: string | null
          file_name: string
          file_path: string
          id: string
          questions_extracted: number | null
          uploaded_at: string | null
          user_id: string
          was_free: boolean | null
        }
        Insert: {
          credits_spent?: number | null
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          questions_extracted?: number | null
          uploaded_at?: string | null
          user_id: string
          was_free?: boolean | null
        }
        Update: {
          credits_spent?: number | null
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          questions_extracted?: number | null
          uploaded_at?: string | null
          user_id?: string
          was_free?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credit_balance: number
          free_adaptation_used: boolean
          free_extraction_used: boolean
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_balance?: number
          free_adaptation_used?: boolean
          free_extraction_used?: boolean
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_balance?: number
          free_adaptation_used?: boolean
          free_extraction_used?: boolean
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          correct_answer: number | null
          created_at: string | null
          created_by: string
          difficulty: string | null
          figure_description: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          options: Json | null
          resolution: string | null
          source: string | null
          source_file_name: string | null
          subject: string
          text: string
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          correct_answer?: number | null
          created_at?: string | null
          created_by: string
          difficulty?: string | null
          figure_description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          options?: Json | null
          resolution?: string | null
          source?: string | null
          source_file_name?: string | null
          subject: string
          text: string
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          correct_answer?: number | null
          created_at?: string | null
          created_by?: string
          difficulty?: string | null
          figure_description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          options?: Json | null
          resolution?: string | null
          source?: string | null
          source_file_name?: string | null
          subject?: string
          text?: string
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deduct_credits: {
        Args: {
          p_amount: number
          p_ref_id?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      get_user_school_id: { Args: { _user_id: string }; Returns: string }
      grant_credits: {
        Args: {
          p_amount: number
          p_payment_id?: string
          p_ref_id?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
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
