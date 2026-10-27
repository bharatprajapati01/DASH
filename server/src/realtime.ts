import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import { env } from "./env.js";
import { COOKIE_NAME, verifySession } from "./auth.js";
import { prisma } from "./db.js";
import type { NotificationType } from "./constants.js";

let io: Server | null = null;

const projectRoom = (id: string) => `project:${id}`;
const userRoom = (id: string) => `user:${id}`;

async function projectIdsFor(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true, role: true } });
  const adminWs = memberships.filter((m) => m.role === "ADMIN").map((m) => m.workspaceId);
  const projects = await prisma.project.findMany({
    where: { OR: [{ members: { some: { userId } } }, { workspaceId: { in: adminWs } }] },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  // Authenticate every connection from the HTTP-only session cookie.
  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const userId = verifySession(cookies[COOKIE_NAME]);
    if (!userId) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    try {
      for (const id of await projectIdsFor(userId)) socket.join(projectRoom(id));
    } catch (err) {
      console.error("socket join failed", err);
    }

    // Re-verify membership before joining any extra room the client asks for.
    socket.on("project:join", async (projectId: string, ack?: (ok: boolean) => void) => {
      const allowed = (await projectIdsFor(userId)).includes(projectId);
      if (allowed) socket.join(projectRoom(projectId));
      ack?.(allowed);
    });
    socket.on("project:leave", (projectId: string) => socket.leave(projectRoom(projectId)));
  });

  return io;
}

export function emitToProject(projectId: string, event: string, payload: unknown) {
  io?.to(projectRoom(projectId)).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Make a user's live sockets start (or stop) receiving a project's events. */
export function subscribeUserToProject(userId: string, projectId: string) {
  io?.in(userRoom(userId)).socketsJoin(projectRoom(projectId));
}
export function unsubscribeUserFromProject(userId: string, projectId: string) {
  io?.in(userRoom(userId)).socketsLeave(projectRoom(projectId));
}

export async function notify(opts: {
  userId: string;
  actorId?: string;
  type: NotificationType;
  message: string;
  projectId?: string;
  taskId?: string;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return null;
  const n = await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      message: opts.message,
      relatedProjectId: opts.projectId,
      relatedTaskId: opts.taskId,
    },
  });
  emitToUser(opts.userId, "notification:new", n);
  return n;
}

export async function logActivity(opts: {
  userId: string;
  projectId: string;
  taskId?: string | null;
  action: string;
  details?: string;
}) {
  const activity = await prisma.activity.create({
    data: {
      userId: opts.userId,
      projectId: opts.projectId,
      taskId: opts.taskId ?? null,
      action: opts.action,
      details: opts.details ?? "",
    },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  emitToProject(opts.projectId, "activity:new", activity);
  return activity;
}
