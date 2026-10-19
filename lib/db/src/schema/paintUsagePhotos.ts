import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { paintUsageTable } from "./paintUsage";
import { usersTable } from "./users";

export const paintUsagePhotosTable = pgTable(
  "paint_usage_photos",
  {
    id: serial("id").primaryKey(),
    paintUsageId: integer("paint_usage_id")
      .notNull()
      .references(() => paintUsageTable.id),
    objectPath: text("object_path").notNull(),
    label: text("label").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("paint_usage_photos_object_path_unique").on(table.objectPath)],
);

export type PaintUsagePhoto = typeof paintUsagePhotosTable.$inferSelect;
