import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, authSessionsTable, usersTable, type User } from "@workspace/db";

export const SESSION_COOKIE = "ieg_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_SALT_BYTES = 16;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured for local authentication");
  return secret;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

export function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(authSessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastSeenAt: now,
  });
  return token;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function findSessionUser(token: string): Promise<{ user: User; tokenHash: string } | null> {
  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({ user: usersTable })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(and(eq(authSessionsTable.tokenHash, tokenHash), gt(authSessionsTable.expiresAt, new Date())));
  if (!row) return null;

  await db
    .update(authSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessionsTable.tokenHash, tokenHash));
  return { user: row.user, tokenHash };
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, tokenHash));
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
