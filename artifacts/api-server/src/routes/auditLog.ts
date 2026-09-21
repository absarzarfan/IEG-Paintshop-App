import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { ListAuditLogQueryParams, ListAuditLogResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/audit-log", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { entityType, limit, offset } = parsed.data;
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(entityType ? and(eq(auditLogsTable.entityType, entityType)) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  res.json(ListAuditLogResponse.parse(rows));
});

export default router;
