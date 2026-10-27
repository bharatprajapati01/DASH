import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { HttpError, clean, parse, wrap } from "../http.js";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "../access.js";
import { USER_PUBLIC, WORKSPACE_ROLES } from "../constants.js";
import { notify } from "../realtime.js";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

workspaceRouter.get(
  "/",
  wrap(async (req, res) => {
    const rows = await prisma.workspaceMember.findMany({
      where: { userId: req.userId! },
      include: { workspace: { include: { _count: { select: { members: true, projects: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    res.json({
      workspaces: rows.map((r) => ({
        id: r.workspace.id,
        name: r.workspace.name,
        ownerId: r.workspace.ownerId,
        role: r.role,
        memberCount: r.workspace._count.members,
        projectCount: r.workspace._count.projects,
      })),
    });
  }),
);

workspaceRouter.post(
  "/",
  wrap(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const ws = await prisma.workspace.create({
      data: { name: clean(name), ownerId: req.userId!, members: { create: { userId: req.userId!, role: "ADMIN" } } },
    });
    res.status(201).json({ workspace: { id: ws.id, name: ws.name, ownerId: ws.ownerId, role: "ADMIN" } });
  }),
);

workspaceRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = req.params.id!;
    await requireWorkspaceAdmin(req.userId!, id);
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const ws = await prisma.workspace.update({ where: { id }, data: { name: clean(name) } });
    res.json({ workspace: ws });
  }),
);

/** People directory with per-member task stats. */
workspaceRouter.get(
  "/:id/members",
  wrap(async (req, res) => {
    const id = req.params.id!;
    await requireWorkspaceMember(req.userId!, id);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: USER_PUBLIC } },
      orderBy: { joinedAt: "asc" },
    });
    const userIds = members.map((m) => m.userId);
    const [assigned, completed, current] = await Promise.all([
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: { assigneeId: { in: userIds }, project: { workspaceId: id } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: { assigneeId: { in: userIds }, status: "DONE", project: { workspaceId: id } },
        _count: { _all: true },
      }),
      prisma.projectMember.findMany({
        where: { userId: { in: userIds }, project: { workspaceId: id, status: "ACTIVE" } },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { project: { updatedAt: "desc" } },
      }),
    ]);
    const countMap = (rows: { assigneeId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.assigneeId, r._count._all]));
    const a = countMap(assigned);
    const c = countMap(completed);
    const firstProject = new Map<string, { id: string; name: string }>();
    for (const pm of current) if (!firstProject.has(pm.userId)) firstProject.set(pm.userId, pm.project);

    res.json({
      members: members.map((m) => ({
        ...m.user,
        workspaceRole: m.role,
        joinedAt: m.joinedAt,
        assignedCount: a.get(m.userId) ?? 0,
        completedCount: c.get(m.userId) ?? 0,
        currentProject: firstProject.get(m.userId) ?? null,
      })),
    });
  }),
);

/** Invite an existing user (by email) into the workspace. */
workspaceRouter.post(
  "/:id/members",
  wrap(async (req, res) => {
    const id = req.params.id!;
    await requireWorkspaceAdmin(req.userId!, id);
    const body = parse(
      z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(WORKSPACE_ROLES).default("MEMBER") }),
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      throw new HttpError(404, "No account uses that email yet. Ask them to sign up first, then invite them.", "USER_NOT_FOUND");
    }
    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
    });
    if (existing) throw new HttpError(409, "They are already in this workspace", "ALREADY_MEMBER");
    await prisma.workspaceMember.create({ data: { workspaceId: id, userId: user.id, role: body.role } });
    const ws = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
    await notify({
      userId: user.id,
      actorId: req.userId!,
      type: "PROJECT_INVITE",
      message: `You were added to the ${ws?.name ?? "new"} workspace`,
    });
    res.status(201).json({ ok: true });
  }),
);

workspaceRouter.patch(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const userId = req.params.userId!;
    await requireWorkspaceAdmin(req.userId!, id);
    const { role } = parse(z.object({ role: z.enum(WORKSPACE_ROLES) }), req.body);
    const ws = await prisma.workspace.findUnique({ where: { id } });
    if (ws?.ownerId === userId && role !== "ADMIN") {
      throw new HttpError(400, "The workspace owner must stay an admin", "OWNER_ROLE");
    }
    await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: id, userId } }, data: { role } });
    res.json({ ok: true });
  }),
);

workspaceRouter.delete(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const id = req.params.id!;
    const userId = req.params.userId!;
    const me = await requireWorkspaceMember(req.userId!, id);
    if (me.role !== "ADMIN" && userId !== req.userId) throw new HttpError(403, "Only admins can remove members", "FORBIDDEN");
    const ws = await prisma.workspace.findUnique({ where: { id } });
    if (ws?.ownerId === userId) throw new HttpError(400, "The workspace owner cannot be removed", "OWNER_REMOVE");
    await prisma.$transaction([
      prisma.projectMember.deleteMany({ where: { userId, project: { workspaceId: id } } }),
      prisma.task.updateMany({ where: { assigneeId: userId, project: { workspaceId: id } }, data: { assigneeId: null } }),
      prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: id, userId } } }),
    ]);
    res.json({ ok: true });
  }),
);
