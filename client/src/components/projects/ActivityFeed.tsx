import { Link } from "react-router-dom";
import { CheckCircle2, FilePlus2, FolderPlus, MessageSquare, PenLine, Trash2, UserMinus, UserPlus, CalendarClock, Activity as ActivityIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, EmptyState } from "../ui";
import { timeAgo } from "@/lib/format";
import type { Activity } from "@/lib/types";

const ICONS: Record<string, { icon: ReactNode; bg: string }> = {
  "project.created": { icon: <FolderPlus size={14} />, bg: "#C7FF24" },
  "project.updated": { icon: <PenLine size={14} />, bg: "#DDF4FF" },
  "project.deadline": { icon: <CalendarClock size={14} />, bg: "#FFE735" },
  "task.created": { icon: <CheckCircle2 size={14} />, bg: "#FF896D" },
  "task.assigned": { icon: <UserPlus size={14} />, bg: "#D9D1FF" },
  "task.completed": { icon: <CheckCircle2 size={14} />, bg: "#C7FF24" },
  "task.status": { icon: <ActivityIcon size={14} />, bg: "#DDF4FF" },
  "task.updated": { icon: <PenLine size={14} />, bg: "#DDF4FF" },
  "task.deleted": { icon: <Trash2 size={14} />, bg: "#FFD0D0" },
  "comment.added": { icon: <MessageSquare size={14} />, bg: "#FFE735" },
  "file.uploaded": { icon: <FilePlus2 size={14} />, bg: "#D9D1FF" },
  "file.deleted": { icon: <Trash2 size={14} />, bg: "#FFD0D0" },
  "member.joined": { icon: <UserPlus size={14} />, bg: "#C7FF24" },
  "member.removed": { icon: <UserMinus size={14} />, bg: "#FFD0D0" },
};

/** Timeline of project events (created, assigned, completed, commented, deadline changed, joined…). */
export function ActivityFeed({ items, onOpenTask, showProject = false }: { items: Activity[]; onOpenTask?: (id: string) => void; showProject?: boolean }) {
  if (items.length === 0) return <EmptyState title="No activity yet" hint="Events like new tasks, comments and deadline changes will show up here." />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
      {items.map((a) => {
        const meta = ICONS[a.action] ?? { icon: <ActivityIcon size={14} />, bg: "#FFF0EB" };
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white" style={{ background: meta.bg }}>
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <Avatar name={a.user.name} avatar={a.user.avatar} size={18} />
                  {a.user.name}
                </span>{" "}
                <span className="text-ink/80">{a.details}</span>
                {a.task && (
                  <>
                    {" "}
                    {onOpenTask ? (
                      <button onClick={() => onOpenTask(a.task!.id)} className="font-bold text-coral hover:underline">{a.task.title}</button>
                    ) : (
                      <span className="font-bold">{a.task.title}</span>
                    )}
                  </>
                )}
                {showProject && a.project && (
                  <>
                    {" in "}
                    <Link to={`/projects/${a.project.id}`} className="font-bold hover:underline">{a.project.name}</Link>
                  </>
                )}
              </p>
              <p className="text-xs text-muted">{timeAgo(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
