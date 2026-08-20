export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_guide_conversations: {
        Row: {
          ai_answer: string | null;
          clicked_source_id: string | null;
          created_at: string;
          id: string;
          recommended_source_ids: string[];
          session_id: string;
          user_message: string;
        };
        Insert: {
          ai_answer?: string | null;
          clicked_source_id?: string | null;
          created_at?: string;
          id?: string;
          recommended_source_ids?: string[];
          session_id: string;
          user_message: string;
        };
        Update: {
          ai_answer?: string | null;
          clicked_source_id?: string | null;
          created_at?: string;
          id?: string;
          recommended_source_ids?: string[];
          session_id?: string;
          user_message?: string;
        };
        Relationships: [];
      };
      ai_guide_sources: {
        Row: {
          category: string | null;
          created_at: string;
          currency: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          merchant_name: string | null;
          price: number | null;
          priority: number;
          tags: string[];
          target_url: string | null;
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_name?: string | null;
          price?: number | null;
          priority?: number;
          tags?: string[];
          target_url?: string | null;
          title: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_name?: string | null;
          price?: number | null;
          priority?: number;
          tags?: string[];
          target_url?: string | null;
          title?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      buyna_customers: {
        Row: {
          company_address: string | null;
          company_name: string;
          contact_name: string;
          country: string | null;
          created_at: string;
          email: string;
          id: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          company_address?: string | null;
          company_name: string;
          contact_name: string;
          country?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          company_address?: string | null;
          company_name?: string;
          contact_name?: string;
          country?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      buyna_subscription_charges: {
        Row: {
          amount: number;
          billing_period_end: string | null;
          billing_period_start: string | null;
          charge_id: string;
          created_at: string;
          currency: string;
          failed_at: string | null;
          id: string;
          paid_at: string | null;
          provider_order_id: string | null;
          provider_response: Json | null;
          status: string;
          subscription_id: string;
        };
        Insert: {
          amount: number;
          billing_period_end?: string | null;
          billing_period_start?: string | null;
          charge_id: string;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          id?: string;
          paid_at?: string | null;
          provider_order_id?: string | null;
          provider_response?: Json | null;
          status?: string;
          subscription_id: string;
        };
        Update: {
          amount?: number;
          billing_period_end?: string | null;
          billing_period_start?: string | null;
          charge_id?: string;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          id?: string;
          paid_at?: string | null;
          provider_order_id?: string | null;
          provider_response?: Json | null;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buyna_subscription_charges_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "buyna_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      buyna_subscriptions: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          currency: string;
          current_period_end: string | null;
          current_period_start: string | null;
          customer_id: string;
          id: string;
          locked_monthly_amount: number;
          merchant_agreement_id: string | null;
          next_billing_date: string | null;
          plan_code: string;
          plan_id: string | null;
          platform_agreement_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          customer_id: string;
          id?: string;
          locked_monthly_amount: number;
          merchant_agreement_id?: string | null;
          next_billing_date?: string | null;
          plan_code: string;
          plan_id?: string | null;
          platform_agreement_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          customer_id?: string;
          id?: string;
          locked_monthly_amount?: number;
          merchant_agreement_id?: string | null;
          next_billing_date?: string | null;
          plan_code?: string;
          plan_id?: string | null;
          platform_agreement_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buyna_subscriptions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "buyna_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buyna_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      globepay_recurring_agreements: {
        Row: {
          created_at: string;
          id: string;
          merchant_agreement_id: string;
          platform_agreement_id: string | null;
          raw_response: Json | null;
          status: string | null;
          subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          merchant_agreement_id: string;
          platform_agreement_id?: string | null;
          raw_response?: Json | null;
          status?: string | null;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merchant_agreement_id?: string;
          platform_agreement_id?: string | null;
          raw_response?: Json | null;
          status?: string | null;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "globepay_recurring_agreements_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "buyna_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      merchant_company_profiles: {
        Row: {
          address: string | null;
          company_name: string;
          contact_name: string;
          country: string | null;
          created_at: string;
          email: string;
          id: string;
          industry: string | null;
          merchant_id: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          address?: string | null;
          company_name: string;
          contact_name: string;
          country?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          industry?: string | null;
          merchant_id: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          address?: string | null;
          company_name?: string;
          contact_name?: string;
          country?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          industry?: string | null;
          merchant_id?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "merchant_company_profiles_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: true;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      merchant_subscriptions: {
        Row: {
          auto_renew: boolean;
          cancelled_at: string | null;
          checkout_url: string | null;
          created_at: string;
          currency: string;
          current_period_end: string | null;
          id: string;
          merchant_id: string;
          monthly_fee: number;
          next_billing_at: string | null;
          plan_code: string;
          plan_id: string;
          provider: string;
          provider_agreement_id: string | null;
          started_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          auto_renew?: boolean;
          cancelled_at?: string | null;
          checkout_url?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          id?: string;
          merchant_id: string;
          monthly_fee: number;
          next_billing_at?: string | null;
          plan_code: string;
          plan_id: string;
          provider?: string;
          provider_agreement_id?: string | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          auto_renew?: boolean;
          cancelled_at?: string | null;
          checkout_url?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          id?: string;
          merchant_id?: string;
          monthly_fee?: number;
          next_billing_at?: string | null;
          plan_code?: string;
          plan_id?: string;
          provider?: string;
          provider_agreement_id?: string | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "merchant_subscriptions_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "merchant_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      merchants: {
        Row: {
          area: string;
          contact_name: string;
          country: string;
          created_at: string;
          email: string;
          id: string;
          industry: string;
          notes: string;
          phone: string;
          shop_name: string;
          status: string;
          updated_at: string;
          website_url: string;
        };
        Insert: {
          area?: string;
          contact_name?: string;
          country?: string;
          created_at?: string;
          email?: string;
          id: string;
          industry?: string;
          notes?: string;
          phone?: string;
          shop_name?: string;
          status?: string;
          updated_at?: string;
          website_url?: string;
        };
        Update: {
          area?: string;
          contact_name?: string;
          country?: string;
          created_at?: string;
          email?: string;
          id?: string;
          industry?: string;
          notes?: string;
          phone?: string;
          shop_name?: string;
          status?: string;
          updated_at?: string;
          website_url?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          amount: number | null;
          created_at: string;
          currency: string | null;
          event_type: string;
          id: string;
          merchant_subscription_id: string;
          provider: string;
          provider_event_id: string | null;
          raw_payload: Json | null;
          status: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          event_type: string;
          id?: string;
          merchant_subscription_id: string;
          provider?: string;
          provider_event_id?: string | null;
          raw_payload?: Json | null;
          status: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          event_type?: string;
          id?: string;
          merchant_subscription_id?: string;
          provider?: string;
          provider_event_id?: string | null;
          raw_payload?: Json | null;
          status?: string;
        };
        Relationships: [];
      };
      recurring_charge_records: {
        Row: {
          amount: number;
          attempt_id: string | null;
          created_at: string;
          currency: string;
          failed_at: string | null;
          failure_reason: string | null;
          id: string;
          merchant_id: string;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          status: string;
          subscription_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          attempt_id?: string | null;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          merchant_id: string;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          status?: string;
          subscription_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          attempt_id?: string | null;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          merchant_id?: string;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          status?: string;
          subscription_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_charge_records_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "subscription_payment_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_charge_records_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_charge_records_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "merchant_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_payment_attempts: {
        Row: {
          amount: number;
          created_at: string;
          currency: string;
          endpoint: string | null;
          failed_at: string | null;
          failure_reason: string | null;
          id: string;
          merchant_id: string;
          paid_at: string | null;
          provider: string;
          provider_order_id: string;
          purpose: string;
          raw_request: Json | null;
          raw_response: Json | null;
          status: string;
          subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          currency?: string;
          endpoint?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          merchant_id: string;
          paid_at?: string | null;
          provider?: string;
          provider_order_id: string;
          purpose: string;
          raw_request?: Json | null;
          raw_response?: Json | null;
          status?: string;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          currency?: string;
          endpoint?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          merchant_id?: string;
          paid_at?: string | null;
          provider?: string;
          provider_order_id?: string;
          purpose?: string;
          raw_request?: Json | null;
          raw_response?: Json | null;
          status?: string;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payment_attempts_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payment_attempts_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "merchant_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_plans: {
        Row: {
          code: string;
          created_at: string;
          currency: string;
          description: string;
          display_original_monthly_fee: number | null;
          id: string;
          is_active: boolean;
          monthly_fee: number;
          name: string;
          promotional_monthly_fee: number | null;
          promotional_months: number;
          setup_fee: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          currency?: string;
          description?: string;
          display_original_monthly_fee?: number | null;
          id?: string;
          is_active?: boolean;
          monthly_fee?: number;
          name: string;
          promotional_monthly_fee?: number | null;
          promotional_months?: number;
          setup_fee?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string;
          display_original_monthly_fee?: number | null;
          id?: string;
          is_active?: boolean;
          monthly_fee?: number;
          name?: string;
          promotional_monthly_fee?: number | null;
          promotional_months?: number;
          setup_fee?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "merchant";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "merchant"],
    },
  },
} as const;
