import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";

const liters = (name: string) =>
  numeric(name, { mode: "number", precision: 12, scale: 4 }).notNull().default(0);

export type CustomPaintStage = {
  id: string;
  name: string;
  coatType: "primer" | "topcoat";
  targetLitersTotal: number;
  materialId?: number | null;
};

// Paint targets are stored per unit (per job item / per serial number), in
// liters. Cost is always derived at read time from materialPrices -- never
// stored here -- so historical price changes never silently corrupt a job
// item's numbers.
export const jobItemsTable = pgTable("job_items", {
  id: serial("id").primaryKey(),
  jobNo: text("job_no").notNull().unique(),
  customerName: text("customer_name").notNull().default(""),
  orderQuantity: integer("order_quantity").notNull().default(1),
  targetBasis: text("target_basis").notNull().default("per_unit"),
  customPaintStages: jsonb("custom_paint_stages").$type<CustomPaintStage[]>().notNull().default(sql`'[]'::jsonb`),
  description: text("description").notNull(),
  surfaceAreaM2: numeric("surface_area_m2", { mode: "number", precision: 12, scale: 4 }),
  primerBaseL: liters("primer_base_l"),
  primerHrdL: liters("primer_hrd_l"),
  primerThinnerL: liters("primer_thinner_l"),
  topcoatBaseL: liters("topcoat_base_l"),
  topcoatHrdL: liters("topcoat_hrd_l"),
  topcoatThinnerL: liters("topcoat_thinner_l"),
  // Null falls back to a 10% global default at variance-calculation time (Sprint 2+).
  overconsumptionThresholdPct: numeric("overconsumption_threshold_pct", {
    mode: "number",
    precision: 5,
    scale: 2,
  }),
  primerBaseMaterialId: integer("primer_base_material_id").references(() => materialsTable.id),
  primerHrdMaterialId: integer("primer_hrd_material_id").references(() => materialsTable.id),
  primerThinnerMaterialId: integer("primer_thinner_material_id").references(() => materialsTable.id),
  topcoatBaseMaterialId: integer("topcoat_base_material_id").references(() => materialsTable.id),
  topcoatHrdMaterialId: integer("topcoat_hrd_material_id").references(() => materialsTable.id),
  topcoatThinnerMaterialId: integer("topcoat_thinner_material_id").references(() => materialsTable.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertJobItemSchema = createInsertSchema(jobItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJobItem = z.infer<typeof insertJobItemSchema>;
export type JobItem = typeof jobItemsTable.$inferSelect;
