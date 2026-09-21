import { pgTable, serial, integer, text, boolean, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brandsTable } from "./brands";

export const materialTypeEnum = pgEnum("material_type", [
  "Primer",
  "Topcoat",
  "Hardener",
  "Thinner",
  "Activator",
]);

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id")
    .notNull()
    .references(() => brandsTable.id),
  description: text("description").notNull(),
  type: materialTypeEnum("type").notNull(),
  packagingSizeL: numeric("packaging_size_l", { mode: "number", precision: 12, scale: 4 }).notNull(),
  color: text("color"),
  // Liters of on-hand stock with no movement past which a lot is flagged dead
  // stock (Sprint 3+ alerting). 0 means not configured yet.
  deadStockThreshold: numeric("dead_stock_threshold", { mode: "number", precision: 12, scale: 4 })
    .notNull()
    .default(0),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
