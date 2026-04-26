CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"abn" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"pay_period_start" date,
	"pay_period_end" date,
	"export_target" text,
	"shift_ids" uuid[],
	"total_shifts" integer,
	"total_hours" numeric,
	"file_hash" text,
	"exported_by" uuid,
	"exported_at" timestamp with time zone,
	"audit_pack_url" text
);
--> statement-breakpoint
CREATE TABLE "shift_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"worker_id" uuid,
	"site_id" uuid,
	"event_type" text NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"device_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gps_lat" numeric(10, 6),
	"gps_lng" numeric(10, 6),
	"gps_accuracy_metres" numeric(8, 2),
	"event_hash" text NOT NULL,
	"previous_event_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" text NOT NULL,
	CONSTRAINT "shift_events_event_type_check" CHECK ("shift_events"."event_type" IN ('START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL','INTELLIGENCE_CLEAR','ANOMALY_FLAG','DISPUTE_RAISED','EXPORT_RECORD'))
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"worker_id" uuid,
	"site_id" uuid,
	"shift_date" date NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"break_minutes" integer DEFAULT 0,
	"total_hours" numeric(5, 2),
	"receipt_id" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"confidence_score" integer DEFAULT 50,
	"anomaly_flags" jsonb DEFAULT '[]'::jsonb,
	"supervisor_approved_by" uuid,
	"supervisor_approved_at" timestamp with time zone,
	"payroll_approved_by" uuid,
	"payroll_approved_at" timestamp with time zone,
	"export_id" uuid,
	"worker_note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "shifts_receipt_id_unique" UNIQUE("receipt_id"),
	CONSTRAINT "shifts_status_check" CHECK ("shifts"."status" IN ('SUBMITTED','SUPERVISOR_APPROVED','PAYROLL_APPROVED','EXPORTED','DISPUTED','ADJUSTED'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"site_code" text,
	"geofence_lat" numeric(10, 6),
	"geofence_lng" numeric(10, 6),
	"geofence_radius_metres" integer DEFAULT 200,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supervisors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"supabase_user_id" uuid,
	"site_ids" uuid[],
	"is_active" boolean DEFAULT true,
	"pending_sms_approval_ids" text[],
	"last_batch_sms_date" date,
	"verify_token" uuid DEFAULT gen_random_uuid()
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"employee_id" text NOT NULL,
	"pay_rate" numeric(10, 2) NOT NULL,
	"award_classification" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;