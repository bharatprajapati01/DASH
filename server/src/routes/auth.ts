import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../auth.js";
import { HttpError, clean, parse, wrap } from "../http.js";
import { env } from "../env.js";
import { USER_PUBLIC } from "../constants.js";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
});

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password needs a letter")
  .regex(/[0-9]/, "Password needs a number");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordRule,
  workspaceName: z.string().trim().min(2).max(80).optional(),
});

authRouter.post(
  "/register",
  limiter,
  wrap(async (req, res) => {
    const body = parse(registerSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new HttpError(409, "An account with this email already exists", "EMAIL_TAKEN");
    const passwordHash = await bcrypt.hash(body.password, 12);
    const name = clean(body.name);
    const user = await prisma.user.create({
      data: {
        name,
        email: body.email,
        passwordHash,
        avatar: pickColor(body.email),
        jobTitle: "Team Member",
      },
    });
    await prisma.workspace.create({
      data: {
        name: clean(body.workspaceName ?? `${name.split(" ")[0]}'s Workspace`),
        ownerId: user.id,
        members: { create: { userId: user.id, role: "ADMIN" } },
      },
    });
    setSessionCookie(res, user.id);
    res.status(201).json({ user: await publicUser(user.id) });
  }),
);

authRouter.post(
  "/login",
  limiter,
  wrap(async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Compare against a dummy hash when the user is missing so timing does not reveal which emails exist.
    const hash = user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5zXq5v5J3m7Z5v5Zl1kq3e9R0dYJm6a";
    const ok = await bcrypt.compare(body.password, hash);
    if (!user || !ok) throw new HttpError(401, "Incorrect email or password", "BAD_CREDENTIALS");
    setSessionCookie(res, user.id);
    res.json({ user: await publicUser(user.id) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const user = await publicUser(req.userId!);
    if (!user) {
      clearSessionCookie(res);
      throw new HttpError(401, "Please sign in to continue", "UNAUTHENTICATED");
    }
    res.json({ user });
  }),
);

authRouter.post(
  "/forgot-password",
  limiter,
  wrap(async (req, res) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devResetUrl: string | undefined;
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      const url = `${env.clientOrigins[0]}/reset-password?token=${token}`;
      // No mail provider is configured: the link is logged for development and returned only outside production.
      console.log(`[password reset] ${email}: ${url}`);
      if (!env.isProd) devResetUrl = url;
    }
    // Same response whether or not the account exists.
    res.json({ ok: true, message: "If that email has an account, a reset link is on its way.", devResetUrl });
  }),
);

authRouter.post(
  "/reset-password",
  limiter,
  wrap(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20), password: passwordRule }), req.body);
    const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, "This reset link is invalid or has expired", "BAD_TOKEN");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  }),
);

authRouter.patch(
  "/profile",
  requireAuth,
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        jobTitle: z.string().trim().max(80).optional(),
        avatar: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(body.name ? { name: clean(body.name) } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: clean(body.jobTitle) } : {}),
        ...(body.avatar ? { avatar: clean(body.avatar) } : {}),
      },
    });
    res.json({ user: await publicUser(req.userId!) });
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  limiter,
  wrap(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordRule }), req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Current password is incorrect", "BAD_CREDENTIALS");
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } });
    res.json({ ok: true });
  }),
);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const AVATAR_COLORS = ["#FF896D", "#FFE735", "#C7FF24", "#D9D1FF", "#DDF4FF"];
export function pickColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

async function publicUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: USER_PUBLIC });
}
