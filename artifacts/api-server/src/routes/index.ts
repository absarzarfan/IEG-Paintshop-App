import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import brandsRouter from "./brands";
import customersRouter from "./customers";
import colorsRouter from "./colors";
import materialsRouter from "./materials";
import jobItemsRouter from "./jobItems";
import serialNumbersRouter from "./serialNumbers";
import paintUsageRouter from "./paintUsage";
import stockRouter from "./stock";
import auditLogRouter from "./auditLog";
import dashboardRouter from "./dashboard";
import jobWorkflowRouter from "./jobWorkflow";
import paintUsagePhotosRouter from "./paintUsagePhotos";
import storageRouter from "./storage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

// Every route below requires a signed-in internal session and has req.appUser
// available. Per-route requireRole/requireAdmin handles authorization.
router.use(requireAuth);

router.use(usersRouter);
router.use(brandsRouter);
router.use(customersRouter);
router.use(colorsRouter);
router.use(materialsRouter);
router.use(jobItemsRouter);
router.use(serialNumbersRouter);
router.use(paintUsageRouter);
router.use(paintUsagePhotosRouter);
router.use(storageRouter);
router.use(stockRouter);
router.use(jobWorkflowRouter);
router.use(auditLogRouter);
router.use(dashboardRouter);

export default router;
