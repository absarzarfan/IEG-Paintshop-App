import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authSessionsTable = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique("auth_sessions_token_hash_key").on(table.tokenHash)]);

export type AuthSession = typeof authSessionsTable.$inferSelect;