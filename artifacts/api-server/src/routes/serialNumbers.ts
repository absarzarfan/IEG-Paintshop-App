import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, jobItemsTable, serialNumbersTable } from "@workspace/db";
import {
  ListJobItemSerialNumbersParams,
  ListJobItemSerialNumbersResponse,
  CreateJobItemSerialNumbersParams,
  CreateJobItemSerialNumbersBody,
  CreateJobItemSerialNumbersResponse,
  DeleteSerialNumberParams,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

const MAX_RANGE_SIZE = 5000;

/**
 * Expands a numeric range like "359" - "365" into individual serial numbers,
 * preserving a shared non-numeric prefix (e.g. "SN0359" - "SN0365") and the
 * start value's zero-padding width. Returns null when the range is invalid.
 */
function expandRange(start: string, end: string): string[] | null {
  const match = (s: string) => /^(.*?)(\d+)$/.exec(s.trim());
  const startMatch = match(start);
  const endMatch = match(end);
  if (!startMatch || !endMatch) return null;
  const [, startPrefix, startDigits] = startMatch;
  const [, endPrefix, endDigits] = endMatch;
  if (startPrefix !== endPrefix) return null;

  const startNum = parseInt(startDigits, 10);
  const endNum = parseInt(endDigits, 10);
  if (Number.isNaN(startNum) || Number.isNaN(endNum) || endNum < startNum) return null;
  if (endNum - startNum + 1 > MAX_RANGE_SIZE) return null;

  const width = startDigits.length;
  const values: string[] = [];
  for (let n = startNum; n <= endNum; n++) {
    values.push(`${startPrefix}${String(n).padStart(width, "0")}`);
  }
  return values;
}

router.get("/job-items/:jobItemId/serial-numbers", requireAnyRole, async (req, res): Promise<void> => {
  const params = ListJobItemSerialNumbersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(serialNumbersTable)
    .where(eq(serialNumbersTable.jobItemId, params.data.jobItemId))
    .orderBy(serialNumbersTable.serialNo);
  res.json(ListJobItemSerialNumbersResponse.parse(rows));
});

router.post("/job-items/:jobItemId/serial-numbers", requireAdmin, async (req, res): Promise<void> => {
  const params = CreateJobItemSerialNumbersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateJobItemSerialNumbersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [jobItem] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, params.data.jobItemId));
  if (!jobItem) {
    res.status(404).json({ error: "Job item not found" });
    return;
  }

  let values: string[];
  if (parsed.data.mode === "range") {
    if (!parsed.data.rangeStart || !parsed.data.rangeEnd) {
      res.status(400).json({ error: "rangeStart and rangeEnd are required for range mode" });
      return;
    }
    const expanded = expandRange(parsed.data.rangeStart, parsed.data.rangeEnd);
    if (!expanded) {
      res.status(400).json({
        error: "Invalid range -- start and end must share a prefix, end must not be before start, and the range must be 5000 or fewer serials",
      });
      return;
    }
    values = expanded;
  } else {
    if (!parsed.data.values || parsed.data.values.length === 0) {
      res.status(400).json({ error: "values must be a non-empty list for list mode" });
      return;
    }
    values = parsed.data.values.map((v) => v.trim()).filter(Boolean);
  }

  values = [...new Set(values)];
  if (values.length === 0) {
    res.status(400).json({ error: "No serial numbers to add" });
    return;
  }

  const created = await db
    .insert(serialNumbersTable)
    .values(values.map((serialNo) => ({ jobItemId: params.data.jobItemId, serialNo })))
    .onConflictDoNothing({ target: serialNumbersTable.serialNo })
    .returning();

  if (created.length > 0) {
    await recordAudit({
      req,
      action: "create",
      entityType: "serial_number",
      entityId: `job_item:${params.data.jobItemId}`,
      changes: { added: created.map((c) => c.serialNo) },
    });
  }

  res.status(201).json(CreateJobItemSerialNumbersResponse.parse(created));
});

router.delete("/serial-numbers/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteSerialNumberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(serialNumbersTable).where(eq(serialNumbersTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Serial number not found" });
    return;
  }

  await recordAudit({
    req,
    action: "delete",
    entityType: "serial_number",
    entityId: deleted.id,
    changes: { serialNo: deleted.serialNo, jobItemId: deleted.jobItemId },
  });

  res.sendStatus(204);
});

export default router;
