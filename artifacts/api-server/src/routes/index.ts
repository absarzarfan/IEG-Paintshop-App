import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import brandsRouter from "./brands";
import colorsRouter from "./colors";
import materialsRouter from "./materials";
import jobItemsRouter from "./jobItems";
import serialNumbersRouter from "./serialNumbers";
import auditLogRouter from "./auditLog";
import dashboardRouter from "./dashboard";
import { requireAuth, attachAppUser } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);

// Every route below requires a signed-in Clerk session and has req.appUser
// available (JIT-provisioned on first login). Per-route requireRole/
// requireAdmin calls handle authorization from there.
router.use(requireAuth, attachAppUser);

router.use(usersRouter);
router.use(brandsRouter);
router.use(colorsRouter);
router.use(materialsRouter);
router.use(jobItemsRouter);
router.use(serialNumbersRouter);
router.use(auditLogRouter);
router.use(dashboardRouter);

export default router;
