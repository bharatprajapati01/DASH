import { prisma } from "./db.js";
import { notify } from "./realtime.js";

const DAY = 86_400_000;

/** Creates "due soon" and "overdue" notifications, at most once per task per day. */
export async function runDeadlineSweep() {
  const now = new Date();
  const soon = new Date(now.getTime() + DAY);
  const since = new Date(now.getTime() - DAY);

  const tasks = await prisma.task.findMany({
    where: { assigneeId: { not: null }, status: { not: "DONE" }, dueDate: { not: null, lt: soon } },
    select: { id: true, title: true, projectId: true, assigneeId: true, dueDate: true },
    take: 500,
  });

  for (const t of tasks) {
    const type = t.dueDate! < now ? "OVERDUE" : "DEADLINE_SOON";
    const recent = await prisma.notification.findFirst({
      where: { userId: t.assigneeId!, type, relatedTaskId: t.id, createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) continue;
    await notify({
      userId: t.assigneeId!,
      type,
      message: type === "OVERDUE" ? `"${t.title}" is overdue` : `"${t.title}" is due within 24 hours`,
      projectId: t.projectId,
      taskId: t.id,
    });
  }
}

export function startJobs() {
  const run = () => runDeadlineSweep().catch((err) => console.error("deadline sweep failed", err));
  setTimeout(run, 15_000);
  return setInterval(run, 30 * 60 * 1000);
}
