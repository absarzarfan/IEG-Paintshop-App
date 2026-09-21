import { pgTable, serial, integer, text, date, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { usersTable } from "./users";

// Append-only: a new price is always a new row, never an edit to an old one,
// so historical cost derivations stay accurate.
export const materialPricesTable = pgTable("material_prices", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  unitPrice: numeric("unit_price", { mode: "number", precision: 14, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  // mode: "date" (not "string") to match the generated Zod schema, which
  // coerces OpenAPI format:date fields to JS Date via zod.coerce.date().
  effectiveDate: date("effective_date", { mode: "date" }).notNull(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialPriceSchema = createInsertSchema(materialPricesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMaterialPrice = z.infer<typeof insertMaterialPriceSchema>;
export type MaterialPrice = typeof materialPricesTable.$inferSelect;
