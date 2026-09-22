import type { NextFunction, Request, Response } from "express";
import { findSessionUser } from "../lib/auth";
import type { User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      /** The app-level user record for the signed-in internal session. */
      appUser?: User;
      sessionTokenHash?: string;
    }
  }
}

/** Loads the user attached to the signed internal session cookie. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = req.cookies?.ieg_session;
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : undefined;
  const token = cookieToken || bearer;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const session = await findSessionUser(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.appUser = session.user;
  req.sessionTokenHash = session.tokenHash;
  next();
}

export const ACTIVE_ROLES = ["admin", "painter", "warehouse"] as const;
export type ActiveRole = (typeof ACTIVE_ROLES)[number];

/** Requires the signed-in user to be active and hold one of the given roles. */
export function requireRole(...roles: ActiveRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const appUser = req.appUser;
    if (!appUser || !appUser.isActive || !roles.includes(appUser.role as ActiveRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Any real (non-pending), active role -- used for read access to shared master data. */
export const requireAnyRole = requireRole(...ACTIVE_ROLES);
export const requireAdmin = requireRole("admin");
