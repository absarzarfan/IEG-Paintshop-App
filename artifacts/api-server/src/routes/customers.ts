import { Router, type IRouter } from "express";
import { asc, count, eq, sql } from "drizzle-orm";
import { customersTable, db, jobItemsTable } from "@workspace/db";
import {
  CreateCustomerBody,
  CreateCustomerResponse,
  ListCustomersResponse,
  UpdateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { diffFields, recordAudit } from "../lib/audit";

const router: IRouter = Router();

function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase();
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

router.get("/customers", requireAnyRole, async (_req, res): Promise<void> => {
  const [customers, jobCounts] = await Promise.all([
    db.select().from(customersTable).orderBy(asc(customersTable.name)),
    db.select({ name: jobItemsTable.customerName, count: count() })
      .from(jobItemsTable)
      .groupBy(jobItemsTable.customerName),
  ]);

  const countByName = new Map<string, number>();
  for (const row of jobCounts) {
    const key = normalizeCustomerName(row.name);
    if (key) countByName.set(key, (countByName.get(key) ?? 0) + Number(row.count));
  }
  res.json(ListCustomersResponse.parse(customers.map((customer) => ({
    ...customer,
    jobCount: countByName.get(customer.normalizedName) ?? 0,
  }))));
});

router.post("/customers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) {
    res.status(400).json({ error: "Customer name is required." });
    return;
  }

  try {
    const [created] = await db.insert(customersTable).values({ name, normalizedName }).returning();
    await recordAudit({ req, action: "create", entityType: "customer", entityId: created.id, changes: { name } });
    res.status(201).json(CreateCustomerResponse.parse({ ...created, jobCount: 0 }));
  } catch (error) {
    if (isUniqueConflict(error)) {
      res.status(409).json({ error: "A customer with this name already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/customers/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [before] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Customer not found." });
    return;
  }

  const changes: { name?: string; normalizedName?: string; isActive?: boolean } = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    const normalizedName = normalizeCustomerName(name);
    if (!normalizedName) {
      res.status(400).json({ error: "Customer name is required." });
      return;
    }
    if (name !== before.name) {
      const [references] = await db.select({ value: count() })
        .from(jobItemsTable)
        .where(sql`lower(${jobItemsTable.customerName}) = ${before.normalizedName}`);
      if (Number(references.value) > 0) {
        res.status(409).json({ error: "This customer is already linked to jobs. Deactivate it instead of renaming it." });
        return;
      }
      changes.name = name;
      changes.normalizedName = normalizedName;
    }
  }
  if (parsed.data.isActive !== undefined) changes.isActive = parsed.data.isActive;

  try {
    const [updated] = Object.keys(changes).length
      ? await db.update(customersTable).set(changes).where(eq(customersTable.id, before.id)).returning()
      : [before];
    const auditChanges = diffFields(before, { name: changes.name, isActive: changes.isActive });
    if (Object.keys(auditChanges).length) {
      await recordAudit({ req, action: "update", entityType: "customer", entityId: updated.id, changes: auditChanges });
    }
    const [references] = await db.select({ value: count() })
      .from(jobItemsTable)
      .where(sql`lower(${jobItemsTable.customerName}) = ${updated.normalizedName}`);
    res.json(UpdateCustomerResponse.parse({ ...updated, jobCount: Number(references.value) }));
  } catch (error) {
    if (isUniqueConflict(error)) {
      res.status(409).json({ error: "A customer with this name already exists." });
      return;
    }
    throw error;
  }
});

export default router;
