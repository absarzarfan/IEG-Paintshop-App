import { pgEnum, pgTable, serial, integer, text, date, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { usersTable } from "./users";

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["in", "out", "adjustment"]);

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  movementType: stockMovementTypeEnum("movement_type").notNull(),
  // Positive values are used for receipts/issues; adjustments may be positive or negative.
  quantityL: numeric("quantity_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  lotNo: text("lot_no"),
  expiryDate: date("expiry_date", { mode: "date" }),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;