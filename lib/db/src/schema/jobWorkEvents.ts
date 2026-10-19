import { pgEnum, pgTable, serial, integer, text, smallint, timestamp } from "drizzle-orm/pg-core";
import { serialNumbersTable } from "./serialNumbers";
import { usersTable } from "./users";

export const jobWorkEventTypeEnum = pgEnum("job_work_event_type", [
  "started",
  "progress_updated",
  "handed_over",
  "completed",
  "shipment_verified",
]);

export const jobWorkEventsTable = pgTable("job_work_events", {
  id: serial("id").primaryKey(),
  serialNumberId: integer("serial_number_id").notNull().references(() => serialNumbersTable.id),
  actorUserId: integer("actor_user_id").references(() => usersTable.id),
  eventType: jobWorkEventTypeEnum("event_type").notNull(),
  shift: smallint("shift"),
  progressPct: smallint("progress_pct"),
  category: text("category"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobWorkEvent = typeof jobWorkEventsTable.$inferSelect;
