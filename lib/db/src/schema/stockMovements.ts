import { pgEnum, pgTable, serial, integer, text, date, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { paintUsageTable } from "./paintUsage";
import { usersTable } from "./users";

// Keep "adjustment" for legacy rows; all newly recorded returns use the explicit return type.
export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["in", "out", "adjustment", "return_to_stock"]);

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  movementType: stockMovementTypeEnum("movement_type").notNull(),
  // Incoming and return quantities are positive; issues are stored positive and signed on read.
  quantityL: numeric("quantity_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  lotNo: text("lot_no"),
  expiryDate: date("expiry_date", { mode: "date" }),
  notes: text("notes"),
  sourcePaintUsageId: integer("source_paint_usage_id").references(() => paintUsageTable.id),
  usageComponent: text("usage_component"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("stock_movements_usage_source_idx").on(table.sourcePaintUsageId, table.usageComponent)]);

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;