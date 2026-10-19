import { Router, type IRouter } from "express";
import { and, count, desc, eq, gt, lt } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  authSessionsTable,
  brandsTable,
  colorsTable,
  jobItemsTable,
  jobWorkEventsTable,
  materialsTable,
  serialNumbersTable,
  usersTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAnyRole, async (_req, res): Promise<void> => {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const onlineSince = new Date(now.getTime() - 5 * 60 * 1000);
  const workingSince = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const [
    [jobItemCount],
    [materialCount],
    [colorCount],
    [brandCount],
    recentAuditEntries,
    [queuedCount],
    [ongoingCount],
    [shipmentPendingCount],
    [completedTodayCount],
    [newJobsTodayCount],
    [delayedCount],
    onlineUsers,
    workingEvents,
  ] = await Promise.all([
    db.select({ value: count() }).from(jobItemsTable),
    db.select({ value: count() }).from(materialsTable),
    db.select({ value: count() }).from(colorsTable),
    db.select({ value: count() }).from(brandsTable),
    db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(5),
    db.select({ value: count() }).from(serialNumbersTable).where(eq(serialNumbersTable.workStatus, "queued")),
    db.select({ value: count() }).from(serialNumbersTable).where(eq(serialNumbersTable.workStatus, "ongoing")),
    db.select({ value: count() }).from(serialNumbersTable).where(eq(serialNumbersTable.workStatus, "shipment")),
    db.select({ value: count() }).from(jobWorkEventsTable).where(and(
      eq(jobWorkEventsTable.eventType, "completed"),
      gt(jobWorkEventsTable.createdAt, dayStart),
    )),
    db.select({ value: count() }).from(jobItemsTable).where(gt(jobItemsTable.createdAt, dayStart)),
    db.select({ value: count() }).from(serialNumbersTable).where(and(
      eq(serialNumbersTable.workStatus, "queued"),
      lt(serialNumbersTable.createdAt, new Date(now.getTime() - 4 * 60 * 60 * 1000)),
    )),
    db.selectDistinct({ id: usersTable.id }).from(authSessionsTable)
      .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
      .where(and(eq(usersTable.role, "painter"), eq(usersTable.isActive, true), gt(authSessionsTable.lastSeenAt, onlineSince))),
    db.selectDistinct({ id: jobWorkEventsTable.actorUserId }).from(jobWorkEventsTable)
      .innerJoin(serialNumbersTable, eq(jobWorkEventsTable.serialNumberId, serialNumbersTable.id))
      .where(and(eq(serialNumbersTable.workStatus, "ongoing"), gt(jobWorkEventsTable.createdAt, workingSince))),
  ]);

  const onlineIds = new Set(onlineUsers.map((row) => row.id));
  const workingIds = new Set(
    workingEvents
      .map((row) => row.id)
      .filter((id): id is number => id !== null && onlineIds.has(id)),
  );
  const online = onlineIds.size;
  const working = workingIds.size;

  res.json(GetDashboardSummaryResponse.parse({
    jobItemCount: Number(jobItemCount.value),
    queuedCount: Number(queuedCount.value),
    ongoingCount: Number(ongoingCount.value),
    completedTodayCount: Number(completedTodayCount.value),
    shipmentPendingCount: Number(shipmentPendingCount.value),
    paintMixersOnlineCount: online,
    paintMixersWorkingCount: working,
    paintMixersIdlingCount: Math.max(0, online - working),
    newJobsTodayCount: Number(newJobsTodayCount.value),
    delayedCount: Number(delayedCount.value),
    materialCount: Number(materialCount.value),
    colorCount: Number(colorCount.value),
    brandCount: Number(brandCount.value),
    recentAuditEntries,
  }));
});

export default router;
