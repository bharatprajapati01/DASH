import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { HttpError, clean, notFound, parse, wrap } from "../http.js";
import { requireProjectAccess, visibleProjectIds } from "../access.js";
import { emitToProject, logActivity } from "../realtime.js";

export const fileRouter = Router();
fileRouter.use(requireAuth);

fs.mkdirSync(env.uploadDir, { recursive: true });

const ALLOWED: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
};

const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    // Never trust the client's file name for the on-disk path.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: env.maxFileSizeBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimes = ALLOWED[ext];
    if (!mimes || !mimes.includes(file.mimetype)) {
      return cb(new HttpError(415, "Unsupported file type. Use PDF, PNG, JPG, DOCX, XLSX or ZIP.", "BAD_FILE_TYPE"));
    }
    cb(null, true);
  },
});

/** Magic-byte check so a renamed executable cannot pass as a PNG or PDF. */
async function looksLegit(filePath: string, ext: string): Promise<boolean> {
  const fh = await fsp.open(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    const hex = buf.toString("hex");
    if (ext === ".pdf") return buf.subarray(0, 4).toString() === "%PDF";
    if (ext === ".png") return hex.startsWith("89504e470d0a1a0a");
    if (ext === ".jpg" || ext === ".jpeg") return hex.startsWith("ffd8ff");
    // docx / xlsx / zip are all ZIP containers.
    return hex.startsWith("504b0304") || hex.startsWith("504b0506");
  } finally {
    await fh.close();
  }
}

export async function removeStoredFiles(names: string[]) {
  await Promise.all(
    names.map((n) => fsp.unlink(path.join(env.uploadDir, path.basename(n))).catch(() => undefined)),
  );
}

const fileShape = {
  uploadedBy: { select: { id: true, name: true, avatar: true } },
  task: { select: { id: true, title: true } },
} as const;

fileRouter.post(
  "/projects/:id/files",
  (req, res, next) => {
    // Authorize before the body is written to disk.
    requireProjectAccess(req.userId!, req.params.id!)
      .then(() => next())
      .catch(next);
  },
  upload.single("file"),
  wrap(async (req, res) => {
    const projectId = req.params.id!;
    const file = req.file;
    if (!file) throw new HttpError(400, "Attach a file to upload", "VALIDATION");
    const ext = path.extname(file.originalname).toLowerCase();
    if (!(await looksLegit(file.path, ext))) {
      await removeStoredFiles([file.filename]);
      throw new HttpError(415, "That file's contents do not match its type", "BAD_FILE_TYPE");
    }
    const taskId = typeof req.body?.taskId === "string" && req.body.taskId ? req.body.taskId : null;
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
      if (!task || task.projectId !== projectId) {
        await removeStoredFiles([file.filename]);
        throw new HttpError(400, "That task is not in this project", "VALIDATION");
      }
    }
    const attachment = await prisma.attachment.create({
      data: {
        projectId,
        taskId,
        uploadedById: req.userId!,
        fileName: clean(path.basename(file.originalname)).slice(0, 200) || "file",
        fileUrl: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      include: fileShape,
    });
    await logActivity({ userId: req.userId!, projectId, taskId, action: "file.uploaded", details: `uploaded ${attachment.fileName}` });
    emitToProject(projectId, "file:created", attachment);
    res.status(201).json({ file: toClient(attachment) });
  }),
);

fileRouter.get(
  "/files",
  wrap(async (req, res) => {
    const q = parse(z.object({ projectId: z.string().optional(), workspaceId: z.string().optional(), q: z.string().trim().max(100).optional() }), req.query);
    let projectIds: string[];
    if (q.projectId) {
      await requireProjectAccess(req.userId!, q.projectId);
      projectIds = [q.projectId];
    } else if (q.workspaceId) {
      projectIds = await visibleProjectIds(req.userId!, q.workspaceId);
    } else {
      throw new HttpError(400, "projectId or workspaceId is required", "VALIDATION");
    }
    const files = await prisma.attachment.findMany({
      where: { projectId: { in: projectIds }, ...(q.q ? { fileName: { contains: q.q, mode: "insensitive" } } : {}) },
      include: fileShape,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, color: true } });
    const byId = new Map(projects.map((p) => [p.id, p]));
    res.json({ files: files.map((f) => ({ ...toClient(f), project: byId.get(f.projectId) ?? null })) });
  }),
);

fileRouter.get(
  "/files/:id/download",
  wrap(async (req, res) => {
    const file = await prisma.attachment.findUnique({ where: { id: req.params.id! } });
    if (!file) throw notFound("File");
    await requireProjectAccess(req.userId!, file.projectId);
    const full = path.join(env.uploadDir, path.basename(file.fileUrl));
    try {
      await fsp.access(full);
    } catch {
      throw notFound("File");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.download(full, file.fileName);
  }),
);

fileRouter.delete(
  "/files/:id",
  wrap(async (req, res) => {
    const file = await prisma.attachment.findUnique({ where: { id: req.params.id! } });
    if (!file) throw notFound("File");
    const access = await requireProjectAccess(req.userId!, file.projectId);
    if (file.uploadedById !== req.userId && !access.canManage) {
      throw new HttpError(403, "Only the uploader, project owner or a workspace admin can delete this file", "FORBIDDEN");
    }
    await prisma.attachment.delete({ where: { id: file.id } });
    await removeStoredFiles([file.fileUrl]);
    await logActivity({ userId: req.userId!, projectId: file.projectId, taskId: file.taskId, action: "file.deleted", details: `deleted ${file.fileName}` });
    emitToProject(file.projectId, "file:deleted", { id: file.id, projectId: file.projectId, taskId: file.taskId });
    res.json({ ok: true });
  }),
);

/** Never expose the on-disk name; clients download through the authorized route. */
function toClient<T extends { fileUrl: string }>(f: T) {
  const { fileUrl: _fileUrl, ...rest } = f;
  return rest;
}
