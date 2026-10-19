import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, date, timestamp, numeric, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobItemsTable } from "./jobItems";
import { serialNumbersTable } from "./serialNumbers";
import { usersTable } from "./users";

const liters = (name: string) =>
  numeric(name, { mode: "number", precision: 12, scale: 4 }).notNull().default(0);

export type CustomPaintActual = {
  stageId: string;
  name: string;
  coatType: "primer" | "topcoat";
  targetLiters: number;
  actualLiters: number;
  materialId?: number | null;
};

/**
 * One completed paint application record per physical serial number.
 * Actuals are stored per component so the variance engine can compare each
 * component against the job item's per-unit target without losing detail.
 */
export const paintUsageTable = pgTable(
  "paint_usage",
  {
    id: serial("id").primaryKey(),
    jobItemId: integer("job_item_id")
      .notNull()
      .references(() => jobItemsTable.id),
    serialNumberId: integer("serial_number_id")
      .notNull()
      .references(() => serialNumbersTable.id),
    usageDate: date("usage_date", { mode: "date" }).notNull(),
    shift: text("shift").notNull(),
    category: text("category").notNull().default("preparation"),
    customPaintActuals: jsonb("custom_paint_actuals").$type<CustomPaintActual[]>().notNull().default(sql`'[]'::jsonb`),
    primerBaseActualL: liters("primer_base_actual_l"),
    primerHrdActualL: liters("primer_hrd_actual_l"),
    primerThinnerActualL: liters("primer_thinner_actual_l"),
    topcoatBaseActualL: liters("topcoat_base_actual_l"),
    topcoatHrdActualL: liters("topcoat_hrd_actual_l"),
    topcoatThinnerActualL: liters("topcoat_thinner_actual_l"),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("paint_usage_serial_number_unique").on(table.serialNumberId)],
);

export const insertPaintUsageSchema = createInsertSchema(paintUsageTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaintUsage = z.infer<typeof insertPaintUsageSchema>;
export type PaintUsage = typeof paintUsageTable.$inferSelect;