import { Router, type IRouter } from "express";
import { desc, count } from "drizzle-orm";
import { db, jobItemsTable, materialsTable, colorsTable, brandsTable, auditLogsTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAnyRole, async (_req, res): Promise<void> => {
  const [[jobItemCount], [materialCount], [colorCount], [brandCount], recentAuditEntries] =
    await Promise.all([
      db.select({ value: count() }).from(jobItemsTable),
      db.select({ value: count() }).from(materialsTable),
      db.select({ value: count() }).from(colorsTable),
      db.select({ value: count() }).from(brandsTable),
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(5),
    ]);

  res.json(
    GetDashboardSummaryResponse.parse({
      jobItemCount: Number(jobItemCount.value),
      materialCount: Number(materialCount.value),
      colorCount: Number(colorCount.value),
      brandCount: Number(brandCount.value),
      recentAuditEntries,
    }),
  );
});

export default router;
