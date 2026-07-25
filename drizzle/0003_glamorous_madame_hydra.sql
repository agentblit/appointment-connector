DROP INDEX "appointment"."appointment_appointments_reminder_pending_idx";--> statement-breakpoint
ALTER TABLE "appointment"."appointments" DROP COLUMN "reminder_sent_at";--> statement-breakpoint
ALTER TABLE "appointment"."connectors" DROP COLUMN "reminder_window_minutes";