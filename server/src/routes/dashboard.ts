import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { parse, wrap } from "../http.js";
import { requireWorkspaceMember, visibleProjectIds } from "../access.js";
import { USER_PUBLIC } from "../constants.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const DAY = 86_400_000;

function pct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

dashboardRouter.get(
  "/",
  wrap(async (req, res) => {
    const { workspaceId, range } = parse(
      z.object({ workspaceId: z.string().min(1), range: z.enum(["week", "month"]).default("week") }),
      req.query,
    );
    await requireWorkspaceMember(req.userId!, workspaceId);
    const projectIds = await visibleProjectIds(req.userId!, workspaceId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Week: last 7 daily buckets. Month: last 4 weekly buckets (28 days).
    const buckets = range === "week" ? 7 : 4;
    const bucketMs = range === "week" ? DAY : 7 * DAY;
    const periodMs = buckets * bucketMs;
    const periodStart = new Date(startOfToday.getTime() + DAY - periodMs);
    const prevStart = new Date(periodStart.getTime() - periodMs);

    const inScope = { projectId: { in: projectIds } };
    const [total, done, inProgress, createdNow, createdPrev, doneNow, donePrev, periodTasks, projects, activity, members] =
      await Promise.all([
        prisma.task.count({ where: inScope }),
        prisma.task.count({ where: { ...inScope, status: "DONE" } }),
        prisma.task.count({ where: { ...inScope, status: "IN_PROGRESS" } }),
        prisma.task.count({ where: { ...inScope, createdAt: { gte: periodStart } } }),
        prisma.task.count({ where: { ...inScope, createdAt: { gte: prevStart, lt: periodStart } } }),
        prisma.task.count({ where: { ...inScope, completedAt: { gte: periodStart } } }),
        prisma.task.count({ where: { ...inScope, completedAt: { gte: prevStart, lt: periodStart } } }),
        prisma.task.findMany({
          where: { ...inScope, OR: [{ createdAt: { gte: periodStart } }, { completedAt: { gte: periodStart } }] },
          select: { createdAt: true, completedAt: true },
        }),
        prisma.project.findMany({
          where: { id: { in: projectIds } },
          include: {
            members: { include: { user: { select: USER_PUBLIC } }, take: 6 },
            tasks: { select: { status: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
        }),
        prisma.activity.findMany({
          where: { projectId: { in: projectIds } },
          include: { user: { select: { id: true, name: true, avatar: true } }, project: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        prisma.workspaceMember.findMany({
          where: { workspaceId },
          include: { user: { select: USER_PUBLIC } },
          orderBy: { user: { lastActiveAt: "desc" } },
          take: 8,
        }),
      ]);

    const chart = Array.from({ length: buckets }, (_, i) => {
      const from = new Date(periodStart.getTime() + i * bucketMs);
      const to = new Date(from.getTime() + bucketMs);
      const label =
        range === "week"
          ? from.toLocaleDateString("en-US", { weekday: "short" })
          : `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      return {
        label,
        created: periodTasks.filter((t) => t.createdAt >= from && t.createdAt < to).length,
        completed: periodTasks.filter((t) => t.completedAt && t.completedAt >= from && t.completedAt < to).length,
      };
    });

    res.json({
      range,
      totals: {
        total,
        completed: done,
        inProgress,
        completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
        createdChange: pct(createdNow, createdPrev),
        completedChange: pct(doneNow, donePrev),
      },
      chart,
      projects: projects.map((p) => {
        const count = p.tasks.length;
        const finished = p.tasks.filter((t) => t.status === "DONE").length;
        const { tasks: _t, members: m, ...rest } = p;
        return {
          ...rest,
          members: m.map((x) => x.user),
          taskCount: count,
          doneCount: finished,
          completion: count === 0 ? 0 : Math.round((finished / count) * 100),
        };
      }),
      members: members.map((m) => ({ ...m.user, workspaceRole: m.role })),
      activity,
    });
  }),
);
