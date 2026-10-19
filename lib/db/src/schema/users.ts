import { pgTable, serial, text, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Accounts are created by the first Admin during setup or by an existing Admin;
// username is the login identity and passwords are stored only as hashes.
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "painter",
  "warehouse",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  email: text("email"),
  role: userRoleEnum("role").notNull().default("painter"),
  isPaintLeader: boolean("is_paint_leader").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [unique("users_clerk_user_id_unique").on(table.username)]);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
