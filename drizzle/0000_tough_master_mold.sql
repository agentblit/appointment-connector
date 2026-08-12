CREATE SCHEMA "appointment";
--> statement-breakpoint
CREATE TABLE "appointment"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_key_hash" varchar(128) NOT NULL,
	"label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "appointment"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" varchar(64) DEFAULT 'anonymous' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"meeting_url" text,
	"external_meeting_id" text,
	"location_address" text,
	"location_maps_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"role_ids" uuid[] DEFAULT '{}' NOT NULL,
	"meeting_mode" varchar(20) DEFAULT 'offline' NOT NULL,
	"location_address" text,
	"location_maps_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"account_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"entity_label" varchar(100) NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"slot_duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment"."api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "appointment"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."appointments" ADD CONSTRAINT "appointments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."availability_rules" ADD CONSTRAINT "availability_rules_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD CONSTRAINT "entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "appointment"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."oauth_connections" ADD CONSTRAINT "oauth_connections_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."roles" ADD CONSTRAINT "roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "appointment"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_api_keys_workspace_id_idx" ON "appointment"."api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "appointment_appointments_entity_start_idx" ON "appointment"."appointments" USING btree ("entity_id","start_time");--> statement-breakpoint
CREATE INDEX "appointment_availability_entity_id_idx" ON "appointment"."availability_rules" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_entities_workspace_name_uidx" ON "appointment"."entities" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "appointment_entities_workspace_id_idx" ON "appointment"."entities" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_oauth_entity_provider_uidx" ON "appointment"."oauth_connections" USING btree ("entity_id","provider");--> statement-breakpoint
CREATE INDEX "appointment_oauth_entity_id_idx" ON "appointment"."oauth_connections" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_roles_workspace_name_uidx" ON "appointment"."roles" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "appointment_roles_workspace_id_idx" ON "appointment"."roles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_workspaces_user_id_uidx" ON "appointment"."workspaces" USING btree ("user_id");