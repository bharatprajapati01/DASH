import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquare, Search } from "lucide-react";
import { Avatar, EmptyState, PriorityBadge } from "../ui";
import { fmtDate, isOverdue, PRIORITIES, STATUSES } from "@/lib/format";
import { useTaskMutations } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

type SortKey = "title" | "assignee" | "priority" | "status" | "dueDate" | "updated";
const PRIORITY_ORDER: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const STATUS_ORDER: Record<string, number> = { TODO: 1, IN_PROGRESS: 2, IN_REVIEW: 3, DONE: 4 };

export function ListView({ tasks, onOpenTask, showProject = false, initialSort = "updated" }: { tasks: Task[]; onOpenTask: (id: string) => void; showProject?: boolean; initialSort?: SortKey }) {
  const { update } = useTaskMutations();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: initialSort, dir: initialSort === "dueDate" ? 1 : -1 });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = tasks.filter(
      (t) => (!term || t.title.toLowerCase().includes(term) || t.labels.some((l) => l.toLowerCase().includes(term))) && (!status || t.status === status) && (!priority || t.priority === priority),
    );
    const val = (t: Task): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "assignee": return t.assignee?.name.toLowerCase() ?? "￿";
        case "priority": return PRIORITY_ORDER[t.priority]!;
        case "status": return STATUS_ORDER[t.status]!;
        case "dueDate": return t.dueDate ? +new Date(t.dueDate) : Number.MAX_SAFE_INTEGER;
        default: return +new Date(t.updatedAt);
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return x < y ? -sort.dir : x > y ? sort.dir : 0;
    });
  }, [tasks, q, status, priority, sort]);

  const th = (key: SortKey, label: string, cls = "") => (
    <button onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))} className={`flex items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wide text-muted hover:text-ink ${cls}`} aria-label={`Sort by ${label}`}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  const cols = showProject
    ? "md:grid-cols-[minmax(0,2.2fr)_1.2fr_1.2fr_110px_130px_100px_60px]"
    : "md:grid-cols-[minmax(0,2.4fr)_1.4fr_110px_130px_100px_60px]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search tasks or labels" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="input w-auto" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No tasks match" hint={tasks.length === 0 ? "Create a task to get this list going." : "Try clearing a filter or search term."} />
      ) : (
        <div className="card overflow-hidden">
          <div className={`hidden items-center gap-3 border-b border-line bg-coral-light/50 px-4 py-2.5 md:grid ${cols}`}>
            {th("title", "Task")}
            {showProject && <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Project</span>}
            {th("assignee", "Assignee")}
            {th("priority", "Priority")}
            {th("status", "Status")}
            {th("dueDate", "Due")}
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              <MessageSquare size={12} className="inline" />
            </span>
          </div>
          <ul>
            {rows.map((t) => (
              <li key={t.id} className={`grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-line/70 px-4 py-3 last:border-0 hover:bg-coral-light/30 ${cols}`}>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <button onClick={() => onOpenTask(t.id)} className={`block max-w-full truncate text-left text-sm font-bold hover:underline ${t.status === "DONE" ? "text-muted line-through" : ""}`}>
                    {t.title}
                  </button>
                  {t.labels.length > 0 && <div className="mt-0.5 flex gap-1">{t.labels.slice(0, 3).map((l) => <span key={l} className="rounded-full bg-lilac/60 px-1.5 text-[10px] font-bold">{l}</span>)}</div>}
                </div>
                {showProject && (
                  <span className="hidden items-center gap-2 truncate text-sm md:flex"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.project.color }} />{t.project.name}</span>
                )}
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  {t.assignee ? <><Avatar name={t.assignee.name} avatar={t.assignee.avatar} size={24} /><span className="truncate">{t.assignee.name}</span></> : <span className="text-muted">Unassigned</span>}
                </div>
                <div><PriorityBadge priority={t.priority} /></div>
                <select
                  className="rounded-full border border-line bg-white px-2 py-1.5 text-xs font-semibold focus:border-coral"
                  value={t.status}
                  onChange={(e) => update.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                  aria-label={`Status of ${t.title}`}
                >
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className={`text-sm font-medium ${isOverdue(t.dueDate, t.status) ? "text-danger" : "text-ink/80"}`}>{t.dueDate ? fmtDate(t.dueDate) : "—"}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-muted"><MessageSquare size={13} />{t._count.comments}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
