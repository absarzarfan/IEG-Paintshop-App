import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobItemsTable } from "./jobItems";

// serialNo is globally unique -- a physical unit's serial number should never
// be registered under more than one job item.
export const serialNumbersTable = pgTable("serial_numbers", {
  id: serial("id").primaryKey(),
  jobItemId: integer("job_item_id")
    .notNull()
    .references(() => jobItemsTable.id),
  serialNo: text("serial_no").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSerialNumberSchema = createInsertSchema(serialNumbersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSerialNumber = z.infer<typeof insertSerialNumberSchema>;
export type SerialNumber = typeof serialNumbersTable.$inferSelect;
