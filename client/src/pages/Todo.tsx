import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, KanbanSquare, ListTodo, Plus } from "lucide-react";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { BoardView } from "@/components/tasks/BoardView";
import { ListView } from "@/components/tasks/ListView";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useOpenTask } from "@/components/tasks/TaskPanel";
import { useProjects, useTasks, type TaskFilters } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { PRIORITIES, STATUSES } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

type Scope = NonNullable<TaskFilters["scope"]>;
const SCOPES: { id: Scope; label: string }[] = [
  { id: "assigned", label: "Assigned to me" },
  { id: "created", label: "Created by me" },
  { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];
const SORTS = [
  { id: "dueDate", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "updated", label: "Recently updated" },
] as const;

export default function TodoPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const openTask = useOpenTask();
  const projects = useProjects();
  const scope = (SCOPES.find((s) => s.id === params.get("scope"))?.id ?? "assigned") as Scope;
  const [view, setView] = useState<"list" | "board">("list");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("dueDate");
  const [creating, setCreating] = useState<{ status?: TaskStatus } | null>(null);

  const tasks = useTasks({ scope, projectId: projectId || undefined, priority: priority || undefined, status: status || undefined, deadline: deadline || undefined, sort });
  // Cheap counts so urgent buckets are visible from any tab.
  const overdue = useTasks({ scope: "overdue" });
  const today = useTasks({ scope: "today" });
  const counts: Partial<Record<Scope, number>> = { overdue: overdue.data?.length, today: today.data?.length };

  const setScope = (s: Scope) => {
    const next = new URLSearchParams(params);
    next.set("scope", s);
    setParams(next, { replace: true });
  };

  const hasFilters = !!(projectId || priority || status || deadline);
  const list = tasks.data ?? [];

  return (
    <div>
      <PageHeader
        title="To-do"
        subtitle="Everything on your plate across all projects."
        actions={<button className="btn-primary" onClick={() => setCreating({})}><Plus size={16} /> New task</button>}
      />

      <div className="scroll-thin mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Task groups">
        {SCOPES.map((s) => {
          const n = counts[s.id];
          const active = scope === s.id;
          return (
            <button key={s.id} role="tab" aria-selected={active} onClick={() => setScope(s.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${active ? "border-charcoal bg-charcoal text-white" : "border-line bg-white hover:bg-coral-light"}`}>
              {s.label}
              {!!n && n > 0 && <span className={`grid min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] ${s.id === "overdue" ? "bg-danger text-white" : "bg-coral text-ink"}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select className="input !min-h-[40px] !w-auto" aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input !min-h-[40px] !w-auto" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="input !min-h-[40px] !w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="input !min-h-[40px] !w-auto" aria-label="Filter by deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)}>
          <option value="">Any deadline</option>
          <option value="today">Due today</option>
          <option value="week">Next 7 days</option>
          <option value="overdue">Overdue</option>
          <option value="none">No deadline</option>
        </select>
        <select className="input !min-h-[40px] !w-auto" aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
        {hasFilters && <button className="text-sm font-bold text-coral hover:underline" onClick={() => { setProjectId(""); setPriority(""); setStatus(""); setDeadline(""); }}>Clear filters</button>}
        <div className="ml-auto flex rounded-full bg-coral-light p-1" role="group" aria-label="Layout">
          <button onClick={() => setView("list")} aria-pressed={view === "list"} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${view === "list" ? "bg-charcoal text-white" : "text-ink/70"}`}><ListTodo size={15} /> List</button>
          <button onClick={() => setView("board")} aria-pressed={view === "board"} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${view === "board" ? "bg-charcoal text-white" : "text-ink/70"}`}><KanbanSquare size={15} /> Board</button>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : tasks.isError ? (
        <ErrorState message={(tasks.error as Error).message} onRetry={() => tasks.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title={hasFilters ? "No tasks match these filters" : scope === "overdue" ? "Nothing overdue — nice work" : scope === "completed" ? "No completed tasks yet" : "You're all caught up"}
          hint={hasFilters ? "Try clearing a filter." : "New tasks assigned to you will appear here."}
          action={<button className="btn-primary" onClick={() => setCreating({ status: "TODO" })}>Create a task</button>}
        />
      ) : view === "list" ? (
        <ListView key={sort} tasks={list} onOpenTask={openTask} showProject initialSort={sort} />
      ) : (
        <BoardView tasks={list} onOpenTask={openTask} showProject onAdd={(s) => setCreating({ status: s })} />
      )}

      <TaskFormModal open={!!creating} onClose={() => setCreating(null)} defaults={{ ...creating, assigneeId: user.id }} />
    </div>
  );
}
