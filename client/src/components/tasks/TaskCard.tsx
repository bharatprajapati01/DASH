import { CalendarDays, MessageSquare, Paperclip } from "lucide-react";
import { Avatar, PriorityBadge } from "../ui";
import { fmtDate, isOverdue } from "@/lib/format";
import type { Task } from "@/lib/types";

/** Bright, project-coloured task card in the Coral Workspace style. */
export function TaskCard({
  task,
  onOpen,
  showProject = true,
  dragging = false,
  detailed = false,
}: {
  task: Task;
  onOpen?: () => void;
  showProject?: boolean;
  dragging?: boolean;
  /** Taller variant used on the calendar: shows description and a view action. */
  detailed?: boolean;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  const done = task.status === "DONE";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen?.();
        }
      }}
      aria-label={`${task.title}, ${task.status.replace("_", " ").toLowerCase()}`}
      className={`group w-full cursor-pointer rounded-[18px] p-3.5 text-left text-ink transition hover:-translate-y-0.5 hover:shadow-lift ${dragging ? "rotate-1 shadow-lift ring-2 ring-ink/20" : "shadow-soft"} ${done ? "opacity-70" : ""}`}
      style={{ background: task.project.color }}
    >
      {showProject && <p className="mb-1 truncate text-[11px] font-bold uppercase tracking-wide text-ink/60">{task.project.name}</p>}
      <p className={`text-sm font-bold leading-snug ${done ? "line-through" : ""}`}>{task.title}</p>
      {detailed && task.description && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink/70">{task.description}</p>}
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span key={l} className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">{l}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink/70">
          {task.dueDate && (
            <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${overdue ? "bg-danger text-white" : "bg-white/60"}`}>
              <CalendarDays size={11} /> {fmtDate(task.dueDate)}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5"><MessageSquare size={11} /> {task._count.comments}</span>
          )}
          {task._count.attachments > 0 && (
            <span className="flex items-center gap-0.5"><Paperclip size={11} /> {task._count.attachments}</span>
          )}
        </div>
        {task.assignee ? <Avatar name={task.assignee.name} avatar={task.assignee.avatar} size={24} ring /> : <span className="h-6 w-6 rounded-full border border-dashed border-ink/40" title="Unassigned" />}
      </div>
      {detailed && (
        <div className="mt-2.5 flex items-center justify-between">
          <PriorityBadge priority={task.priority} />
          <span className="text-[11px] font-bold underline-offset-2 group-hover:underline">View details</span>
        </div>
      )}
      {!detailed && task.priority !== "LOW" && task.priority !== "MEDIUM" && (
        <div className="mt-2"><PriorityBadge priority={task.priority} /></div>
      )}
    </div>
  );
}
