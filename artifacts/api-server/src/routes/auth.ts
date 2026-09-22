import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetAuthStatusResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  SetupAdminBody,
  SetupAdminResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  isUniqueViolation,
  normalizeUsername,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();
class SetupAlreadyCompletedError extends Error {}

router.get("/auth/status", async (_req, res): Promise<void> => {
  const [{ value }] = await db.select({ value: count() }).from(usersTable);
  res.json(GetAuthStatusResponse.parse({ setupRequired: Number(value) === 0 }));
});

router.post("/auth/setup", async (req, res): Promise<void> => {
  const parsed = SetupAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Serialize the one-time bootstrap across API instances.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(458219731)`);
      const [{ value }] = await tx.select({ value: count() }).from(usersTable);
      if (Number(value) > 0) {
        throw new SetupAlreadyCompletedError();
      }
      const [user] = await tx
        .insert(usersTable)
        .values({
          username: normalizeUsername(parsed.data.username),
          passwordHash: hashPassword(parsed.data.password),
          name: parsed.data.name.trim(),
          role: "admin",
          isActive: true,
        })
        .returning();
      return user;
    });
    const token = await createSession(created.id);
    setSessionCookie(res, token);
    res.status(201).json(SetupAdminResponse.parse({ user: toPublicUser(created) }));
  } catch (error) {
    if (error instanceof SetupAlreadyCompletedError) {
      res.status(409).json({ error: "Initial Admin setup has already been completed" });
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, normalizeUsername(parsed.data.username)));
  if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.json(LoginResponse.parse({ user: toPublicUser(user) }));
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  if (req.sessionTokenHash) {
    await deleteSession(req.sessionTokenHash);
  }
  clearSessionCookie(res);
  res.status(204);
  const parsed = LogoutResponse.safeParse(undefined);
  if (parsed.success) {
    res.end();
    return;
  }
  res.end();
});

export default router;