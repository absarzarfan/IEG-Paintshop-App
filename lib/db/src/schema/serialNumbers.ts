import { pgEnum, pgTable, serial, integer, text, timestamp, smallint, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobItemsTable } from "./jobItems";

export const jobWorkStatusEnum = pgEnum("job_work_status", ["queued", "ongoing", "shipment", "shipped"]);

export const serialNumbersTable = pgTable("serial_numbers", {
  id: serial("id").primaryKey(),
  jobItemId: integer("job_item_id")
    .notNull()
    .references(() => jobItemsTable.id),
  serialNo: text("serial_no").notNull(),
  workStatus: jobWorkStatusEnum("work_status").notNull().default("queued"),
  progressPct: smallint("progress_pct").notNull().default(0),
  currentCategory: text("current_category"),
  activeShift: smallint("active_shift").notNull().default(1),
  handoverToShift: smallint("handover_to_shift"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Job Number + Serial Number is the operational identity; the same SN may
  // legitimately be used on a different JN.
  jobSerialUnique: unique("serial_numbers_serial_no_unique").on(table.jobItemId, table.serialNo),
}));

export const insertSerialNumberSchema = createInsertSchema(serialNumbersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSerialNumber = z.infer<typeof insertSerialNumberSchema>;
export type SerialNumber = typeof serialNumbersTable.$inferSelect;
