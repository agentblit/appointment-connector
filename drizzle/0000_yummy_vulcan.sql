CREATE SCHEMA "appointment";
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
CREATE TABLE "appointment"."connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(10) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"entity_label" varchar(100) NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"slot_duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connectors_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "appointment"."entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"role_ids" uuid[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment"."appointments" ADD CONSTRAINT "appointments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."availability_rules" ADD CONSTRAINT "availability_rules_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD CONSTRAINT "entities_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "appointment"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."roles" ADD CONSTRAINT "roles_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "appointment"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_appointments_entity_start_idx" ON "appointment"."appointments" USING btree ("entity_id","start_time");--> statement-breakpoint
CREATE INDEX "appointment_availability_entity_id_idx" ON "appointment"."availability_rules" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "appointment_connectors_agent_id_idx" ON "appointment"."connectors" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "appointment_connectors_user_id_idx" ON "appointment"."connectors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_entities_connector_name_uidx" ON "appointment"."entities" USING btree ("connector_id","name");--> statement-breakpoint
CREATE INDEX "appointment_entities_connector_id_idx" ON "appointment"."entities" USING btree ("connector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_roles_connector_name_uidx" ON "appointment"."roles" USING btree ("connector_id","name");--> statement-breakpoint
CREATE INDEX "appointment_roles_connector_id_idx" ON "appointment"."roles" USING btree ("connector_id");