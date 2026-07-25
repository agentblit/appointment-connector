CREATE TABLE "appointment"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment"."roles" ADD CONSTRAINT "roles_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "appointment"."connectors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_roles_connector_name_uidx" ON "appointment"."roles" USING btree ("connector_id","name");
--> statement-breakpoint
CREATE INDEX "appointment_roles_connector_id_idx" ON "appointment"."roles" USING btree ("connector_id");
--> statement-breakpoint
INSERT INTO "appointment"."roles" ("connector_id", "name", "description")
SELECT
	c."id",
	COALESCE(NULLIF(TRIM(r."name"), ''), 'Untitled'),
	COALESCE(r."description", '')
FROM "appointment"."connectors" c
CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(c."roles", '[]'::jsonb)) AS r("name" text, "description" text)
WHERE jsonb_typeof(COALESCE(c."roles", '[]'::jsonb)) = 'array'
	AND jsonb_array_length(COALESCE(c."roles", '[]'::jsonb)) > 0;
--> statement-breakpoint
ALTER TABLE "appointment"."entities" ADD COLUMN "role_ids" uuid[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
UPDATE "appointment"."entities" e
SET "role_ids" = COALESCE((
	SELECT array_agg(r."id")
	FROM unnest(COALESCE(e."roles", '{}'::text[])) AS role_name
	INNER JOIN "appointment"."roles" r
		ON r."connector_id" = e."connector_id"
		AND lower(r."name") = lower(role_name)
), '{}'::uuid[]);
--> statement-breakpoint
ALTER TABLE "appointment"."entities" DROP COLUMN "roles";
--> statement-breakpoint
ALTER TABLE "appointment"."connectors" DROP COLUMN "roles";
