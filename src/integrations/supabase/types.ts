export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_name: string;
          created_at: string;
          description: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json;
          section: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_name?: string;
          created_at?: string;
          description?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          section: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_name?: string;
          created_at?: string;
          description?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          section?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      appointment_status_history: {
        Row: {
          appointment_id: string;
          changed_by: string | null;
          created_at: string;
          id: string;
          new_status: Database["public"]["Enums"]["appointment_status"];
          notes: string | null;
          old_status: Database["public"]["Enums"]["appointment_status"] | null;
        };
        Insert: {
          appointment_id: string;
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          new_status: Database["public"]["Enums"]["appointment_status"];
          notes?: string | null;
          old_status?: Database["public"]["Enums"]["appointment_status"] | null;
        };
        Update: {
          appointment_id?: string;
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          new_status?: Database["public"]["Enums"]["appointment_status"];
          notes?: string | null;
          old_status?: Database["public"]["Enums"]["appointment_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_status_history_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_date: string;
          appointment_number: string;
          completed_at: string | null;
          conversation_id: string | null;
          created_at: string;
          created_by: string | null;
          doctor_id: string | null;
          end_time: string;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          patient_id: string;
          price: number | null;
          service_id: string | null;
          source: Database["public"]["Enums"]["booking_source"];
          specialty_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          appointment_date: string;
          appointment_number: string;
          completed_at?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          doctor_id?: string | null;
          end_time: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          patient_id: string;
          price?: number | null;
          service_id?: string | null;
          source?: Database["public"]["Enums"]["booking_source"];
          specialty_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          appointment_date?: string;
          appointment_number?: string;
          completed_at?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          doctor_id?: string | null;
          end_time?: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          patient_id?: string;
          price?: number | null;
          service_id?: string | null;
          source?: Database["public"]["Enums"]["booking_source"];
          specialty_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      automation_logs: {
        Row: {
          appointment_id: string | null;
          created_at: string;
          error_message: string | null;
          event_type: string | null;
          execution_id: string | null;
          id: string;
          patient_id: string | null;
          request_payload: Json | null;
          response_payload: Json | null;
          status: string;
          workflow_name: string;
        };
        Insert: {
          appointment_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          event_type?: string | null;
          execution_id?: string | null;
          id?: string;
          patient_id?: string | null;
          request_payload?: Json | null;
          response_payload?: Json | null;
          status?: string;
          workflow_name: string;
        };
        Update: {
          appointment_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          event_type?: string | null;
          execution_id?: string | null;
          id?: string;
          patient_id?: string | null;
          request_payload?: Json | null;
          response_payload?: Json | null;
          status?: string;
          workflow_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_logs_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_form_submissions: {
        Row: {
          answers: Json;
          appointment_id: string | null;
          created_at: string;
          form_id: string | null;
          form_title: string;
          id: string;
          patient_id: string | null;
        };
        Insert: {
          answers?: Json;
          appointment_id?: string | null;
          created_at?: string;
          form_id?: string | null;
          form_title?: string;
          id?: string;
          patient_id?: string | null;
        };
        Update: {
          answers?: Json;
          appointment_id?: string | null;
          created_at?: string;
          form_id?: string | null;
          form_title?: string;
          id?: string;
          patient_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "booking_form_submissions_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "booking_forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_form_submissions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_forms: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          fields: Json;
          id: string;
          is_active: boolean;
          settings: Json;
          slug: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fields?: Json;
          id?: string;
          is_active?: boolean;
          settings?: Json;
          slug?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fields?: Json;
          id?: string;
          is_active?: boolean;
          settings?: Json;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chatbot_ai_credentials: {
        Row: {
          api_key: string;
          base_url: string | null;
          id: boolean;
          key_hint: string;
          models: Json;
          provider: string;
          updated_at: string;
          updated_by: string | null;
          verified_at: string;
        };
        Insert: {
          api_key: string;
          base_url?: string | null;
          id?: boolean;
          key_hint: string;
          models?: Json;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
          verified_at?: string;
        };
        Update: {
          api_key?: string;
          base_url?: string | null;
          id?: boolean;
          key_hint?: string;
          models?: Json;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
          verified_at?: string;
        };
        Relationships: [];
      };
      chatbot_knowledge: {
        Row: {
          answer: string;
          category: string;
          created_at: string;
          id: string;
          is_active: boolean;
          question: string;
          updated_at: string;
        };
        Insert: {
          answer: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          question: string;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          question?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chatbot_logs: {
        Row: {
          answer: string | null;
          created_at: string;
          id: string;
          question: string;
          session_id: string;
          source: string;
        };
        Insert: {
          answer?: string | null;
          created_at?: string;
          id?: string;
          question: string;
          session_id?: string;
          source?: string;
        };
        Update: {
          answer?: string | null;
          created_at?: string;
          id?: string;
          question?: string;
          session_id?: string;
          source?: string;
        };
        Relationships: [];
      };
      chatbot_settings: {
        Row: {
          ai_daily_limit: number;
          ai_instructions: string;
          ai_model: string;
          booking_form_id: string | null;
          bot_name: string;
          created_at: string;
          fallback_message: string;
          id: string;
          is_active: boolean;
          menu: Json;
          mode: string;
          slug: string;
          updated_at: string;
          welcome_message: string;
        };
        Insert: {
          ai_daily_limit?: number;
          ai_instructions?: string;
          ai_model?: string;
          booking_form_id?: string | null;
          bot_name?: string;
          created_at?: string;
          fallback_message?: string;
          id?: string;
          is_active?: boolean;
          menu?: Json;
          mode?: string;
          slug?: string;
          updated_at?: string;
          welcome_message?: string;
        };
        Update: {
          ai_daily_limit?: number;
          ai_instructions?: string;
          ai_model?: string;
          booking_form_id?: string | null;
          bot_name?: string;
          created_at?: string;
          fallback_message?: string;
          id?: string;
          is_active?: boolean;
          menu?: Json;
          mode?: string;
          slug?: string;
          updated_at?: string;
          welcome_message?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_settings_booking_form_id_fkey";
            columns: ["booking_form_id"];
            isOneToOne: false;
            referencedRelation: "booking_forms";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_usage: {
        Row: {
          ai_requests: number;
          day: string;
        };
        Insert: {
          ai_requests?: number;
          day: string;
        };
        Update: {
          ai_requests?: number;
          day?: string;
        };
        Relationships: [];
      };
      clinic_settings: {
        Row: {
          address: string | null;
          city: string | null;
          clinic_name: string;
          created_at: string;
          currency: string;
          email: string | null;
          id: string;
          logo_url: string | null;
          n8n_webhook_url: string | null;
          onboarding_completed: boolean;
          phone: string | null;
          timezone: string;
          updated_at: string;
          working_hours: Json;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          clinic_name?: string;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          n8n_webhook_url?: string | null;
          onboarding_completed?: boolean;
          phone?: string | null;
          timezone?: string;
          updated_at?: string;
          working_hours?: Json;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          clinic_name?: string;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          n8n_webhook_url?: string | null;
          onboarding_completed?: boolean;
          phone?: string | null;
          timezone?: string;
          updated_at?: string;
          working_hours?: Json;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          assigned_to: string | null;
          channel: string;
          created_at: string;
          external_conversation_id: string | null;
          handoff_reason: string | null;
          handoff_requested_at: string | null;
          handoff_resolved_at: string | null;
          id: string;
          last_message_at: string;
          last_message_preview: string | null;
          patient_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["conversation_status"];
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          channel?: string;
          created_at?: string;
          external_conversation_id?: string | null;
          handoff_reason?: string | null;
          handoff_requested_at?: string | null;
          handoff_resolved_at?: string | null;
          id?: string;
          last_message_at?: string;
          last_message_preview?: string | null;
          patient_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          channel?: string;
          created_at?: string;
          external_conversation_id?: string | null;
          handoff_reason?: string | null;
          handoff_requested_at?: string | null;
          handoff_resolved_at?: string | null;
          id?: string;
          last_message_at?: string;
          last_message_preview?: string | null;
          patient_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      doctor_schedules: {
        Row: {
          break_end: string | null;
          break_start: string | null;
          created_at: string;
          day_of_week: number;
          doctor_id: string;
          end_time: string;
          id: string;
          is_active: boolean;
          start_time: string;
          updated_at: string;
        };
        Insert: {
          break_end?: string | null;
          break_start?: string | null;
          created_at?: string;
          day_of_week: number;
          doctor_id: string;
          end_time?: string;
          id?: string;
          is_active?: boolean;
          start_time?: string;
          updated_at?: string;
        };
        Update: {
          break_end?: string | null;
          break_start?: string | null;
          created_at?: string;
          day_of_week?: number;
          doctor_id?: string;
          end_time?: string;
          id?: string;
          is_active?: boolean;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_schedules_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
        ];
      };
      doctor_specialties: {
        Row: {
          created_at: string;
          doctor_id: string;
          specialty_id: string;
        };
        Insert: {
          created_at?: string;
          doctor_id: string;
          specialty_id: string;
        };
        Update: {
          created_at?: string;
          doctor_id?: string;
          specialty_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_specialties_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_specialties_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      doctors: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          email: string | null;
          hide_name: boolean;
          id: string;
          name: string;
          phone: string | null;
          specialty_id: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          hide_name?: boolean;
          id?: string;
          name: string;
          phone?: string | null;
          specialty_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          hide_name?: boolean;
          id?: string;
          name?: string;
          phone?: string | null;
          specialty_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_events: {
        Row: {
          attempts: number;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          error_message: string | null;
          event_type: string;
          id: string;
          idempotency_key: string | null;
          payload: Json;
          processed_at: string | null;
          status: Database["public"]["Enums"]["event_status"];
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          error_message?: string | null;
          event_type: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
        };
        Update: {
          attempts?: number;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string | null;
          conversation_id: string;
          created_at: string;
          direction: Database["public"]["Enums"]["message_direction"];
          external_message_id: string | null;
          id: string;
          message_type: Database["public"]["Enums"]["message_type"];
          metadata: Json;
          patient_id: string | null;
          sender_type: Database["public"]["Enums"]["sender_type"];
          status: string;
        };
        Insert: {
          content?: string | null;
          conversation_id: string;
          created_at?: string;
          direction: Database["public"]["Enums"]["message_direction"];
          external_message_id?: string | null;
          id?: string;
          message_type?: Database["public"]["Enums"]["message_type"];
          metadata?: Json;
          patient_id?: string | null;
          sender_type?: Database["public"]["Enums"]["sender_type"];
          status?: string;
        };
        Update: {
          content?: string | null;
          conversation_id?: string;
          created_at?: string;
          direction?: Database["public"]["Enums"]["message_direction"];
          external_message_id?: string | null;
          id?: string;
          message_type?: Database["public"]["Enums"]["message_type"];
          metadata?: Json;
          patient_id?: string | null;
          sender_type?: Database["public"]["Enums"]["sender_type"];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          is_read: boolean;
          message: string | null;
          title: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          title: string;
          type: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [];
      };
      patients: {
        Row: {
          address: string | null;
          city: string | null;
          created_at: string;
          date_of_birth: string | null;
          district: string | null;
          email: string | null;
          first_contact_at: string;
          full_name: string;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          last_contact_at: string;
          normalized_phone: string;
          notes: string | null;
          phone: string;
          source: Database["public"]["Enums"]["booking_source"];
          updated_at: string;
          whatsapp_number: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          district?: string | null;
          email?: string | null;
          first_contact_at?: string;
          full_name: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          last_contact_at?: string;
          normalized_phone: string;
          notes?: string | null;
          phone: string;
          source?: Database["public"]["Enums"]["booking_source"];
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          district?: string | null;
          email?: string | null;
          first_contact_at?: string;
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          last_contact_at?: string;
          normalized_phone?: string;
          notes?: string | null;
          phone?: string;
          source?: Database["public"]["Enums"]["booking_source"];
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          name: string;
          price_from: boolean;
          price: number;
          specialty_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name: string;
          price_from?: boolean;
          price?: number;
          specialty_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          price_from?: boolean;
          price?: number;
          specialty_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      specialties: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_permissions: {
        Row: {
          created_at: string;
          sections: Json;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          sections?: Json;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          sections?: Json;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
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
      booking_form_stats: {
        Row: {
          form_id: string | null;
          last_submission_at: string | null;
          submissions: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "booking_form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "booking_forms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      booking_form_allows_service: {
        Args: { _service: string; _settings: Json; _specialty: string };
        Returns: boolean;
      };
      booking_form_allows_specialty: {
        Args: { _settings: Json; _specialty: string };
        Returns: boolean;
      };
      booking_form_confirmation: {
        Args: { _appointment_id: string; _duplicate: boolean; _message: string };
        Returns: Json;
      };
      booking_form_doctor_ids: {
        Args: { _doctor: string; _settings: Json; _specialty: string };
        Returns: string[];
      };
      booking_form_id_list: { Args: { _key: string; _settings: Json }; Returns: Json };
      booking_form_window: { Args: { _settings: Json }; Returns: number };
      can_write: { Args: never; Returns: boolean };
      consume_chatbot_ai_quota: { Args: { _slug: string }; Returns: Json };
      get_public_booking_availability: {
        Args: { _doctor_id?: string; _service_id?: string; _slug: string; _specialty_id?: string };
        Returns: { day: string; slot_time: string }[];
      };
      get_public_booking_form: { Args: { _slug: string }; Returns: Json };
      get_public_chatbot: { Args: { _slug: string }; Returns: Json };
      claim_conversation: { Args: { _conversation_id: string }; Returns: undefined };
      log_activity: {
        Args: {
          _action: string;
          _description?: string;
          _entity_id?: string;
          _entity_type?: string;
          _metadata?: Json;
          _section: string;
        };
        Returns: string;
      };
      emit_event: {
        Args: {
          _entity_id: string;
          _entity_type: string;
          _payload: Json;
          _type: string;
        };
        Returns: string;
      };
      get_available_slots: {
        Args: { _date: string; _doctor_id: string; _duration?: number };
        Returns: {
          slot_time: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      handoff_event_payload: { Args: { _conversation_id: string }; Returns: Json };
      is_admin: { Args: never; Returns: boolean };
      get_chatbot_ai_key_info: { Args: never; Returns: Json };
      set_chatbot_ai_key: {
        Args: {
          _provider: string;
          _key: string;
          _models: Json;
          _base_url?: string | null;
          _default_model?: string | null;
        };
        Returns: Json;
      };
      set_chatbot_ai_models: {
        Args: { _models: Json; _default_model?: string | null };
        Returns: Json;
      };
      clear_chatbot_ai_key: { Args: never; Returns: Json };
      chatbot_ai_available: { Args: never; Returns: boolean };
      chatbot_ai_ask: {
        Args: { _messages: Json; _site_url?: string; _slug: string };
        Returns: Json;
      };
      chatbot_ai_poll: { Args: { _token: string }; Returns: Json };
      chatbot_ai_models_start: { Args: never; Returns: Json };
      log_chatbot_exchange: {
        Args: {
          _answer: string;
          _question: string;
          _session: string;
          _slug: string;
          _source: string;
        };
        Returns: undefined;
      };
      normalize_sa_phone: { Args: { p: string }; Returns: string };
      release_to_bot: { Args: { _conversation_id: string }; Returns: boolean };
      request_human_handoff: {
        Args: { _conversation_id: string; _reason?: string };
        Returns: boolean;
      };
      save_doctor: {
        Args: { _doctor_id: string | null; _payload: Json };
        Returns: string;
      };
      send_human_reply: {
        Args: { _content: string; _conversation_id: string };
        Returns: string;
      };
      submit_public_booking: { Args: { _payload: Json; _slug: string }; Returns: Json };
    };
    Enums: {
      app_role: "owner" | "admin" | "receptionist" | "doctor" | "viewer";
      appointment_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled";
      booking_source: "whatsapp" | "website" | "phone" | "manual" | "referral";
      conversation_status:
        "active" | "waiting_patient" | "human_support" | "appointment_created" | "closed";
      event_status: "pending" | "processing" | "delivered" | "failed";
      gender_type: "male" | "female";
      message_direction: "inbound" | "outbound";
      message_type: "text" | "image" | "audio" | "document" | "location" | "interactive";
      sender_type: "patient" | "ai" | "human" | "system";
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
      app_role: ["owner", "admin", "receptionist", "doctor", "viewer"],
      appointment_status: [
        "pending",
        "confirmed",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      booking_source: ["whatsapp", "website", "phone", "manual", "referral"],
      conversation_status: [
        "active",
        "waiting_patient",
        "human_support",
        "appointment_created",
        "closed",
      ],
      event_status: ["pending", "processing", "delivered", "failed"],
      gender_type: ["male", "female"],
      message_direction: ["inbound", "outbound"],
      message_type: ["text", "image", "audio", "document", "location", "interactive"],
      sender_type: ["patient", "ai", "human", "system"],
    },
  },
} as const;
