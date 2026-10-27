import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { HttpError, clean, notFound, parse, wrap } from "../http.js";
import { requireProjectAccess, requireTaskAccess, visibleProjectIds } from "../access.js";
import { emitToProject, logActivity, notify } from "../realtime.js";

export const commentRouter = Router();
commentRouter.use(requireAuth);

const author = { select: { id: true, name: true, avatar: true, jobTitle: true } } as const;

commentRouter.get(
  "/tasks/:taskId/comments",
  wrap(async (req, res) => {
    await requireTaskAccess(req.userId!, req.params.taskId!);
    const comments = await prisma.comment.findMany({
      where: { taskId: req.params.taskId! },
      include: { user: author },
      orderBy: { createdAt: "asc" },
    });
    res.json({ comments });
  }),
);

commentRouter.post(
  "/tasks/:taskId/comments",
  wrap(async (req, res) => {
    const taskId = req.params.taskId!;
    const { task, project } = await requireTaskAccess(req.userId!, taskId);
    const body = parse(
      z.object({
        content: z.string().trim().min(1, "Write something first").max(2000),
        parentCommentId: z.string().nullable().optional(),
        mentions: z.array(z.string()).max(20).default([]),
      }),
      req.body,
    );
    if (body.parentCommentId) {
      const parent = await prisma.comment.findUnique({ where: { id: body.parentCommentId } });
      if (!parent || parent.taskId !== taskId) throw new HttpError(400, "That comment is not on this task", "VALIDATION");
    }
    const comment = await prisma.comment.create({
      data: { taskId, userId: req.userId!, content: clean(body.content), parentCommentId: body.parentCommentId ?? null },
      include: { user: author },
    });

    // Only project members can be mentioned.
    const mentionable = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { in: body.mentions } },
      select: { userId: true },
    });
    const mentioned = new Set(mentionable.map((m) => m.userId));
    for (const userId of mentioned) {
      await notify({ userId, actorId: req.userId!, type: "MENTION", message: `${comment.user.name} mentioned you on "${task.title}"`, projectId: task.projectId, taskId });
    }
    const others = new Set<string>();
    if (task.assigneeId) others.add(task.assigneeId);
    others.add(task.createdById);
    for (const userId of others) {
      if (mentioned.has(userId)) continue;
      await notify({ userId, actorId: req.userId!, type: "COMMENT", message: `${comment.user.name} commented on "${task.title}"`, projectId: task.projectId, taskId });
    }
    await logActivity({ userId: req.userId!, projectId: task.projectId, taskId, action: "comment.added", details: `commented on "${task.title}"` });
    emitToProject(task.projectId, "comment:created", { ...comment, projectId: task.projectId });
    void project;
    res.status(201).json({ comment });
  }),
);

commentRouter.patch(
  "/comments/:id",
  wrap(async (req, res) => {
    const existing = await prisma.comment.findUnique({ where: { id: req.params.id! }, include: { task: true } });
    if (!existing) throw notFound("Comment");
    await requireProjectAccess(req.userId!, existing.task.projectId);
    if (existing.userId !== req.userId) throw new HttpError(403, "You can only edit your own comments", "FORBIDDEN");
    const { content } = parse(z.object({ content: z.string().trim().min(1).max(2000) }), req.body);
    const comment = await prisma.comment.update({ where: { id: existing.id }, data: { content: clean(content) }, include: { user: author } });
    emitToProject(existing.task.projectId, "comment:updated", { ...comment, projectId: existing.task.projectId });
    res.json({ comment });
  }),
);

commentRouter.delete(
  "/comments/:id",
  wrap(async (req, res) => {
    const existing = await prisma.comment.findUnique({ where: { id: req.params.id! }, include: { task: true } });
    if (!existing) throw notFound("Comment");
    await requireProjectAccess(req.userId!, existing.task.projectId);
    if (existing.userId !== req.userId) throw new HttpError(403, "You can only delete your own comments", "FORBIDDEN");
    await prisma.comment.delete({ where: { id: existing.id } });
    emitToProject(existing.task.projectId, "comment:deleted", { id: existing.id, taskId: existing.taskId, projectId: existing.task.projectId });
    res.json({ ok: true });
  }),
);

/** Inbox: tasks with recent discussion, plus whether the caller has unread comment/mention notifications on them. */
commentRouter.get(
  "/inbox",
  wrap(async (req, res) => {
    const { workspaceId, q } = parse(z.object({ workspaceId: z.string().min(1), q: z.string().trim().max(100).optional() }), req.query);
    const projectIds = await visibleProjectIds(req.userId!, workspaceId);
    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        comments: { some: {} },
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { comments: { some: { content: { contains: q, mode: "insensitive" } } } }] } : {}),
      },
      select: {
        id: true,
        title: true,
        project: { select: { id: true, name: true, color: true } },
        comments: { orderBy: { createdAt: "desc" }, take: 1, include: { user: author } },
        _count: { select: { comments: true } },
      },
      take: 100,
    });
    const unread = await prisma.notification.groupBy({
      by: ["relatedTaskId"],
      where: { userId: req.userId!, isRead: false, type: { in: ["COMMENT", "MENTION"] }, relatedTaskId: { in: tasks.map((t) => t.id) } },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.relatedTaskId, u._count._all]));
    const conversations = tasks
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        project: t.project,
        commentCount: t._count.comments,
        lastComment: t.comments[0]!,
        unread: unreadMap.get(t.id) ?? 0,
      }))
      .sort((a, b) => +new Date(b.lastComment.createdAt) - +new Date(a.lastComment.createdAt));
    res.json({ conversations });
  }),
);
