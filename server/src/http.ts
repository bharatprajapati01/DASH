import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`, "NOT_FOUND");
export const forbidden = (msg = "You do not have permission to do that") =>
  new HttpError(403, msg, "FORBIDDEN");

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    throw new HttpError(400, `${where}${first?.message ?? "Invalid input"}`, "VALIDATION", result.error.flatten());
  }
  return result.data;
}

/** Strip tags and control characters from user-provided text. React escapes on render; this is defence in depth. */
export function clean(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const e = err as { code?: string; message?: string; name?: string };
  if (e?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "File exceeds the size limit" } });
  }
  if (e?.name === "MulterError") {
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: e.message ?? "Upload failed" } });
  }
  if (e?.code === "P2002") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "That record already exists" } });
  }
  if (e?.code === "P2025") {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found" } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
}
