import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { HttpError, clean, parse, wrap } from "../http.js";
import { requireProjectAccess, requireTaskAccess, requireWorkspaceMember, visibleProjectIds } from "../access.js";
import { PRIORITIES, PRIORITY_RANK, STATUS_LABEL, TASK_STATUSES, USER_PUBLIC, type Priority, type TaskStatus } from "../constants.js";
import { emitToProject, logActivity, notify } from "../realtime.js";

export const taskRouter = Router();
taskRouter.use(requireAuth);

const dateField = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}/)])
  .transform((s) => new Date(s))
  .nullable()
  .optional();

const labelsField = z.array(z.string().trim().min(1).max(24)).max(8);

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Give the task a title").max(160),
  description: z.string().trim().max(5000).default(""),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  startDate: dateField,
  dueDate: dateField,
  labels: labelsField.default([]),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  startDate: dateField,
  dueDate: dateField,
  labels: labelsField.optional(),
  position: z.number().finite().optional(),
});

const taskInclude = {
  assignee: { select: USER_PUBLIC },
  createdBy: { select: USER_PUBLIC },
  project: { select: { id: true, name: true, color: true } },
  _count: { select: { comments: true, attachments: true } },
} as const;

async function assertAssignable(projectId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: assigneeId } } });
  if (!m) throw new HttpError(400, "Tasks can only be assigned to project members", "VALIDATION");
}

taskRouter.get(
  "/",
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        scope: z.enum(["all", "assigned", "created", "today", "upcoming", "overdue", "completed"]).default("all"),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assigneeId: z.string().optional(),
        q: z.string().trim().max(100).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        deadline: z.enum(["today", "week", "overdue", "none"]).optional(),
        sort: z.enum(["dueDate", "priority", "updated", "created"]).default("updated"),
        limit: z.coerce.number().int().min(1).max(500).default(300),
      }),
      req.query,
    );
    const userId = req.userId!;
    let projectIds: string[];
    if (q.projectId) {
      await requireProjectAccess(userId, q.projectId);
      projectIds = [q.projectId];
    } else if (q.workspaceId) {
      projectIds = await visibleProjectIds(userId, q.workspaceId);
    } else {
      throw new HttpError(400, "projectId or workspaceId is required", "VALIDATION");
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
    const endOfWeek = new Date(startOfDay.getTime() + 7 * 86_400_000);

    const and: Record<string, unknown>[] = [{ projectId: { in: projectIds } }];
    switch (q.scope) {
      case "assigned": and.push({ assigneeId: userId }); break;
      case "created": and.push({ createdById: userId }); break;
      case "today": and.push({ assigneeId: userId, status: { not: "DONE" }, dueDate: { gte: startOfDay, lt: endOfDay } }); break;
      case "upcoming": and.push({ assigneeId: userId, status: { not: "DONE" }, dueDate: { gte: endOfDay } }); break;
      case "overdue": and.push({ assigneeId: userId, status: { not: "DONE" }, dueDate: { lt: startOfDay } }); break;
      case "completed": and.push({ assigneeId: userId, status: "DONE" }); break;
      default: break;
    }
    if (q.status) and.push({ status: q.status });
    if (q.priority) and.push({ priority: q.priority });
    if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
    if (q.q) and.push({ OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] });
    if (q.from || q.to) {
      and.push({ dueDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } });
    }
    if (q.deadline === "today") and.push({ dueDate: { gte: startOfDay, lt: endOfDay } });
    if (q.deadline === "week") and.push({ dueDate: { gte: startOfDay, lt: endOfWeek } });
    if (q.deadline === "overdue") and.push({ dueDate: { lt: startOfDay }, status: { not: "DONE" } });
    if (q.deadline === "none") and.push({ dueDate: null });

    const orderBy =
      q.sort === "dueDate" ? [{ dueDate: { sort: "asc" as const, nulls: "last" as const } }]
      : q.sort === "created" ? [{ createdAt: "desc" as const }]
      : [{ updatedAt: "desc" as const }];

    let tasks = await prisma.task.findMany({
      where: { AND: and },
      include: taskInclude,
      orderBy: q.sort === "priority" ? [{ updatedAt: "desc" }] : orderBy,
      take: q.limit,
    });
    if (q.sort === "priority") {
      tasks = [...tasks].sort((a, b) => PRIORITY_RANK[b.priority as Priority] - PRIORITY_RANK[a.priority as Priority]);
    }
    res.json({ tasks });
  }),
);

taskRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = parse(createSchema, req.body);
    const { project } = await requireProjectAccess(req.userId!, body.projectId);
    await assertAssignable(body.projectId, body.assigneeId);
    if (body.startDate && body.dueDate && body.dueDate < body.startDate) {
      throw new HttpError(400, "The due date must be after the start date", "VALIDATION");
    }
    const last = await prisma.task.aggregate({ where: { projectId: body.projectId, status: body.status }, _max: { position: true } });
    const task = await prisma.task.create({
      data: {
        title: clean(body.title),
        description: clean(body.description),
        projectId: body.projectId,
        assigneeId: body.assigneeId ?? null,
        createdById: req.userId!,
        status: body.status,
        priority: body.priority,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        labels: body.labels.map(clean),
        position: (last._max.position ?? 0) + 1000,
        completedAt: body.status === "DONE" ? new Date() : null,
      },
      include: taskInclude,
    });
    await logActivity({ userId: req.userId!, projectId: task.projectId, taskId: task.id, action: "task.created", details: `created "${task.title}"` });
    if (task.assigneeId) {
      await notify({ userId: task.assigneeId, actorId: req.userId!, type: "TASK_ASSIGNED", message: `You were assigned "${task.title}" in ${project.name}`, projectId: task.projectId, taskId: task.id });
    }
    emitToProject(task.projectId, "task:created", task);
    res.status(201).json({ task });
  }),
);

taskRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    await requireTaskAccess(req.userId!, id);
    const task = await prisma.task.findUniqueOrThrow({
      where: { id },
      include: {
        ...taskInclude,
        attachments: { include: { uploadedBy: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "desc" } },
        activities: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    res.json({ task });
  }),
);

taskRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const { task: before, project } = await requireTaskAccess(req.userId!, id);
    const body = parse(updateSchema, req.body);
    if (body.assigneeId !== undefined) await assertAssignable(before.projectId, body.assigneeId);
    const nextStart = body.startDate === undefined ? before.startDate : body.startDate;
    const nextDue = body.dueDate === undefined ? before.dueDate : body.dueDate;
    if (nextStart && nextDue && nextDue < nextStart) {
      throw new HttpError(400, "The due date must be after the start date", "VALIDATION");
    }

    const statusChanged = body.status && body.status !== before.status;
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(body.title ? { title: clean(body.title) } : {}),
        ...(body.description !== undefined ? { description: clean(body.description) } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.labels ? { labels: body.labels.map(clean) } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(statusChanged ? { completedAt: body.status === "DONE" ? new Date() : null } : {}),
      },
      include: taskInclude,
    });
    await afterTaskChange({ actorId: req.userId!, before, after: task, projectName: project.name });
    emitToProject(task.projectId, "task:updated", task);
    res.json({ task });
  }),
);

/** Dedicated move endpoint used by drag-and-drop (status + position in one call). */
taskRouter.post(
  "/:id/move",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const { task: before, project } = await requireTaskAccess(req.userId!, id);
    const body = parse(z.object({ status: z.enum(TASK_STATUSES), position: z.number().finite() }), req.body);
    const statusChanged = body.status !== before.status;
    const task = await prisma.task.update({
      where: { id },
      data: {
        status: body.status,
        position: body.position,
        ...(statusChanged ? { completedAt: body.status === "DONE" ? new Date() : null } : {}),
      },
      include: taskInclude,
    });
    await afterTaskChange({ actorId: req.userId!, before, after: task, projectName: project.name });
    emitToProject(task.projectId, "task:updated", task);
    res.json({ task });
  }),
);

taskRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const { task, canManage } = await requireTaskAccess(req.userId!, id);
    if (!canManage && task.createdById !== req.userId) {
      throw new HttpError(403, "Only the task creator, project owner or a workspace admin can delete this task", "FORBIDDEN");
    }
    const files = await prisma.attachment.findMany({ where: { taskId: id }, select: { fileUrl: true } });
    await logActivity({ userId: req.userId!, projectId: task.projectId, action: "task.deleted", details: `deleted "${task.title}"` });
    await prisma.task.delete({ where: { id } });
    const { removeStoredFiles } = await import("./files.js");
    await removeStoredFiles(files.map((f) => f.fileUrl));
    emitToProject(task.projectId, "task:deleted", { id, projectId: task.projectId });
    res.json({ ok: true });
  }),
);

type TaskLike = {
  id: string;
  title: string;
  projectId: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: Date | null;
};

async function afterTaskChange(opts: { actorId: string; before: TaskLike; after: TaskLike; projectName: string }) {
  const { actorId, before, after, projectName } = opts;
  const log = (action: string, details: string) =>
    logActivity({ userId: actorId, projectId: after.projectId, taskId: after.id, action, details });

  if (before.status !== after.status) {
    const label = STATUS_LABEL[after.status as TaskStatus];
    await log(after.status === "DONE" ? "task.completed" : "task.status", after.status === "DONE" ? `completed "${after.title}"` : `moved "${after.title}" to ${label}`);
    const recipients = new Set<string>();
    if (after.assigneeId) recipients.add(after.assigneeId);
    const creator = await prisma.task.findUnique({ where: { id: after.id }, select: { createdById: true } });
    if (creator) recipients.add(creator.createdById);
    for (const userId of recipients) {
      await notify({ userId, actorId, type: "STATUS_CHANGE", message: `"${after.title}" moved to ${label}`, projectId: after.projectId, taskId: after.id });
    }
  }
  if (before.assigneeId !== after.assigneeId) {
    await log("task.assigned", after.assigneeId ? `assigned "${after.title}"` : `unassigned "${after.title}"`);
    if (after.assigneeId) {
      await notify({ userId: after.assigneeId, actorId, type: "TASK_ASSIGNED", message: `You were assigned "${after.title}" in ${projectName}`, projectId: after.projectId, taskId: after.id });
    }
  }
  if (String(before.dueDate) !== String(after.dueDate)) {
    await log("task.deadline", `changed the deadline of "${after.title}"`);
  }
  if (before.priority !== after.priority) {
    await log("task.priority", `set "${after.title}" to ${after.priority.toLowerCase()} priority`);
  }
}

export { requireWorkspaceMember };
