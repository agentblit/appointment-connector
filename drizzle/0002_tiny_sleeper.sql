CREATE TABLE "appointment"."availability_date_rule_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment"."availability_date_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "booking_period_type" varchar(20) DEFAULT 'unlimited' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "available_from" date;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "available_to" date;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "booking_period_days" integer;--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "booking_period_days_kind" varchar(20);--> statement-breakpoint
ALTER TABLE "appointment"."availability_date_rule_windows" ADD CONSTRAINT "availability_date_rule_windows_rule_id_availability_date_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "appointment"."availability_date_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment"."availability_date_rules" ADD CONSTRAINT "availability_date_rules_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "appointment"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_date_rule_windows_rule_id_idx" ON "appointment"."availability_date_rule_windows" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_date_rules_entity_date_uidx" ON "appointment"."availability_date_rules" USING btree ("entity_id","date");--> statement-breakpoint
CREATE INDEX "appointment_date_rules_entity_id_idx" ON "appointment"."availability_date_rules" USING btree ("entity_id");