import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { HttpError, clean, parse, wrap } from "../http.js";
import { requireProjectAccess, requireWorkspaceMember, visibleProjectIds } from "../access.js";
import { PROJECT_STATUSES, USER_PUBLIC } from "../constants.js";
import {
  emitToProject,
  emitToUser,
  logActivity,
  notify,
  subscribeUserToProject,
  unsubscribeUserFromProject,
} from "../realtime.js";

export const projectRouter = Router();
projectRouter.use(requireAuth);

const dateField = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .transform((s) => new Date(s))
  .nullable()
  .optional();

const colorField = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #FF896D");

const createSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2, "Project name is too short").max(100),
  description: z.string().trim().max(2000).default(""),
  category: z.string().trim().max(40).default("General"),
  color: colorField.default("#FF896D"),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  startDate: dateField,
  dueDate: dateField,
  memberIds: z.array(z.string()).max(100).default([]),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(40).optional(),
  color: colorField.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: dateField,
  dueDate: dateField,
  ownerId: z.string().optional(),
});

type ProjectRow = {
  id: string;
  tasks?: { status: string }[];
  members: { userId: string; role: string; user: Record<string, unknown> }[];
  _count?: { tasks: number };
  [k: string]: unknown;
};

function shape(p: ProjectRow) {
  const tasks = p.tasks ?? [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const { tasks: _tasks, ...rest } = p;
  return {
    ...rest,
    members: p.members.map((m) => ({ ...m.user, projectRole: m.role })),
    taskCount: total,
    doneCount: done,
    inProgressCount: inProgress,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

const includeShape = {
  members: { include: { user: { select: USER_PUBLIC } } },
  tasks: { select: { status: true } },
  owner: { select: USER_PUBLIC },
} as const;

projectRouter.get(
  "/",
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        workspaceId: z.string().min(1),
        q: z.string().trim().max(100).optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        mine: z.enum(["true", "false"]).optional(),
      }),
      req.query,
    );
    const ids = await visibleProjectIds(req.userId!, q.workspaceId);
    const projects = await prisma.project.findMany({
      where: {
        id: { in: ids },
        ...(q.status ? { status: q.status } : {}),
        ...(q.mine === "true" ? { members: { some: { userId: req.userId! } } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] } : {}),
      },
      include: includeShape,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ projects: projects.map((p) => shape(p as unknown as ProjectRow)) });
  }),
);

projectRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = parse(createSchema, req.body);
    await requireWorkspaceMember(req.userId!, body.workspaceId);
    if (body.startDate && body.dueDate && body.dueDate < body.startDate) {
      throw new HttpError(400, "The deadline must be after the start date", "VALIDATION");
    }
    // Only people who belong to the workspace can join the project.
    const eligible = await prisma.workspaceMember.findMany({
      where: { workspaceId: body.workspaceId, userId: { in: body.memberIds } },
      select: { userId: true },
    });
    const memberIds = [...new Set(eligible.map((e) => e.userId).filter((id) => id !== req.userId))];

    const project = await prisma.project.create({
      data: {
        name: clean(body.name),
        description: clean(body.description),
        category: clean(body.category),
        color: body.color,
        status: body.status,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        workspaceId: body.workspaceId,
        ownerId: req.userId!,
        members: {
          create: [{ userId: req.userId!, role: "OWNER" }, ...memberIds.map((userId) => ({ userId, role: "MEMBER" as const }))],
        },
      },
      include: includeShape,
    });

    subscribeUserToProject(req.userId!, project.id);
    for (const id of memberIds) {
      subscribeUserToProject(id, project.id);
      await notify({
        userId: id,
        actorId: req.userId!,
        type: "PROJECT_INVITE",
        message: `You were added to the project "${project.name}"`,
        projectId: project.id,
      });
    }
    await logActivity({ userId: req.userId!, projectId: project.id, action: "project.created", details: `created the project "${project.name}"` });
    res.status(201).json({ project: shape(project as unknown as ProjectRow) });
  }),
);

projectRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const access = await requireProjectAccess(req.userId!, id);
    const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: includeShape });
    res.json({ project: { ...shape(project as unknown as ProjectRow), canManage: access.canManage } });
  }),
);

projectRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const access = await requireProjectAccess(req.userId!, id);
    if (!access.canManage) throw new HttpError(403, "Only the project owner or a workspace admin can edit this project", "FORBIDDEN");
    const body = parse(updateSchema, req.body);

    if (body.ownerId && body.ownerId !== access.project.ownerId) {
      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: access.project.workspaceId, userId: body.ownerId } },
      });
      if (!target) throw new HttpError(400, "The new owner must belong to this workspace", "VALIDATION");
    }

    const before = access.project;
    const nextStart = body.startDate === undefined ? before.startDate : body.startDate;
    const nextDue = body.dueDate === undefined ? before.dueDate : body.dueDate;
    if (nextStart && nextDue && nextDue < nextStart) {
      throw new HttpError(400, "The deadline must be after the start date", "VALIDATION");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.ownerId && body.ownerId !== before.ownerId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: body.ownerId } },
          update: { role: "OWNER" },
          create: { projectId: id, userId: body.ownerId, role: "OWNER" },
        });
        await tx.projectMember.updateMany({ where: { projectId: id, userId: before.ownerId }, data: { role: "MEMBER" } });
      }
      return tx.project.update({
        where: { id },
        data: {
          ...(body.name ? { name: clean(body.name) } : {}),
          ...(body.description !== undefined ? { description: clean(body.description) } : {}),
          ...(body.category ? { category: clean(body.category) } : {}),
          ...(body.color ? { color: body.color } : {}),
          ...(body.status ? { status: body.status } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
          ...(body.ownerId ? { ownerId: body.ownerId } : {}),
        },
        include: includeShape,
      });
    });

    if (body.dueDate !== undefined && String(before.dueDate) !== String(body.dueDate)) {
      await logActivity({ userId: req.userId!, projectId: id, action: "project.deadline", details: "changed the project deadline" });
    } else {
      await logActivity({ userId: req.userId!, projectId: id, action: "project.updated", details: "updated the project details" });
    }
    if (body.ownerId && body.ownerId !== before.ownerId) {
      await notify({ userId: body.ownerId, actorId: req.userId!, type: "PROJECT_INVITE", message: `You are now the owner of "${updated.name}"`, projectId: id });
    }
    const payload = shape(updated as unknown as ProjectRow);
    emitToProject(id, "project:updated", payload);
    res.json({ project: payload });
  }),
);

projectRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const access = await requireProjectAccess(req.userId!, id);
    if (!access.canManage) throw new HttpError(403, "Only the project owner or a workspace admin can delete this project", "FORBIDDEN");
    const files = await prisma.attachment.findMany({ where: { projectId: id }, select: { fileUrl: true } });
    emitToProject(id, "project:deleted", { id });
    await prisma.project.delete({ where: { id } });
    // Attachment rows cascade through tasks; remove the stored files too.
    const { removeStoredFiles } = await import("./files.js");
    await removeStoredFiles(files.map((f) => f.fileUrl));
    res.json({ ok: true });
  }),
);

projectRouter.post(
  "/:id/members",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const access = await requireProjectAccess(req.userId!, id);
    if (!access.canManage) throw new HttpError(403, "Only the project owner or a workspace admin can add members", "FORBIDDEN");
    const { userId } = parse(z.object({ userId: z.string().min(1) }), req.body);
    const wm = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: access.project.workspaceId, userId } },
      include: { user: { select: { name: true } } },
    });
    if (!wm) throw new HttpError(400, "Add them to the workspace first", "NOT_IN_WORKSPACE");
    if (access.project.members.some((m) => m.userId === userId)) throw new HttpError(409, "Already a project member", "ALREADY_MEMBER");
    await prisma.projectMember.create({ data: { projectId: id, userId, role: "MEMBER" } });
    subscribeUserToProject(userId, id);
    await notify({ userId, actorId: req.userId!, type: "PROJECT_INVITE", message: `You were added to the project "${access.project.name}"`, projectId: id });
    await logActivity({ userId: req.userId!, projectId: id, action: "member.joined", details: `added ${wm.user.name} to the project` });
    const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: includeShape });
    const payload = shape(project as unknown as ProjectRow);
    emitToProject(id, "project:updated", payload);
    res.status(201).json({ project: payload });
  }),
);

projectRouter.delete(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const userId = req.params.userId!;
    const access = await requireProjectAccess(req.userId!, id);
    if (!access.canManage && userId !== req.userId) throw new HttpError(403, "Only the project owner or a workspace admin can remove members", "FORBIDDEN");
    if (userId === access.project.ownerId) throw new HttpError(400, "Assign a new owner before removing the current one", "OWNER_REMOVE");
    const member = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await prisma.$transaction([
      prisma.task.updateMany({ where: { projectId: id, assigneeId: userId }, data: { assigneeId: null } }),
      prisma.projectMember.deleteMany({ where: { projectId: id, userId } }),
    ]);
    await logActivity({ userId: req.userId!, projectId: id, action: "member.removed", details: `removed ${member?.name ?? "a member"} from the project` });
    emitToUser(userId, "project:removed", { id });
    unsubscribeUserFromProject(userId, id);
    const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: includeShape });
    const payload = shape(project as unknown as ProjectRow);
    emitToProject(id, "project:updated", payload);
    res.json({ project: payload });
  }),
);

projectRouter.get(
  "/:id/activity",
  wrap(async (req, res) => {
    const id = req.params.id!;
    await requireProjectAccess(req.userId!, id);
    const { limit, cursor } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().optional() }),
      req.query,
    );
    const items = await prisma.activity.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, avatar: true } }, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({ activity: page, nextCursor: hasMore ? page[page.length - 1]!.id : null });
  }),
);
