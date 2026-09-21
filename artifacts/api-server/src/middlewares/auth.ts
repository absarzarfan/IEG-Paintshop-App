import type { NextFunction, Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      /** The app-level user record for the signed-in Clerk session. Set by attachAppUser. */
      appUser?: User;
    }
  }
}

/** Rejects requests with no Clerk session at all. Mount before attachAppUser. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Loads (or just-in-time provisions) the app user record for the signed-in
 * Clerk session and attaches it as req.appUser. The very first user ever to
 * sign in becomes admin; everyone after that starts as "pending" with no
 * permissions until an admin assigns a real role. Never rejects based on
 * role or active status -- that's requireRole's job -- so pending/deactivated
 * users can still load /users/me and see their own status.
 */
export async function attachAppUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
  if (existing) {
    req.appUser = existing;
    next();
    return;
  }

  const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  const role = anyUser ? "pending" : "admin";

  let name: string | null = null;
  let email: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
    email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? null;
  } catch (err) {
    req.log?.warn({ err }, "Failed to fetch Clerk profile during user provisioning");
  }

  const [created] = await db
    .insert(usersTable)
    .values({ clerkUserId, name, email, role })
    .onConflictDoNothing({ target: usersTable.clerkUserId })
    .returning();

  if (created) {
    req.appUser = created;
    next();
    return;
  }

  // Another concurrent request for the same brand-new user won the race.
  const [raced] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
  if (!raced) {
    res.status(500).json({ error: "Failed to provision user" });
    return;
  }
  req.appUser = raced;
  next();
}

export const ACTIVE_ROLES = ["admin", "painter", "warehouse", "supervisor", "procurement"] as const;
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
