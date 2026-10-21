import { pgTable, serial, integer, text, date, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { stockMovementsTable } from "./stockMovements";
import { usersTable } from "./users";

export const stockTakesTable = pgTable("stock_takes", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  lotNo: text("lot_no"),
  expiryDate: date("expiry_date", { mode: "string" }),
  systemQuantityL: numeric("system_quantity_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  physicalQuantityL: numeric("physical_quantity_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  varianceL: numeric("variance_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  movementId: integer("movement_id").references(() => stockMovementsTable.id),
  notes: text("notes"),
  countedByUserId: integer("counted_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stock_takes_material_created_idx").on(table.materialId, table.createdAt),
]);

export const insertStockTakeSchema = createInsertSchema(stockTakesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStockTake = z.infer<typeof insertStockTakeSchema>;
export type StockTake = typeof stockTakesTable.$inferSelect;
