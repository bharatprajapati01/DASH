import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { notFound, parse, wrap } from "../http.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  "/",
  wrap(async (req, res) => {
    const { limit, unreadOnly } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), unreadOnly: z.enum(["true", "false"]).optional() }),
      req.query,
    );
    const where = { userId: req.userId!, ...(unreadOnly === "true" ? { isRead: false } : {}) };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.notification.count({ where: { userId: req.userId!, isRead: false } }),
    ]);
    res.json({ notifications, unreadCount });
  }),
);

notificationRouter.post(
  "/read-all",
  wrap(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.userId!, isRead: false }, data: { isRead: true } });
    res.json({ ok: true });
  }),
);

notificationRouter.post(
  "/:id/read",
  wrap(async (req, res) => {
    const result = await prisma.notification.updateMany({ where: { id: req.params.id!, userId: req.userId! }, data: { isRead: true } });
    if (result.count === 0) throw notFound("Notification");
    res.json({ ok: true });
  }),
);
