import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env.js";
import { HttpError, errorHandler } from "./http.js";
import { initRealtime } from "./realtime.js";
import { startJobs } from "./jobs.js";
import { authRouter } from "./routes/auth.js";
import { workspaceRouter } from "./routes/workspaces.js";
import { projectRouter } from "./routes/projects.js";
import { taskRouter } from "./routes/tasks.js";
import { commentRouter } from "./routes/comments.js";
import { notificationRouter } from "./routes/notifications.js";
import { fileRouter } from "./routes/files.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { prisma } from "./db.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin tools (curl, health checks) send no Origin header.
      if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
      cb(new HttpError(403, "Origin not allowed", "CORS_ORIGIN"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/projects", projectRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api", commentRouter);
app.use("/api", fileRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint" } });
});
app.use(errorHandler);

const server = http.createServer(app);
initRealtime(server);
const jobs = startJobs();

server.listen(env.port, () => {
  console.log(`FIBNK API listening on http://localhost:${env.port}`);
});

const shutdown = async () => {
  clearInterval(jobs);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
