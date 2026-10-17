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
      account_links: {
        Row: {
          alias_user_id: string
          canonical_user_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          previous_status: string | null
          relationship: string | null
        }
        Insert: {
          alias_user_id: string
          canonical_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          previous_status?: string | null
          relationship?: string | null
        }
        Update: {
          alias_user_id?: string
          canonical_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          previous_status?: string | null
          relationship?: string | null
        }
        Relationships: []
      }
      account_merge_log: {
        Row: {
          action: string
          created_at: string
          id: string
          moved: Json
          performed_by: string | null
          relationship: string | null
          source_user_id: string
          target_user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          moved?: Json
          performed_by?: string | null
          relationship?: string | null
          source_user_id: string
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          moved?: Json
          performed_by?: string | null
          relationship?: string | null
          source_user_id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          device_type: string | null
          event_name: string | null
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          page_title: string | null
          path: string | null
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          event_name?: string | null
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          page_title?: string | null
          path?: string | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          event_name?: string | null
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          page_title?: string | null
          path?: string | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      analytics_sessions: {
        Row: {
          created_at: string
          device_type: string | null
          duration_seconds: number
          first_path: string | null
          last_path: string | null
          last_seen_at: string
          page_count: number
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          duration_seconds?: number
          first_path?: string | null
          last_path?: string | null
          last_seen_at?: string
          page_count?: number
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          duration_seconds?: number
          first_path?: string | null
          last_path?: string | null
          last_seen_at?: string
          page_count?: number
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      approved_intakes: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          files: Json | null
          id: string
          intake_submission_id: string | null
          pdf_path: string | null
          snapshot_json: Json
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          files?: Json | null
          id?: string
          intake_submission_id?: string | null
          pdf_path?: string | null
          snapshot_json: Json
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          files?: Json | null
          id?: string
          intake_submission_id?: string | null
          pdf_path?: string | null
          snapshot_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approved_intakes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approved_intakes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          city: string | null
          converted_at: string | null
          converted_by: string | null
          converted_profile_id: string | null
          created_at: string
          dropoff_address: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          message: string | null
          permit_attachment_name: string | null
          permit_attachment_path: string | null
          phone: string
          pickup_address: string | null
          status: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          city?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_profile_id?: string | null
          created_at?: string
          dropoff_address?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          id?: string
          message?: string | null
          permit_attachment_name?: string | null
          permit_attachment_path?: string | null
          phone: string
          pickup_address?: string | null
          status?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          city?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_profile_id?: string | null
          created_at?: string
          dropoff_address?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          message?: string | null
          permit_attachment_name?: string | null
          permit_attachment_path?: string | null
          phone?: string
          pickup_address?: string | null
          status?: string | null
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
      game_feedback: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          message: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      game_leaderboard_entries: {
        Row: {
          created_at: string
          day: string | null
          id: string
          level_id: string
          mode: string
          player_name: string
          rank_tier: string | null
          score: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          day?: string | null
          id?: string
          level_id: string
          mode: string
          player_name: string
          rank_tier?: string | null
          score: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          day?: string | null
          id?: string
          level_id?: string
          mode?: string
          player_name?: string
          rank_tier?: string | null
          score?: number
          user_id?: string | null
        }
        Relationships: []
      }
      game_match_players: {
        Row: {
          color: string
          display_name: string | null
          joined_at: string
          match_id: string
          stars: number
          user_id: string
        }
        Insert: {
          color?: string
          display_name?: string | null
          joined_at?: string
          match_id: string
          stars?: number
          user_id: string
        }
        Update: {
          color?: string
          display_name?: string | null
          joined_at?: string
          match_id?: string
          stars?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "game_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      game_matches: {
        Row: {
          code: string
          created_at: string
          duration_s: number
          host_id: string
          id: string
          seed: number
          started_at: string | null
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          duration_s?: number
          host_id: string
          id?: string
          seed: number
          started_at?: string | null
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          duration_s?: number
          host_id?: string
          id?: string
          seed?: number
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      game_plays: {
        Row: {
          created_at: string
          difficulty: string
          distance: number | null
          grade: string | null
          id: string
          level_id: string
          score: number
          stars: number
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty: string
          distance?: number | null
          grade?: string | null
          id?: string
          level_id: string
          score?: number
          stars?: number
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          distance?: number | null
          grade?: string | null
          id?: string
          level_id?: string
          score?: number
          stars?: number
          user_id?: string
        }
        Relationships: []
      }
      game_scores: {
        Row: {
          difficulty: string
          display_name: string | null
          distance: number | null
          grade: string
          id: string
          level_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          difficulty?: string
          display_name?: string | null
          distance?: number | null
          grade: string
          id?: string
          level_id: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          difficulty?: string
          display_name?: string | null
          distance?: number | null
          grade?: string
          id?: string
          level_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      guest_scores: {
        Row: {
          created_at: string
          difficulty: string
          display_name: string
          distance: number | null
          email: string | null
          grade: string
          id: string
          level_id: string
          score: number
        }
        Insert: {
          created_at?: string
          difficulty: string
          display_name: string
          distance?: number | null
          email?: string | null
          grade: string
          id?: string
          level_id: string
          score: number
        }
        Update: {
          created_at?: string
          difficulty?: string
          display_name?: string
          distance?: number | null
          email?: string | null
          grade?: string
          id?: string
          level_id?: string
          score?: number
        }
        Relationships: []
      }
      health_issues: {
        Row: {
          affected_entity_id: string | null
          affected_entity_type: string | null
          category: string
          check_key: string
          created_at: string
          description: string
          fix_action: string | null
          fix_payload: Json | null
          fixable: boolean
          fixed_at: string | null
          fixed_by: string | null
          id: string
          report_id: string | null
          scan_id: string | null
          session_id: string | null
          severity: string
          student_id: string | null
          student_name: string | null
          suggested_fix: string | null
        }
        Insert: {
          affected_entity_id?: string | null
          affected_entity_type?: string | null
          category: string
          check_key: string
          created_at?: string
          description: string
          fix_action?: string | null
          fix_payload?: Json | null
          fixable?: boolean
          fixed_at?: string | null
          fixed_by?: string | null
          id?: string
          report_id?: string | null
          scan_id?: string | null
          session_id?: string | null
          severity: string
          student_id?: string | null
          student_name?: string | null
          suggested_fix?: string | null
        }
        Update: {
          affected_entity_id?: string | null
          affected_entity_type?: string | null
          category?: string
          check_key?: string
          created_at?: string
          description?: string
          fix_action?: string | null
          fix_payload?: Json | null
          fixable?: boolean
          fixed_at?: string | null
          fixed_by?: string | null
          id?: string
          report_id?: string | null
          scan_id?: string | null
          session_id?: string | null
          severity?: string
          student_id?: string | null
          student_name?: string | null
          suggested_fix?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "health_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      health_repair_log: {
        Row: {
          action: string
          admin_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          issue_id: string | null
          result: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          issue_id?: string | null
          result: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          issue_id?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_repair_log_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "health_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scans: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          scan_type: string
          score: number | null
          started_at: string
          status: string
          summary: Json
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          scan_type: string
          score?: number | null
          started_at?: string
          status?: string
          summary?: Json
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          scan_type?: string
          score?: number | null
          started_at?: string
          status?: string
          summary?: Json
          triggered_by?: string | null
        }
        Relationships: []
      }
      home_weather_settings: {
        Row: {
          id: number
          night: string
          updated_at: string
          weather: string
        }
        Insert: {
          id?: number
          night?: string
          updated_at?: string
          weather?: string
        }
        Update: {
          id?: number
          night?: string
          updated_at?: string
          weather?: string
        }
        Relationships: []
      }
      instructor_students: {
        Row: {
          created_at: string | null
          id: string
          instructor_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructor_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructor_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_students_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_drafts: {
        Row: {
          created_at: string
          current_step: number
          data: Json
          permit_file_name: string | null
          permit_file_path: string | null
          permit_mime_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          data?: Json
          permit_file_name?: string | null
          permit_file_path?: string | null
          permit_mime_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          data?: Json
          permit_file_name?: string | null
          permit_file_path?: string | null
          permit_mime_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intake_form_revisions: {
        Row: {
          created_at: string
          edited_by: string | null
          edited_by_role: string | null
          id: string
          note: string | null
          snapshot_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          edited_by?: string | null
          edited_by_role?: string | null
          id?: string
          note?: string | null
          snapshot_json: Json
          user_id: string
        }
        Update: {
          created_at?: string
          edited_by?: string | null
          edited_by_role?: string | null
          id?: string
          note?: string | null
          snapshot_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_form_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          note: string
          target_user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          note: string
          target_user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          note?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          lead_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          lead_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          is_pinned: boolean | null
          lead_id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          lead_id: string
          note: string
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          lead_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          age: number | null
          attachment_bucket: string | null
          attachment_path: string | null
          converted_student_id: string | null
          created_at: string | null
          created_by: string | null
          dob: string | null
          email: string | null
          full_name: string | null
          guardian_email: string | null
          guardian_first_name: string | null
          guardian_last_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          home_address: string | null
          id: string
          import_key: string | null
          import_source: string | null
          lead_status: string | null
          next_follow_up_at: string | null
          notes: string | null
          permit_expiration_date: string | null
          permit_issue_date: string | null
          permit_number: string | null
          phone: string | null
          pickup_locations: string | null
          raw_text: string | null
          source_account_created_on: string | null
          source_index: number | null
          source_location: string | null
          source_page: number | null
          source_status: string | null
          source_type: string | null
          source_zone: string | null
          start_date: string | null
          status: string | null
          student_first_name: string | null
          student_last_name: string | null
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          attachment_bucket?: string | null
          attachment_path?: string | null
          converted_student_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          guardian_email?: string | null
          guardian_first_name?: string | null
          guardian_last_name?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          home_address?: string | null
          id?: string
          import_key?: string | null
          import_source?: string | null
          lead_status?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          permit_expiration_date?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone?: string | null
          pickup_locations?: string | null
          raw_text?: string | null
          source_account_created_on?: string | null
          source_index?: number | null
          source_location?: string | null
          source_page?: number | null
          source_status?: string | null
          source_type?: string | null
          source_zone?: string | null
          start_date?: string | null
          status?: string | null
          student_first_name?: string | null
          student_last_name?: string | null
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          attachment_bucket?: string | null
          attachment_path?: string | null
          converted_student_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          guardian_email?: string | null
          guardian_first_name?: string | null
          guardian_last_name?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          home_address?: string | null
          id?: string
          import_key?: string | null
          import_source?: string | null
          lead_status?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          permit_expiration_date?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone?: string | null
          pickup_locations?: string | null
          raw_text?: string | null
          source_account_created_on?: string | null
          source_index?: number | null
          source_location?: string | null
          source_page?: number | null
          source_status?: string | null
          source_type?: string | null
          source_zone?: string | null
          start_date?: string | null
          status?: string | null
          student_first_name?: string | null
          student_last_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lesson_reminder_sends: {
        Row: {
          id: string
          kind: string
          sent_at: string
          session_id: string
        }
        Insert: {
          id?: string
          kind: string
          sent_at?: string
          session_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_reminder_sends_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      map_pins: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          custom_address: string | null
          id: string
          latitude: number
          longitude: number
          pin_type: string
          student_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          custom_address?: string | null
          id?: string
          latitude: number
          longitude: number
          pin_type?: string
          student_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          custom_address?: string | null
          id?: string
          latitude?: number
          longitude?: number
          pin_type?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_pins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_uploads: {
        Row: {
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string | null
          dedupe_key: string | null
          id: string
          link: string | null
          message: string
          metadata: Json | null
          read: boolean | null
          report_card_id: string | null
          session_id: string | null
          severity: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          read?: boolean | null
          report_card_id?: string | null
          session_id?: string | null
          severity?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          read?: boolean | null
          report_card_id?: string | null
          session_id?: string | null
          severity?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_report_card_id_fkey"
            columns: ["report_card_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_documents: {
        Row: {
          bucket: string
          created_at: string
          document_type: string
          file_name: string | null
          file_path: string
          id: string
          is_current: boolean
          mime_type: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          source: string
          status: string
          student_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_path: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          student_id: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_path?: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          student_id?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_documents_user_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_questions: {
        Row: {
          category: string
          correct_answer: string
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          image_url: string | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          updated_at: string
        }
        Insert: {
          category?: string
          correct_answer?: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          updated_at?: string
        }
        Update: {
          category?: string
          correct_answer?: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      permits: {
        Row: {
          admin_note: string | null
          created_at: string
          file_name: string | null
          file_path: string | null
          file_url: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          upload_source: string
          uploaded_at: string
          user_id: string
          verified_status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_url: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          upload_source?: string
          uploaded_at?: string
          user_id: string
          verified_status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_url?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          upload_source?: string
          uploaded_at?: string
          user_id?: string
          verified_status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          availability_days: string[] | null
          availability_notes: string | null
          availability_windows: string[] | null
          avatar_media_type: string
          avatar_pos_x: number | null
          avatar_pos_y: number | null
          avatar_url: string | null
          avatar_zoom: number | null
          best_streak: number
          created_at: string
          current_streak: number
          dropoff_address: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          email: string | null
          email_prefs: Json
          first_name: string | null
          full_name: string | null
          game_username: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          hours_completed: number
          hours_remaining: number
          id: string
          intake_edit_count: number | null
          intake_last_edit_role: string | null
          intake_submitted: boolean | null
          intake_updated_at: string | null
          intake_updated_by: string | null
          last_geocoded_at: string | null
          last_name: string | null
          last_played_on: string | null
          last_sign_in_at: string | null
          needs_review: boolean | null
          permit_expiration_date: string | null
          permit_file_url: string | null
          permit_issue_date: string | null
          permit_number: string | null
          phone: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          public_id: string | null
          purchased_hours: number
          rating: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          availability_days?: string[] | null
          availability_notes?: string | null
          availability_windows?: string[] | null
          avatar_media_type?: string
          avatar_pos_x?: number | null
          avatar_pos_y?: number | null
          avatar_url?: string | null
          avatar_zoom?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          email?: string | null
          email_prefs?: Json
          first_name?: string | null
          full_name?: string | null
          game_username?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          hours_completed?: number
          hours_remaining?: number
          id: string
          intake_edit_count?: number | null
          intake_last_edit_role?: string | null
          intake_submitted?: boolean | null
          intake_updated_at?: string | null
          intake_updated_by?: string | null
          last_geocoded_at?: string | null
          last_name?: string | null
          last_played_on?: string | null
          last_sign_in_at?: string | null
          needs_review?: boolean | null
          permit_expiration_date?: string | null
          permit_file_url?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          public_id?: string | null
          purchased_hours?: number
          rating?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          availability_days?: string[] | null
          availability_notes?: string | null
          availability_windows?: string[] | null
          avatar_media_type?: string
          avatar_pos_x?: number | null
          avatar_pos_y?: number | null
          avatar_url?: string | null
          avatar_zoom?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          email?: string | null
          email_prefs?: Json
          first_name?: string | null
          full_name?: string | null
          game_username?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          hours_completed?: number
          hours_remaining?: number
          id?: string
          intake_edit_count?: number | null
          intake_last_edit_role?: string | null
          intake_submitted?: boolean | null
          intake_updated_at?: string | null
          intake_updated_by?: string | null
          last_geocoded_at?: string | null
          last_name?: string | null
          last_played_on?: string | null
          last_sign_in_at?: string | null
          needs_review?: boolean | null
          permit_expiration_date?: string | null
          permit_file_url?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          public_id?: string | null
          purchased_hours?: number
          rating?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proposal_edit_requests: {
        Row: {
          created_at: string
          id: string
          note_text: string
          proposal_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_text: string
          proposal_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note_text?: string
          proposal_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_edit_requests_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "schedule_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_edit_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_edit_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_feedback: {
        Row: {
          created_at: string
          id: string
          is_authenticated: boolean
          message: string
          report_card_id: string
          sender_email: string
          sender_name: string
          sender_phone: string | null
          sender_user_id: string | null
          student_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_authenticated?: boolean
          message: string
          report_card_id: string
          sender_email: string
          sender_name: string
          sender_phone?: string | null
          sender_user_id?: string | null
          student_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_authenticated?: boolean
          message?: string
          report_card_id?: string
          sender_email?: string
          sender_name?: string
          sender_phone?: string | null
          sender_user_id?: string | null
          student_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_card_feedback_report_card_id_fkey"
            columns: ["report_card_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_ratings: {
        Row: {
          created_at: string
          edited_at: string | null
          feedback_text: string | null
          id: string
          instructor_id: string | null
          is_edited: boolean
          is_public_view: boolean | null
          rating_value: number
          report_card_id: string
          session_id: string | null
          student_id: string | null
          submitted_by_name: string | null
          submitted_by_role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          edited_at?: string | null
          feedback_text?: string | null
          id?: string
          instructor_id?: string | null
          is_edited?: boolean
          is_public_view?: boolean | null
          rating_value: number
          report_card_id: string
          session_id?: string | null
          student_id?: string | null
          submitted_by_name?: string | null
          submitted_by_role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          edited_at?: string | null
          feedback_text?: string | null
          id?: string
          instructor_id?: string | null
          is_edited?: boolean
          is_public_view?: boolean | null
          rating_value?: number
          report_card_id?: string
          session_id?: string | null
          student_id?: string | null
          submitted_by_name?: string | null
          submitted_by_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_ratings_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_ratings_report_card_id_fkey"
            columns: ["report_card_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_views: {
        Row: {
          id: string
          report_card_id: string
          user_agent: string | null
          via: string
          viewed_at: string
          viewer_type: string
          viewer_user_id: string | null
        }
        Insert: {
          id?: string
          report_card_id: string
          user_agent?: string | null
          via: string
          viewed_at?: string
          viewer_type: string
          viewer_user_id?: string | null
        }
        Update: {
          id?: string
          report_card_id?: string
          user_agent?: string | null
          via?: string
          viewed_at?: string
          viewer_type?: string
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_card_views_report_card_id_fkey"
            columns: ["report_card_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      report_cards: {
        Row: {
          acceleration: number | null
          audio_mime: string | null
          audio_original_name: string | null
          audio_path: string | null
          audio_size_bytes: number | null
          audio_uploaded_at: string | null
          audio_uploaded_by: string | null
          blind_spots: number | null
          braking: number | null
          changing_lanes: number | null
          created_at: string | null
          distractions: number | null
          draft_state: Json | null
          first_viewed_at: string | null
          first_viewed_via: string | null
          focus_areas: Json | null
          following_distance: number | null
          general_parking: number | null
          guardian_email_sent_at: string | null
          id: string
          instructor_id: string
          internal_message: string | null
          interstate: number | null
          is_public: boolean
          lane_maintenance: number | null
          last_viewed_at: string | null
          last_viewed_via: string | null
          left_turns: number | null
          lesson_audio_url: string | null
          merging: number | null
          message_to_student: string | null
          most_improved_skills: Json | null
          overall: number | null
          parallel_parking: number | null
          public_access_code: string | null
          public_enabled_at: string | null
          public_enabled_by: string | null
          public_first_viewed_at: string | null
          public_last_viewed_at: string | null
          public_send_to_guardian: boolean
          public_share_slug: string | null
          public_view_count: number
          report_card_status: string
          reverse_parking: number | null
          right_turns: number | null
          road_sign_awareness: number | null
          session_id: string
          show_graph_publicly: boolean
          signal_usage: number | null
          speed_maintenance: number | null
          straight_line_backing: number | null
          strongest_skills: Json | null
          student_email_sent_at: string | null
          student_first_viewed_at: string | null
          student_id: string
          student_last_viewed_at: string | null
          student_view_count: number
          submitted_at: string | null
          time_split: Json | null
          transcription_summary: string | null
          turn_about: number | null
          view_count: number
        }
        Insert: {
          acceleration?: number | null
          audio_mime?: string | null
          audio_original_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          audio_uploaded_at?: string | null
          audio_uploaded_by?: string | null
          blind_spots?: number | null
          braking?: number | null
          changing_lanes?: number | null
          created_at?: string | null
          distractions?: number | null
          draft_state?: Json | null
          first_viewed_at?: string | null
          first_viewed_via?: string | null
          focus_areas?: Json | null
          following_distance?: number | null
          general_parking?: number | null
          guardian_email_sent_at?: string | null
          id?: string
          instructor_id: string
          internal_message?: string | null
          interstate?: number | null
          is_public?: boolean
          lane_maintenance?: number | null
          last_viewed_at?: string | null
          last_viewed_via?: string | null
          left_turns?: number | null
          lesson_audio_url?: string | null
          merging?: number | null
          message_to_student?: string | null
          most_improved_skills?: Json | null
          overall?: number | null
          parallel_parking?: number | null
          public_access_code?: string | null
          public_enabled_at?: string | null
          public_enabled_by?: string | null
          public_first_viewed_at?: string | null
          public_last_viewed_at?: string | null
          public_send_to_guardian?: boolean
          public_share_slug?: string | null
          public_view_count?: number
          report_card_status?: string
          reverse_parking?: number | null
          right_turns?: number | null
          road_sign_awareness?: number | null
          session_id: string
          show_graph_publicly?: boolean
          signal_usage?: number | null
          speed_maintenance?: number | null
          straight_line_backing?: number | null
          strongest_skills?: Json | null
          student_email_sent_at?: string | null
          student_first_viewed_at?: string | null
          student_id: string
          student_last_viewed_at?: string | null
          student_view_count?: number
          submitted_at?: string | null
          time_split?: Json | null
          transcription_summary?: string | null
          turn_about?: number | null
          view_count?: number
        }
        Update: {
          acceleration?: number | null
          audio_mime?: string | null
          audio_original_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          audio_uploaded_at?: string | null
          audio_uploaded_by?: string | null
          blind_spots?: number | null
          braking?: number | null
          changing_lanes?: number | null
          created_at?: string | null
          distractions?: number | null
          draft_state?: Json | null
          first_viewed_at?: string | null
          first_viewed_via?: string | null
          focus_areas?: Json | null
          following_distance?: number | null
          general_parking?: number | null
          guardian_email_sent_at?: string | null
          id?: string
          instructor_id?: string
          internal_message?: string | null
          interstate?: number | null
          is_public?: boolean
          lane_maintenance?: number | null
          last_viewed_at?: string | null
          last_viewed_via?: string | null
          left_turns?: number | null
          lesson_audio_url?: string | null
          merging?: number | null
          message_to_student?: string | null
          most_improved_skills?: Json | null
          overall?: number | null
          parallel_parking?: number | null
          public_access_code?: string | null
          public_enabled_at?: string | null
          public_enabled_by?: string | null
          public_first_viewed_at?: string | null
          public_last_viewed_at?: string | null
          public_send_to_guardian?: boolean
          public_share_slug?: string | null
          public_view_count?: number
          report_card_status?: string
          reverse_parking?: number | null
          right_turns?: number | null
          road_sign_awareness?: number | null
          session_id?: string
          show_graph_publicly?: boolean
          signal_usage?: number | null
          speed_maintenance?: number | null
          straight_line_backing?: number | null
          strongest_skills?: Json | null
          student_email_sent_at?: string | null
          student_first_viewed_at?: string | null
          student_id?: string
          student_last_viewed_at?: string | null
          student_view_count?: number
          submitted_at?: string | null
          time_split?: Json | null
          transcription_summary?: string | null
          turn_about?: number | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      road_test_emails: {
        Row: {
          body: string | null
          error_message: string | null
          id: string
          recipient_email: string
          recipient_type: string
          sent_at: string
          session_id: string
          status: string
          subject: string
        }
        Insert: {
          body?: string | null
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_type: string
          sent_at?: string
          session_id: string
          status?: string
          subject: string
        }
        Update: {
          body?: string | null
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_type?: string
          sent_at?: string
          session_id?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_test_emails_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      road_test_results: {
        Row: {
          created_at: string
          id: string
          instructor_id: string
          notes: string | null
          result: string
          session_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructor_id: string
          notes?: string | null
          result: string
          session_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructor_id?: string
          notes?: string | null
          result?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_test_results_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_test_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          conflict_override: boolean
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          instructor_id: string | null
          notes: string | null
          overridden_at: string | null
          overridden_by: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          conflict_override?: boolean
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          starts_at: string
          title?: string
          updated_at?: string
        }
        Update: {
          conflict_override?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_proposal_items: {
        Row: {
          conflict_reason: string | null
          created_at: string
          created_session_id: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          end_time: string
          id: string
          item_status: string
          pickup_address: string | null
          pickup_time: string | null
          proposal_id: string
          proposed_date: string
          session_type: string
          start_time: string
          updated_at: string
        }
        Insert: {
          conflict_reason?: string | null
          created_at?: string
          created_session_id?: string | null
          dds_location?: string | null
          dropoff_address?: string | null
          duration_minutes?: number
          end_time: string
          id?: string
          item_status?: string
          pickup_address?: string | null
          pickup_time?: string | null
          proposal_id: string
          proposed_date: string
          session_type?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          conflict_reason?: string | null
          created_at?: string
          created_session_id?: string | null
          dds_location?: string | null
          dropoff_address?: string | null
          duration_minutes?: number
          end_time?: string
          id?: string
          item_status?: string
          pickup_address?: string | null
          pickup_time?: string | null
          proposal_id?: string
          proposed_date?: string
          session_type?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_proposal_items_created_session_id_fkey"
            columns: ["created_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "schedule_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_proposals: {
        Row: {
          acceptance_mode: string
          accepted_at: string | null
          created_at: string
          created_by: string
          created_by_role: string
          declined_at: string | null
          expires_at: string | null
          finalized_at: string | null
          id: string
          instructor_id: string
          latest_edit_request_at: string | null
          latest_edit_request_note: string | null
          note_to_student: string | null
          package_id: string | null
          proposal_status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          acceptance_mode?: string
          accepted_at?: string | null
          created_at?: string
          created_by: string
          created_by_role?: string
          declined_at?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          id?: string
          instructor_id: string
          latest_edit_request_at?: string | null
          latest_edit_request_note?: string | null
          note_to_student?: string | null
          package_id?: string | null
          proposal_status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          acceptance_mode?: string
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          created_by_role?: string
          declined_at?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          id?: string
          instructor_id?: string
          latest_edit_request_at?: string | null
          latest_edit_request_note?: string | null
          note_to_student?: string | null
          package_id?: string | null
          proposal_status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_proposals_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_proposals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          price: string
          square_link: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          price: string
          square_link?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          price?: string
          square_link?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_hour_deductions: {
        Row: {
          deducted_at: string
          deducted_hours: number
          id: string
          reason: string
          session_id: string
          student_id: string
        }
        Insert: {
          deducted_at?: string
          deducted_hours: number
          id?: string
          reason?: string
          session_id: string
          student_id: string
        }
        Update: {
          deducted_at?: string
          deducted_hours?: number
          id?: string
          reason?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_session"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_student"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_location_updates: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          session_id: string
          tracking_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          session_id: string
          tracking_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          session_id?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_location_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_location_updates_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "session_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tracking: {
        Row: {
          created_at: string
          ended_at: string | null
          guardian_email: string
          id: string
          instructor_id: string
          is_active: boolean
          last_accuracy: number | null
          last_email_sent_at: string | null
          last_latitude: number | null
          last_location_at: string | null
          last_longitude: number | null
          session_id: string
          started_at: string
          student_id: string
          tracking_token: string
          update_interval_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          guardian_email: string
          id?: string
          instructor_id: string
          is_active?: boolean
          last_accuracy?: number | null
          last_email_sent_at?: string | null
          last_latitude?: number | null
          last_location_at?: string | null
          last_longitude?: number | null
          session_id: string
          started_at?: string
          student_id: string
          tracking_token: string
          update_interval_minutes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          guardian_email?: string
          id?: string
          instructor_id?: string
          is_active?: boolean
          last_accuracy?: number | null
          last_email_sent_at?: string | null
          last_latitude?: number | null
          last_location_at?: string | null
          last_longitude?: number | null
          session_id?: string
          started_at?: string
          student_id?: string
          tracking_token?: string
          update_interval_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tracking_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          actual_minutes: number | null
          cancel_penalty_applied: boolean
          cancel_penalty_hours: number
          cancellation_fee_waived: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          conflict_override: boolean
          created_at: string
          created_by: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          ends_at: string
          hours_counted: boolean
          hours_deducted_at: string | null
          id: string
          instructor_id: string
          note_for_instructor: string | null
          note_for_student: string | null
          overridden_at: string | null
          overridden_by: string | null
          partial_reason: string | null
          pickup_address: string | null
          pickup_time: string | null
          report_card_id: string | null
          session_type: string
          starts_at: string
          status: string
          student_id: string
          suppress_student_notification: boolean
        }
        Insert: {
          actual_minutes?: number | null
          cancel_penalty_applied?: boolean
          cancel_penalty_hours?: number
          cancellation_fee_waived?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          conflict_override?: boolean
          created_at?: string
          created_by?: string | null
          dds_location?: string | null
          dropoff_address?: string | null
          duration_minutes: number
          ends_at: string
          hours_counted?: boolean
          hours_deducted_at?: string | null
          id?: string
          instructor_id: string
          note_for_instructor?: string | null
          note_for_student?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          partial_reason?: string | null
          pickup_address?: string | null
          pickup_time?: string | null
          report_card_id?: string | null
          session_type?: string
          starts_at: string
          status?: string
          student_id: string
          suppress_student_notification?: boolean
        }
        Update: {
          actual_minutes?: number | null
          cancel_penalty_applied?: boolean
          cancel_penalty_hours?: number
          cancellation_fee_waived?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          conflict_override?: boolean
          created_at?: string
          created_by?: string | null
          dds_location?: string | null
          dropoff_address?: string | null
          duration_minutes?: number
          ends_at?: string
          hours_counted?: boolean
          hours_deducted_at?: string | null
          id?: string
          instructor_id?: string
          note_for_instructor?: string | null
          note_for_student?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          partial_reason?: string | null
          pickup_address?: string | null
          pickup_time?: string | null
          report_card_id?: string | null
          session_type?: string
          starts_at?: string
          status?: string
          student_id?: string
          suppress_student_notification?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_schedule_shares: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          public_access_code: string | null
          public_enabled_at: string | null
          public_share_slug: string | null
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          public_access_code?: string | null
          public_enabled_at?: string | null
          public_share_slug?: string | null
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          public_access_code?: string | null
          public_enabled_at?: string | null
          public_share_slug?: string | null
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_schedule_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_schedule_shares_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_schedule_shares_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      acting_user_id: { Args: never; Returns: string }
      admin_apply_lead_import: {
        Args: { p_rows: Json }
        Returns: {
          action: string
          lead_id: string
          row_number: number
        }[]
      }
      admin_lead_filter_options: {
        Args: never
        Returns: {
          kind: string
          lead_count: number
          value: string
        }[]
      }
      admin_search_leads: {
        Args: {
          p_dir?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_source?: string
          p_start_from?: string
          p_start_to?: string
          p_status?: string
          p_zone?: string
        }
        Returns: {
          created_at: string
          email: string
          full_name: string
          guardian_email: string
          guardian_first_name: string
          guardian_last_name: string
          guardian_name: string
          guardian_phone: string
          id: string
          import_key: string
          import_source: string
          lead_status: string
          notes: string
          phone: string
          source_account_created_on: string
          source_index: number
          source_location: string
          source_page: number
          source_status: string
          source_zone: string
          start_date: string
          student_first_name: string
          student_last_name: string
          total_count: number
        }[]
      }
      apply_session_hour_deduction: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      approve_pending_session:
        | {
            Args: { _session_id: string }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _override_conflicts: boolean; _session_id: string }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      can_read_report_card: {
        Args: { p_report_card_id: string }
        Returns: boolean
      }
      can_view_student_full_schedule: {
        Args: { _student_id: string; _viewer_id: string }
        Returns: boolean
      }
      can_write_report_card_audio: {
        Args: { p_report_card_id: string }
        Returns: boolean
      }
      cancel_session: {
        Args: { _reason: string; _session_id: string }
        Returns: {
          actual_minutes: number | null
          cancel_penalty_applied: boolean
          cancel_penalty_hours: number
          cancellation_fee_waived: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          conflict_override: boolean
          created_at: string
          created_by: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          ends_at: string
          hours_counted: boolean
          hours_deducted_at: string | null
          id: string
          instructor_id: string
          note_for_instructor: string | null
          note_for_student: string | null
          overridden_at: string | null
          overridden_by: string | null
          partial_reason: string | null
          pickup_address: string | null
          pickup_time: string | null
          report_card_id: string | null
          session_type: string
          starts_at: string
          status: string
          student_id: string
          suppress_student_notification: boolean
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      canonical_user_id: { Args: { _uid: string }; Returns: string }
      check_game_username_available: {
        Args: { _username: string }
        Returns: boolean
      }
      check_schedule_conflicts: {
        Args: {
          _ends_at: string
          _exclude_block_id?: string
          _exclude_session_id?: string
          _instructor_id: string
          _starts_at: string
          _student_id: string
        }
        Returns: {
          ends_at: string
          id: string
          kind: string
          label: string
          starts_at: string
        }[]
      }
      complete_session: {
        Args: { _session_id: string; _via?: string }
        Returns: {
          actual_minutes: number | null
          cancel_penalty_applied: boolean
          cancel_penalty_hours: number
          cancellation_fee_waived: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          conflict_override: boolean
          created_at: string
          created_by: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          ends_at: string
          hours_counted: boolean
          hours_deducted_at: string | null
          id: string
          instructor_id: string
          note_for_instructor: string | null
          note_for_student: string | null
          overridden_at: string | null
          overridden_by: string | null
          partial_reason: string | null
          pickup_address: string | null
          pickup_time: string | null
          report_card_id: string | null
          session_type: string
          starts_at: string
          status: string
          student_id: string
          suppress_student_notification: boolean
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_completed_hours: {
        Args: { p_student_id: string }
        Returns: number
      }
      compute_remaining_hours: {
        Args: { p_student_id: string }
        Returns: number
      }
      create_match: {
        Args: { _duration_s: number }
        Returns: {
          code: string
          created_at: string
          duration_s: number
          host_id: string
          id: string
          seed: number
          started_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_pending_session_admin:
        | {
            Args: {
              _duration_minutes: number
              _instructor_id: string
              _starts_at: string
              _student_id: string
            }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _duration_minutes: number
              _instructor_id: string
              _override_conflicts: boolean
              _starts_at: string
              _student_id: string
            }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_session_admin:
        | {
            Args: {
              _duration_minutes: number
              _instructor_id: string
              _starts_at: string
              _student_id: string
            }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _duration_minutes: number
              _instructor_id: string
              _override_conflicts: boolean
              _starts_at: string
              _student_id: string
            }
            Returns: {
              actual_minutes: number | null
              cancel_penalty_applied: boolean
              cancel_penalty_hours: number
              cancellation_fee_waived: boolean
              cancellation_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              cancelled_by_role: string | null
              completed: boolean | null
              completed_at: string | null
              completed_by: string | null
              conflict_override: boolean
              created_at: string
              created_by: string | null
              dds_location: string | null
              dropoff_address: string | null
              duration_minutes: number
              ends_at: string
              hours_counted: boolean
              hours_deducted_at: string | null
              id: string
              instructor_id: string
              note_for_instructor: string | null
              note_for_student: string | null
              overridden_at: string | null
              overridden_by: string | null
              partial_reason: string | null
              pickup_address: string | null
              pickup_time: string | null
              report_card_id: string | null
              session_type: string
              starts_at: string
              status: string
              student_id: string
              suppress_student_notification: boolean
            }
            SetofOptions: {
              from: "*"
              to: "sessions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_profile: {
        Args: never
        Returns: {
          approval_status: string
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          availability_days: string[] | null
          availability_notes: string | null
          availability_windows: string[] | null
          avatar_media_type: string
          avatar_pos_x: number | null
          avatar_pos_y: number | null
          avatar_url: string | null
          avatar_zoom: number | null
          best_streak: number
          created_at: string
          current_streak: number
          dropoff_address: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          email: string | null
          email_prefs: Json
          first_name: string | null
          full_name: string | null
          game_username: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          hours_completed: number
          hours_remaining: number
          id: string
          intake_edit_count: number | null
          intake_last_edit_role: string | null
          intake_submitted: boolean | null
          intake_updated_at: string | null
          intake_updated_by: string | null
          last_geocoded_at: string | null
          last_name: string | null
          last_played_on: string | null
          last_sign_in_at: string | null
          needs_review: boolean | null
          permit_expiration_date: string | null
          permit_file_url: string | null
          permit_issue_date: string | null
          permit_number: string | null
          phone: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          public_id: string | null
          purchased_hours: number
          rating: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_account_family: {
        Args: never
        Returns: {
          email: string
          full_name: string
          is_me: boolean
          is_primary: boolean
          relationship: string
          user_id: string
        }[]
      }
      get_email_render: {
        Args: { p_log_id: string }
        Returns: {
          created_at: string
          error_message: string
          html: string
          id: string
          message_id: string
          recipient_email: string
          status: string
          subject: string
          template_name: string
        }[]
      }
      get_my_sessions: {
        Args: never
        Returns: {
          cancellation_reason: string
          completed: boolean
          completed_at: string
          dropoff_address: string
          duration_minutes: number
          ends_at: string
          instructor_email: string
          instructor_id: string
          instructor_name: string
          note_for_instructor: string
          note_for_student: string
          pickup_address: string
          report_card_id: string
          session_id: string
          starts_at: string
          status: string
          student_email: string
          student_id: string
          student_name: string
        }[]
      }
      get_public_tracking_by_token: {
        Args: { p_token: string }
        Returns: {
          ended_at: string
          is_active: boolean
          last_accuracy: number
          last_latitude: number
          last_location_at: string
          last_longitude: number
          session_ends_at: string
          session_starts_at: string
          session_status: string
          started_at: string
          student_first_name: string
          tracking_id: string
          update_interval_minutes: number
        }[]
      }
      get_report_card_details: {
        Args: { p_report_card_id: string }
        Returns: {
          acceleration: number
          audio_mime: string
          audio_original_name: string
          audio_path: string
          audio_size_bytes: number
          audio_uploaded_at: string
          blind_spots: number
          braking: number
          can_see_internal: boolean
          changing_lanes: number
          created_at: string
          distractions: number
          first_viewed_at: string
          first_viewed_via: string
          following_distance: number
          general_parking: number
          id: string
          instructor_email: string
          instructor_id: string
          instructor_name: string
          internal_message: string
          interstate: number
          lane_maintenance: number
          last_viewed_at: string
          last_viewed_via: string
          left_turns: number
          lesson_audio_url: string
          merging: number
          message_to_student: string
          overall: number
          parallel_parking: number
          public_first_viewed_at: string
          public_last_viewed_at: string
          public_view_count: number
          reverse_parking: number
          right_turns: number
          road_sign_awareness: number
          session_ends_at: string
          session_id: string
          session_starts_at: string
          session_status: string
          signal_usage: number
          speed_maintenance: number
          straight_line_backing: number
          student_email: string
          student_first_viewed_at: string
          student_id: string
          student_last_viewed_at: string
          student_name: string
          student_view_count: number
          transcription_summary: string
          turn_about: number
          view_count: number
        }[]
      }
      get_report_card_view_log: {
        Args: { p_report_card_id: string }
        Returns: {
          via: string
          viewed_at: string
          viewer_name: string
          viewer_type: string
        }[]
      }
      get_session_details: {
        Args: { p_session_id: string }
        Returns: {
          actual_minutes: number
          cancellation_reason: string
          completed: boolean
          completed_at: string
          dropoff_address: string
          duration_minutes: number
          ends_at: string
          guardian_name: string
          guardian_phone: string
          instructor_email: string
          instructor_id: string
          instructor_name: string
          note_for_instructor: string
          note_for_student: string
          partial_reason: string
          pickup_address: string
          report_card_id: string
          session_id: string
          starts_at: string
          status: string
          student_email: string
          student_id: string
          student_name: string
          student_phone: string
        }[]
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instructor_can_read_permit_object: {
        Args: { _instructor_id: string; _name: string }
        Returns: boolean
      }
      instructor_teaches_student: {
        Args: { _instructor_id: string; _student_id: string }
        Returns: boolean
      }
      is_assigned_instructor: {
        Args: { _instructor_id: string; _student_id: string }
        Returns: boolean
      }
      is_match_player: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      join_open_match: { Args: { _code: string }; Returns: string }
      list_public_matches: {
        Args: never
        Returns: {
          code: string
          created_at: string
          duration_s: number
          host_id: string
          host_name: string
          id: string
          player_count: number
          seats_left: number
          status: string
        }[]
      }
      list_visible_emails: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          created_at: string
          error_message: string
          id: string
          message_id: string
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      mark_report_card_viewed: {
        Args: {
          p_report_card_id: string
          p_user_agent?: string
          p_via?: string
        }
        Returns: undefined
      }
      merge_preview: {
        Args: { p_source_user_id: string; p_target_user_id: string }
        Returns: Json
      }
      merge_student_account: {
        Args: {
          p_relationship?: string
          p_source_user_id: string
          p_target_user_id: string
        }
        Returns: Json
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
      partially_complete_session: {
        Args: { _actual_minutes?: number; _reason: string; _session_id: string }
        Returns: {
          actual_minutes: number | null
          cancel_penalty_applied: boolean
          cancel_penalty_hours: number
          cancellation_fee_waived: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          conflict_override: boolean
          created_at: string
          created_by: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          ends_at: string
          hours_counted: boolean
          hours_deducted_at: string | null
          id: string
          instructor_id: string
          note_for_instructor: string | null
          note_for_student: string | null
          overridden_at: string | null
          overridden_by: string | null
          partial_reason: string | null
          pickup_address: string | null
          pickup_time: string | null
          report_card_id: string | null
          session_type: string
          starts_at: string
          status: string
          student_id: string
          suppress_student_notification: boolean
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_student_remaining_hours: {
        Args: { p_student_id: string }
        Returns: undefined
      }
      recalculate_all_student_hours: {
        Args: never
        Returns: {
          new_hours: number
          old_hours: number
          sessions_processed: number
          student_id: string
        }[]
      }
      record_game_streak: {
        Args: never
        Returns: {
          best_streak: number
          current_streak: number
          last_played_on: string
        }[]
      }
      record_tracking_location: {
        Args: {
          p_accuracy?: number
          p_latitude: number
          p_longitude: number
          p_tracking_id: string
        }
        Returns: undefined
      }
      restart_match: {
        Args: { _match_id: string }
        Returns: {
          code: string
          created_at: string
          duration_s: number
          host_id: string
          id: string
          seed: number
          started_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      round_up_to_30min: { Args: { ts: string }; Returns: string }
      set_game_username: { Args: { _username: string }; Returns: string }
      try_uuid: { Args: { p_text: string }; Returns: string }
      update_session_notes: {
        Args: {
          _note_for_instructor?: string
          _note_for_student?: string
          _session_id: string
        }
        Returns: {
          actual_minutes: number | null
          cancel_penalty_applied: boolean
          cancel_penalty_hours: number
          cancellation_fee_waived: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          conflict_override: boolean
          created_at: string
          created_by: string | null
          dds_location: string | null
          dropoff_address: string | null
          duration_minutes: number
          ends_at: string
          hours_counted: boolean
          hours_deducted_at: string | null
          id: string
          instructor_id: string
          note_for_instructor: string | null
          note_for_student: string | null
          overridden_at: string | null
          overridden_by: string | null
          partial_reason: string | null
          pickup_address: string | null
          pickup_time: string | null
          report_card_id: string | null
          session_type: string
          starts_at: string
          status: string
          student_id: string
          suppress_student_notification: boolean
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user" | "student" | "instructor" | "staff"
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
      app_role: ["admin", "user", "student", "instructor", "staff"],
    },
  },
} as const
