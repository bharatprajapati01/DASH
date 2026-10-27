import { prisma } from "./db.js";
import { forbidden, notFound } from "./http.js";
import type { WorkspaceRole } from "./constants.js";

export async function requireWorkspaceMember(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw notFound("Workspace");
  return membership as { id: string; role: WorkspaceRole; workspaceId: string; userId: string };
}

export async function requireWorkspaceAdmin(userId: string, workspaceId: string) {
  const m = await requireWorkspaceMember(userId, workspaceId);
  if (m.role !== "ADMIN") throw forbidden("Only workspace admins can do that");
  return m;
}

/**
 * Resolves a project the user may see: they must be a project member, or an admin of the workspace.
 * Non-members get a 404 so project ids do not leak.
 */
export async function requireProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true, role: true } } },
  });
  if (!project) throw notFound("Project");
  const wm = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } },
  });
  if (!wm) throw notFound("Project");
  const isMember = project.members.some((m) => m.userId === userId);
  const isAdmin = wm.role === "ADMIN";
  if (!isMember && !isAdmin) throw notFound("Project");
  const canManage = project.ownerId === userId || isAdmin;
  return { project, isAdmin, isMember, canManage };
}

export async function requireTaskAccess(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task");
  const access = await requireProjectAccess(userId, task.projectId);
  return { task, ...access };
}

/** Ids of every project the user can see in a workspace. */
export async function visibleProjectIds(userId: string, workspaceId: string): Promise<string[]> {
  const wm = await requireWorkspaceMember(userId, workspaceId);
  const projects = await prisma.project.findMany({
    where: wm.role === "ADMIN" ? { workspaceId } : { workspaceId, members: { some: { userId } } },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}
