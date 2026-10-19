import { Router, type IRouter } from "express";
import { eq, ilike, or, asc, count, inArray } from "drizzle-orm";
import { db, jobItemsTable, materialsTable, serialNumbersTable, paintUsageTable, customersTable } from "@workspace/db";
import {
  ListJobItemsQueryParams,
  ListJobItemsResponse,
  CreateJobItemBody,
  CreateJobItemResponse,
  GetJobItemParams,
  GetJobItemResponse,
  UpdateJobItemParams,
  UpdateJobItemBody,
  UpdateJobItemResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";
import { computeJobItemCosts } from "../lib/costs";

const router: IRouter = Router();

function validateStages(stages: Array<{ id: string; name: string; materialId?: number | null }> | undefined) {
  if (!stages) return null;
  const ids = new Set(stages.map((stage) => stage.id.trim()));
  const names = new Set(stages.map((stage) => stage.name.trim().toLowerCase()));
  if (ids.has("") || names.has("") || ids.size !== stages.length || names.size !== stages.length) {
    return "Paint stage IDs and names must be non-empty and unique.";
  }
  if (stages.some((stage) => stage.materialId == null)) {
    return "Every additional paint stage must be linked to a material.";
  }
  return null;
}

async function validateStageMaterials(stages: Array<{ name: string; coatType: "primer" | "topcoat"; materialId?: number | null }> | undefined) {
  if (!stages?.length) return null;
  const materialIds = [...new Set(stages.map((stage) => stage.materialId).filter((id): id is number => typeof id === "number"))];
  const rows = await db.select({ id: materialsTable.id, type: materialsTable.type, isActive: materialsTable.isActive })
    .from(materialsTable).where(inArray(materialsTable.id, materialIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const stage of stages) {
    const material = stage.materialId == null ? undefined : byId.get(stage.materialId);
    if (!material || !material.isActive) return `Select an active material for the "${stage.name}" paint stage.`;
    const expectedType = stage.coatType === "primer" ? "Primer" : "Topcoat";
    if (material.type !== expectedType) return `The "${stage.name}" stage must use a ${expectedType} material.`;
  }
  return null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function serializeJobItem(row: typeof jobItemsTable.$inferSelect, serialNumberCount: number) {
  return {
    id: row.id,
    jobNo: row.jobNo,
    customerName: row.customerName,
    orderQuantity: row.orderQuantity,
    targetBasis: row.targetBasis,
    customPaintStages: row.customPaintStages,
    description: row.description,
    surfaceAreaM2: row.surfaceAreaM2,
    primerBaseL: row.primerBaseL,
    primerHrdL: row.primerHrdL,
    primerThinnerL: row.primerThinnerL,
    primerTotalL: round4(row.primerBaseL + row.primerHrdL + row.primerThinnerL),
    topcoatBaseL: row.topcoatBaseL,
    topcoatHrdL: row.topcoatHrdL,
    topcoatThinnerL: row.topcoatThinnerL,
    topcoatTotalL: round4(row.topcoatBaseL + row.topcoatHrdL + row.topcoatThinnerL),
    overconsumptionThresholdPct: row.overconsumptionThresholdPct,
    primerBaseMaterialId: row.primerBaseMaterialId,
    primerHrdMaterialId: row.primerHrdMaterialId,
    primerThinnerMaterialId: row.primerThinnerMaterialId,
    topcoatBaseMaterialId: row.topcoatBaseMaterialId,
    topcoatHrdMaterialId: row.topcoatHrdMaterialId,
    topcoatThinnerMaterialId: row.topcoatThinnerMaterialId,
    serialNumberCount,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

async function assertMaterialIdsValid(ids: Array<number | null | undefined>): Promise<string | null> {
  const uniqueIds = [...new Set(ids.filter((id): id is number => typeof id === "number"))];
  if (uniqueIds.length === 0) return null;
  const found = await db.select({ id: materialsTable.id }).from(materialsTable);
  const foundIds = new Set(found.map((f) => f.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  return missing.length > 0 ? `Unknown material id(s): ${missing.join(", ")}` : null;
}

router.get("/job-items", requireAnyRole, async (req, res): Promise<void> => {
  const parsedQuery = ListJobItemsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { search } = parsedQuery.data;

  const rows = search
    ? await db
        .select()
        .from(jobItemsTable)
        .where(or(ilike(jobItemsTable.jobNo, `%${search}%`), ilike(jobItemsTable.description, `%${search}%`)))
        .orderBy(asc(jobItemsTable.jobNo))
    : await db.select().from(jobItemsTable).orderBy(asc(jobItemsTable.jobNo));

  const counts = await db
    .select({ jobItemId: serialNumbersTable.jobItemId, value: count() })
    .from(serialNumbersTable)
    .groupBy(serialNumbersTable.jobItemId);
  const countMap = new Map(counts.map((c) => [c.jobItemId, Number(c.value)]));

  const items = rows.map((row) => serializeJobItem(row, countMap.get(row.id) ?? 0));
  res.json(ListJobItemsResponse.parse(items));
});

router.post("/job-items", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateJobItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const stageError = validateStages(parsed.data.customPaintStages);
  if (stageError) {
    res.status(400).json({ error: stageError });
    return;
  }
  const stageMaterialError = await validateStageMaterials(parsed.data.customPaintStages);
  if (stageMaterialError) {
    res.status(400).json({ error: stageMaterialError });
    return;
  }
  const customerName = parsed.data.customerName.trim();
  const normalizedCustomerName = customerName.toLowerCase();
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.normalizedName, normalizedCustomerName));
  if (!customer || !customer.isActive) {
    res.status(400).json({ error: "Select an active customer from the Customers list before creating this job." });
    return;
  }

  const materialError = await assertMaterialIdsValid([
    parsed.data.primerBaseMaterialId,
    parsed.data.primerHrdMaterialId,
    parsed.data.primerThinnerMaterialId,
    parsed.data.topcoatBaseMaterialId,
    parsed.data.topcoatHrdMaterialId,
    parsed.data.topcoatThinnerMaterialId,
  ]);
  if (materialError) {
    res.status(400).json({ error: materialError });
    return;
  }

  let created: typeof jobItemsTable.$inferSelect;
  try {
    [created] = await db.insert(jobItemsTable).values({ ...parsed.data, customerName: customer.name }).returning();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "This Job Number already exists. Search Jobs before adding it again." });
      return;
    }
    throw error;
  }
  await recordAudit({ req, action: "create", entityType: "job_item", entityId: created.id, changes: { ...parsed.data } });

  res.status(201).json(CreateJobItemResponse.parse(serializeJobItem(created, 0)));
});

router.get("/job-items/:id", requireAnyRole, async (req, res): Promise<void> => {
  const params = GetJobItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Job item not found" });
    return;
  }

  const [[serialCountRow], costs] = await Promise.all([
    db.select({ value: count() }).from(serialNumbersTable).where(eq(serialNumbersTable.jobItemId, row.id)),
    computeJobItemCosts(row),
  ]);

  res.json(GetJobItemResponse.parse({ ...serializeJobItem(row, Number(serialCountRow.value)), costs }));
});

router.patch("/job-items/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateJobItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Job item not found" });
    return;
  }
  if (parsed.data.customerName !== undefined) {
    const customerName = parsed.data.customerName.trim();
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.normalizedName, customerName.toLowerCase()));
    if (!customer || !customer.isActive) {
      res.status(400).json({ error: "Select an active customer from the Customers list." });
      return;
    }
    parsed.data.customerName = customer.name;
  }
  const stageError = validateStages(parsed.data.customPaintStages);
  if (stageError) {
    res.status(400).json({ error: stageError });
    return;
  }
  const stageMaterialError = await validateStageMaterials(parsed.data.customPaintStages);
  if (stageMaterialError) {
    res.status(400).json({ error: stageMaterialError });
    return;
  }
  if (parsed.data.customPaintStages) {
    const usages = await db.select({ actuals: paintUsageTable.customPaintActuals })
      .from(paintUsageTable).where(eq(paintUsageTable.jobItemId, before.id));
    const usedStages = usages.flatMap((usage) => usage.actuals).filter((actual) => actual.actualLiters > 0);
    if (usedStages.some((used) => !parsed.data.customPaintStages!.some((stage) =>
      stage.id === used.stageId && stage.coatType === used.coatType))) {
      res.status(409).json({ error: "A stage with recorded paint usage cannot be removed or have its paint type changed." });
      return;
    }
  }

  const materialError = await assertMaterialIdsValid([
    parsed.data.primerBaseMaterialId,
    parsed.data.primerHrdMaterialId,
    parsed.data.primerThinnerMaterialId,
    parsed.data.topcoatBaseMaterialId,
    parsed.data.topcoatHrdMaterialId,
    parsed.data.topcoatThinnerMaterialId,
  ]);
  if (materialError) {
    res.status(400).json({ error: materialError });
    return;
  }

  const [updated] = await db
    .update(jobItemsTable)
    .set(parsed.data)
    .where(eq(jobItemsTable.id, params.data.id))
    .returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "job_item", entityId: updated.id, changes });
  }

  const [serialCountRow] = await db
    .select({ value: count() })
    .from(serialNumbersTable)
    .where(eq(serialNumbersTable.jobItemId, updated.id));

  res.json(UpdateJobItemResponse.parse(serializeJobItem(updated, Number(serialCountRow.value))));
});

router.delete("/job-items/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = GetJobItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [jobItem] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, params.data.id));
  if (!jobItem) {
    res.status(404).json({ error: "Job item not found" });
    return;
  }

  const [{ value: serialCount }] = await db
    .select({ value: count() })
    .from(serialNumbersTable)
    .where(eq(serialNumbersTable.jobItemId, params.data.id));
  const [{ value: usageCount }] = await db
    .select({ value: count() })
    .from(paintUsageTable)
    .where(eq(paintUsageTable.jobItemId, params.data.id));
  if (Number(serialCount) > 0 || Number(usageCount) > 0) {
    res.status(409).json({ error: "Job item is referenced by serial numbers or paint usage. Deactivate it instead." });
    return;
  }

  await db.delete(jobItemsTable).where(eq(jobItemsTable.id, params.data.id));
  await recordAudit({ req, action: "delete", entityType: "job_item", entityId: jobItem.id, changes: { jobNo: jobItem.jobNo } });
  res.sendStatus(204);
});

export default router;
