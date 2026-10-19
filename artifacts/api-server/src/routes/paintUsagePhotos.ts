import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreatePaintUsagePhotoBody,
  CreatePaintUsagePhotoParams,
  CreatePaintUsagePhotoResponse,
  ListPaintUsagePhotosParams,
  ListPaintUsagePhotosResponse,
} from "@workspace/api-zod";
import {
  db,
  paintUsagePhotosTable,
  paintUsageTable,
  usersTable,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFileSize = 10 * 1024 * 1024;

async function serializePhoto(photoId: number) {
  const [row] = await db
    .select({ photo: paintUsagePhotosTable, uploader: usersTable })
    .from(paintUsagePhotosTable)
    .leftJoin(usersTable, eq(paintUsagePhotosTable.uploadedByUserId, usersTable.id))
    .where(eq(paintUsagePhotosTable.id, photoId));
  if (!row) return null;
  return {
    ...row.photo,
    uploadedByName: row.uploader?.name ?? row.uploader?.email ?? null,
  };
}

router.get(
  "/paint-usage/:id/photos",
  requireAnyRole,
  async (req, res): Promise<void> => {
    const parsed = ListPaintUsagePhotosParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Paint Usage ID" });
      return;
    }
    const [usage] = await db
      .select({ id: paintUsageTable.id })
      .from(paintUsageTable)
      .where(eq(paintUsageTable.id, parsed.data.id));
    if (!usage) {
      res.status(404).json({ error: "Paint Usage record not found" });
      return;
    }

    const rows = await db
      .select({ photo: paintUsagePhotosTable, uploader: usersTable })
      .from(paintUsagePhotosTable)
      .leftJoin(usersTable, eq(paintUsagePhotosTable.uploadedByUserId, usersTable.id))
      .where(eq(paintUsagePhotosTable.paintUsageId, usage.id))
      .orderBy(paintUsagePhotosTable.createdAt);
    res.json(
      ListPaintUsagePhotosResponse.parse(
        rows.map(({ photo, uploader }) => ({
          ...photo,
          uploadedByName: uploader?.name ?? uploader?.email ?? null,
        })),
      ),
    );
  },
);

router.post(
  "/paint-usage/:id/photos",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = CreatePaintUsagePhotoParams.safeParse(req.params);
    const body = CreatePaintUsagePhotoBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid photo details" });
      return;
    }
    const [usage] = await db
      .select({ id: paintUsageTable.id })
      .from(paintUsageTable)
      .where(eq(paintUsageTable.id, params.data.id));
    if (!usage) {
      res.status(404).json({ error: "Paint Usage record not found" });
      return;
    }

    const { objectPath, label, originalName } = body.data;
    if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/i.test(objectPath)) {
      res.status(400).json({ error: "Invalid private upload path" });
      return;
    }

    try {
      const file = await objectStorage.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      const size = Number(metadata.size ?? 0);
      if (!allowedTypes.has(contentType) || size < 1 || size > maxFileSize) {
        res.status(400).json({ error: "Only JPEG, PNG, or WebP images up to 10 MB are allowed" });
        return;
      }

      const [existing] = await db
        .select({ id: paintUsagePhotosTable.id })
        .from(paintUsagePhotosTable)
        .where(
          and(
            eq(paintUsagePhotosTable.paintUsageId, usage.id),
            eq(paintUsagePhotosTable.objectPath, objectPath),
          ),
        );
      if (existing) {
        res.status(409).json({ error: "This photo is already attached" });
        return;
      }

      const [created] = await db
        .insert(paintUsagePhotosTable)
        .values({
          paintUsageId: usage.id,
          objectPath,
          label,
          originalName,
          contentType,
          uploadedByUserId: req.appUser?.id ?? null,
        })
        .returning({ id: paintUsagePhotosTable.id });
      if (!created) {
        res.status(500).json({ error: "Could not save photo details" });
        return;
      }
      const photo = await serializePhoto(created.id);
      res.status(201).json(CreatePaintUsagePhotoResponse.parse(photo));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "Uploaded image was not found" });
        return;
      }
      req.log.error({ err: error }, "Could not attach a Paint Usage photo");
      res.status(500).json({ error: "Could not save photo details" });
    }
  },
);

export default router;
