import { Readable } from "stream";
import { eq } from "drizzle-orm";
import {
  RequestPaintUsagePhotoUploadUrlBody,
  RequestPaintUsagePhotoUploadUrlResponse,
} from "@workspace/api-zod";
import { db, paintUsagePhotosTable } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFileSize = 10 * 1024 * 1024;

router.post(
  "/storage/uploads/request-url",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestPaintUsagePhotoUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid image upload details" });
      return;
    }

    const { name, size, contentType } = parsed.data;
    if (size > maxFileSize || !allowedTypes.has(contentType)) {
      res.status(400).json({ error: "Use a JPEG, PNG, or WebP image up to 10 MB" });
      return;
    }

    try {
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestPaintUsagePhotoUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Could not create a private image upload URL");
      res.status(500).json({ error: "Photo upload is temporarily unavailable" });
    }
  },
);

router.get(
  "/storage/objects/*path",
  requireAnyRole,
  async (req: Request, res: Response): Promise<void> => {
    const raw = req.params.path;
    const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
    try {
      const [attachedPhoto] = await db
        .select({ id: paintUsagePhotosTable.id })
        .from(paintUsagePhotosTable)
        .where(eq(paintUsagePhotosTable.objectPath, objectPath));
      if (!attachedPhoto) {
        res.status(404).json({ error: "Photo not found" });
        return;
      }

      const file = await storage.getObjectEntityFile(objectPath);
      const response = await storage.downloadObject(file, 300);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Photo not found" });
        return;
      }
      req.log.error({ err: error }, "Could not stream a private Paint Usage photo");
      res.status(500).json({ error: "Could not load the photo" });
    }
  },
);

export default router;
