ALTER TABLE "appointment"."appointments" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "appointment"."appointments" ADD COLUMN "external_meeting_id" text;--> statement-breakpoint
ALTER TABLE "appointment"."appointments" ADD COLUMN "location_address" text;--> statement-breakpoint
ALTER TABLE "appointment"."appointments" ADD COLUMN "location_maps_url" text;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "role_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "meeting_mode" varchar(20) DEFAULT 'offline' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "location_address" text;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "location_maps_url" text;--> statement-breakpoint
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
ALTER TABLE "appointment"."oauth_connections" ADD CONSTRAINT "oauth_connections_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."roles" ADD CONSTRAINT "roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "appointment"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_oauth_entity_provider_uidx" ON "appointment"."oauth_connections" USING btree ("entity_id","provider");--> statement-breakpoint
CREATE INDEX "appointment_oauth_entity_id_idx" ON "appointment"."oauth_connections" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_roles_workspace_name_uidx" ON "appointment"."roles" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "appointment_roles_workspace_id_idx" ON "appointment"."roles" USING btree ("workspace_id");
