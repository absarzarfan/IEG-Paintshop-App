import { Router, type IRouter } from "express";
import { and, eq, count } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetCurrentUserResponse,
  ListUsersResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  res.json(GetCurrentUserResponse.parse(req.appUser));
});

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(ListUsersResponse.parse(rows));
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

  const [updated] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "user", entityId: updated.id, changes });
  }

  res.json(UpdateUserResponse.parse(updated));
});

export default router;
