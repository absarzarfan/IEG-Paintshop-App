import { Router, type IRouter } from "express";
import { and, eq, count } from "drizzle-orm";
import { db, usersTable, authSessionsTable } from "@workspace/db";
import {
  CreateUserBody,
  CreateUserResponse,
  GetCurrentUserResponse,
  ListUsersResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";
import { hashPassword, isUniqueViolation, normalizeUsername, toPublicUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  res.json(GetCurrentUserResponse.parse(req.appUser ? toPublicUser(req.appUser) : null));
});

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(ListUsersResponse.parse(rows.map(toPublicUser)));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.isPaintLeader && parsed.data.role !== "painter") {
    res.status(400).json({ error: "Only Paint Mixer accounts can be designated as shipment leaders" });
    return;
  }

  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        username: normalizeUsername(parsed.data.username),
        passwordHash: hashPassword(parsed.data.password),
        name: parsed.data.name.trim(),
        email: parsed.data.email ?? null,
        role: parsed.data.role,
        isPaintLeader: parsed.data.isPaintLeader ?? false,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();

    await recordAudit({
      req,
      action: "create",
      entityType: "user",
      entityId: created.id,
      changes: { username: created.username, role: created.role },
    });
    res.status(201).json(CreateUserResponse.parse(toPublicUser(created)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    throw error;
  }
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const nextRole = parsed.data.role ?? before.role;
  const nextIsPaintLeader = parsed.data.isPaintLeader ?? before.isPaintLeader;
  if (nextIsPaintLeader && nextRole !== "painter") {
    res.status(400).json({ error: "Only Paint Mixer accounts can be designated as shipment leaders" });
    return;
  }

  const willLoseAdmin =
    before.role === "admin" &&
    before.isActive &&
    ((parsed.data.role !== undefined && parsed.data.role !== "admin") ||
      (parsed.data.isActive !== undefined && !parsed.data.isActive));

  if (willLoseAdmin) {
    const [{ value: activeAdminCount }] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true)));
    if (Number(activeAdminCount) <= 1) {
      res.status(400).json({ error: "Cannot remove the last active admin" });
      return;
    }
  }

  const { password, ...accountChanges } = parsed.data;
  const updateValues = {
    ...accountChanges,
    ...(password ? { passwordHash: hashPassword(password) } : {}),
  };
  const [updated] = await db.update(usersTable).set(updateValues).where(eq(usersTable.id, params.data.id)).returning();

  const changes = diffFields(before, {
    ...accountChanges,
    ...(password ? { password: "[reset by admin]" } : {}),
  });
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "user", entityId: updated.id, changes });
  }

  res.json(UpdateUserResponse.parse(toPublicUser(updated)));
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (req.appUser?.id === params.data.id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  const [before] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (before.role === "admin" && before.isActive) {
    const [{ value: activeAdminCount }] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true)));
    if (Number(activeAdminCount) <= 1) {
      res.status(400).json({ error: "Cannot delete the last active admin" });
      return;
    }
  }

  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, before.id));
  await db.delete(usersTable).where(eq(usersTable.id, before.id));
  await recordAudit({ req, action: "delete", entityType: "user", entityId: before.id, changes: { username: before.username, role: before.role } });
  res.sendStatus(204);
});

export default router;
