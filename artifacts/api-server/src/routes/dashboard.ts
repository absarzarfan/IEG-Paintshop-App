import { Router, type IRouter } from "express";
import { and, count, desc, eq, gt, lt } from "drizzle-orm";
import {
  db,
  authSessionsTable,
  jobItemsTable,
  jobWorkEventsTable,
  serialNumbersTable,
  usersTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAnyRole } from "../middlewares/auth";
import { serializeWorkflow } from "./jobWorkflow";
import { aggregateOrderPerformance } from "../lib/orderPerformance";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAnyRole, async (_req, res): Promise<void> => {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const onlineSince = new Date(now.getTime() - 5 * 60 * 1000);
  const workingSince = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const [
    [completedTodayCount],
    [newJobsTodayCount],
  ] = await Promise.all([
    db.select({ value: count() }).from(jobWorkEventsTable).where(and(
      eq(jobWorkEventsTable.eventType, "completed"),
      gt(jobWorkEventsTable.createdAt, dayStart),
    )),
    db.select({ value: count() }).from(jobItemsTable).where(gt(jobItemsTable.createdAt, dayStart)),
  ]);

  const [jobs, serials, onlineSessions, workingEvents] = await Promise.all([
    db.select().from(jobItemsTable),
    db.select({ id: serialNumbersTable.id }).from(serialNumbersTable),
    db.select({
      id: usersTable.id,
      username: usersTable.username,
      name: usersTable.name,
      lastSeenAt: authSessionsTable.lastSeenAt,
    }).from(authSessionsTable)
      .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
      .where(and(eq(usersTable.role, "painter"), eq(usersTable.isActive, true), gt(authSessionsTable.lastSeenAt, onlineSince)))
      .orderBy(desc(authSessionsTable.lastSeenAt)),
    db.select({
      userId: jobWorkEventsTable.actorUserId,
      jobNo: jobItemsTable.jobNo,
      serialNo: serialNumbersTable.serialNo,
      customerName: jobItemsTable.customerName,
      createdAt: jobWorkEventsTable.createdAt,
    }).from(jobWorkEventsTable)
      .innerJoin(serialNumbersTable, eq(jobWorkEventsTable.serialNumberId, serialNumbersTable.id))
      .innerJoin(jobItemsTable, eq(serialNumbersTable.jobItemId, jobItemsTable.id))
      .where(and(
        eq(serialNumbersTable.workStatus, "ongoing"),
        gt(jobWorkEventsTable.createdAt, workingSince),
      ))
      .orderBy(desc(jobWorkEventsTable.createdAt)),
  ]);

  const onlineUsers = new Map<number, { username: string; name: string | null; lastSeenAt: Date }>();
  for (const session of onlineSessions) {
    if (!onlineUsers.has(session.id)) {
      onlineUsers.set(session.id, {
        username: session.username,
        name: session.name,
        lastSeenAt: session.lastSeenAt,
      });
    }
  }

  const currentWorkByUser = new Map<number, {
    jobNo: string;
    serialNo: string;
    customerName: string;
  }>();
  for (const event of workingEvents) {
    if (event.userId !== null && onlineUsers.has(event.userId) && !currentWorkByUser.has(event.userId)) {
      currentWorkByUser.set(event.userId, {
        jobNo: event.jobNo,
        serialNo: event.serialNo,
        customerName: event.customerName,
      });
    }
  }

  const paintMixerStatuses = [...onlineUsers.entries()]
    .map(([userId, user]) => {
      const currentWork = currentWorkByUser.get(userId);
      return {
        userId,
        name: user.name?.trim() || user.username,
        state: currentWork ? "working" as const : "idling" as const,
        lastSeenAt: user.lastSeenAt,
        currentJobNo: currentWork?.jobNo ?? null,
        currentSerialNo: currentWork?.serialNo ?? null,
        customerName: currentWork?.customerName ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const online = paintMixerStatuses.length;
  const working = paintMixerStatuses.filter((mixer) => mixer.state === "working").length;

  const workflow = await Promise.all(serials.map((serial) => serializeWorkflow(serial.id)));
  const workflowItems = workflow.filter((row) => row !== null);
  const queuedItems = workflowItems
    .filter((row) => row.workStatus === "queued")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const delayedCutoff = now.getTime() - 4 * 60 * 60 * 1000;
  const delayedJobs = queuedItems.filter((row) => new Date(row.createdAt).getTime() <= delayedCutoff);
  const waitingJobs = queuedItems.filter((row) => new Date(row.createdAt).getTime() > delayedCutoff);
  const shipmentJobs = workflowItems
    .filter((row) => row.workStatus === "shipment")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const customers = aggregateOrderPerformance(jobs, workflowItems);

  res.json(GetDashboardSummaryResponse.parse({
    queuedCount: queuedItems.length,
    ongoingCount: workflowItems.filter((row) => row.workStatus === "ongoing").length,
    completedTodayCount: Number(completedTodayCount.value),
    shipmentPendingCount: shipmentJobs.length,
    paintMixersOnlineCount: online,
    paintMixersWorkingCount: working,
    paintMixersIdlingCount: Math.max(0, online - working),
    newJobsTodayCount: Number(newJobsTodayCount.value),
    delayedCount: delayedJobs.length,
    customers,
    delayedJobs: delayedJobs.slice(0, 8),
    waitingJobs: waitingJobs.slice(0, 8),
    shipmentJobs: shipmentJobs.slice(0, 8),
    paintMixerStatuses,
  }));
});

export default router;
