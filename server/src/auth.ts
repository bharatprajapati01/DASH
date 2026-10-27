import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { HttpError } from "./http.js";
import { prisma } from "./db.js";

export const COOKIE_NAME = "fibnk_session";
const SESSION_DAYS = 7;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(COOKIE_NAME, signSession(userId), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? "none" : "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: env.isProd, sameSite: env.isProd ? "none" : "lax", path: "/" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = verifySession(req.cookies?.[COOKIE_NAME]);
  if (!userId) return next(new HttpError(401, "Please sign in to continue", "UNAUTHENTICATED"));
  req.userId = userId;
  // Throttled "last seen" touch (fire and forget).
  touchUser(userId);
  next();
}

const lastTouch = new Map<string, number>();
function touchUser(userId: string) {
  const now = Date.now();
  if ((lastTouch.get(userId) ?? 0) > now - 60_000) return;
  lastTouch.set(userId, now);
  prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
}
