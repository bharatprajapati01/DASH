import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, CalendarDays, FileText, KanbanSquare, ListTodo, Pencil, Plus, Search, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarStack, ConfirmDialog, EmptyState, ErrorState, Modal, ProgressBar, Skeleton } from "@/components/ui";
import { BoardView } from "@/components/tasks/BoardView";
import { ListView } from "@/components/tasks/ListView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useOpenTask } from "@/components/tasks/TaskPanel";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { ActivityFeed } from "@/components/projects/ActivityFeed";
import { FilesPanel } from "@/components/files/FilesPanel";
import { api } from "@/lib/api";
import { useMembers, useProject, useProjectActivity, useTasks } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { errMsg, fmtDate, PRIORITIES, PROJECT_STATUSES } from "@/lib/format";
import type { Project, TaskStatus } from "@/lib/types";

const VIEWS = [
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "list", label: "List", icon: ListTodo },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "files", label: "Files", icon: FileText },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const project = useProject(projectId);
  const openTask = useOpenTask();

  const view = (VIEWS.find((v) => v.id === params.get("view"))?.id ?? "board") as ViewId;
  const setView = (v: ViewId) => {
    const next = new URLSearchParams(params);
    next.set("view", v);
    setParams(next, { replace: true });
  };

  const [creating, setCreating] = useState<{ status?: TaskStatus; dueDate?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");

  const tasks = useTasks({ projectId });
  const activity = useProjectActivity(view === "activity" ? projectId : undefined);

  const del = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      toast.success("Project deleted");
      for (const k of ["projects", "dashboard", "tasks", "files"]) qc.invalidateQueries({ queryKey: [k] });
      navigate("/projects", { replace: true });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // If we lose access (removed from the project, or it was deleted), leave gracefully.
  useEffect(() => {
    if (project.isError) document.title = "FIBNK";
  }, [project.isError]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tasks.data ?? []).filter(
      (t) =>
        (!term || t.title.toLowerCase().includes(term) || t.labels.some((l) => l.toLowerCase().includes(term))) &&
        (!assignee || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee)) &&
        (!priority || t.priority === priority),
    );
  }, [tasks.data, q, assignee, priority]);

  if (project.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (project.isError || !project.data) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <ErrorState message={project.error ? (project.error as Error).message : "Project not found"} onRetry={() => project.refetch()} />
        <p className="mt-4 text-center"><Link to="/projects" className="btn-ghost">Back to projects</Link></p>
      </div>
    );
  }

  const p = project.data;
  const statusLabel = PROJECT_STATUSES.find((s) => s.value === p.status)?.label;
  const owner = p.members.find((m) => m.id === p.ownerId) ?? p.owner;

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <section className="overflow-hidden rounded-card border border-line">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6" style={{ background: p.color }}>
          <div className="min-w-0">
            <nav className="mb-2 text-xs font-bold text-ink/60" aria-label="Breadcrumb">
              <Link to="/projects" className="hover:underline">Projects</Link> / {p.category}
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{p.name}</h1>
            {p.description && <p className="mt-2 max-w-2xl text-sm font-medium text-ink/75">{p.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-charcoal px-3 py-1 text-xs font-bold text-white">{statusLabel}</span>
            <button className="btn-dark" onClick={() => setCreating({})}><Plus size={16} /> Add task</button>
            {p.canManage && (
              <>
                <button className="btn bg-white/80 hover:bg-white" onClick={() => setEditing(true)} aria-label="Edit project"><Pencil size={16} /> Edit</button>
                <button className="btn bg-white/80 text-danger hover:bg-white" onClick={() => setConfirmDelete(true)} aria-label="Delete project"><Trash2 size={16} /></button>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-4 bg-white p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-center">
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-bold">
              <span>{p.doneCount} of {p.taskCount} tasks done</span>
              <span className="tabular-nums">{p.completion}%</span>
            </div>
            <ProgressBar value={p.completion} />
          </div>
          <Meta label="Owner">
            {owner && <span className="flex items-center gap-2 font-bold"><Avatar name={owner.name} avatar={owner.avatar} size={24} />{owner.name}</span>}
          </Meta>
          <Meta label="Start"><span className="font-bold">{p.startDate ? fmtDate(p.startDate, true) : "Not set"}</span></Meta>
          <Meta label="Deadline"><span className="font-bold">{p.dueDate ? fmtDate(p.dueDate, true) : "Not set"}</span></Meta>
          <button onClick={() => setTeamOpen(true)} className="flex items-center gap-2 justify-self-start rounded-full border border-line px-3 py-1.5 hover:bg-coral-light lg:justify-self-end" aria-label="Manage team">
            <AvatarStack users={p.members} max={4} size={28} />
            <Users size={16} />
          </button>
        </div>
      </section>

      {/* ---------- View switcher + filters ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="scroll-thin flex max-w-full gap-1 overflow-x-auto rounded-full bg-coral-light p-1" role="tablist" aria-label="Project views">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${view === v.id ? "bg-charcoal text-white shadow-soft" : "text-ink/70 hover:text-ink"}`}>
              <v.icon size={15} /> {v.label}
            </button>
          ))}
        </div>
        {view === "board" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !min-h-[40px] !w-44 pl-9" placeholder="Search tasks" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input !min-h-[40px] !w-auto" aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Everyone</option>
              <option value={user.id}>Me</option>
              <option value="none">Unassigned</option>
              {p.members.filter((m) => m.id !== user.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className="input !min-h-[40px] !w-auto" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Any priority</option>
              {PRIORITIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ---------- Views ---------- */}
      {view !== "activity" && view !== "files" && view !== "calendar" && tasks.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : tasks.isError && (view === "board" || view === "list") ? (
        <ErrorState message={(tasks.error as Error).message} onRetry={() => tasks.refetch()} />
      ) : view === "board" ? (
        <BoardView tasks={filtered} onOpenTask={openTask} onAdd={(status) => setCreating({ status })} />
      ) : view === "list" ? (
        (tasks.data ?? []).length === 0 ? (
          <EmptyState icon={<ListTodo size={22} />} title="No tasks yet" hint="Add the first task to get this project moving." action={<button className="btn-primary" onClick={() => setCreating({})}>Add task</button>} />
        ) : (
          <ListView tasks={tasks.data ?? []} onOpenTask={openTask} initialSort="dueDate" />
        )
      ) : view === "calendar" ? (
        <div className="card p-4 sm:p-5"><CalendarView projectId={p.id} onOpenTask={openTask} onCreate={(day) => setCreating({ dueDate: day })} /></div>
      ) : view === "activity" ? (
        <div className="card p-5">
          {activity.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : activity.isError ? <ErrorState message={(activity.error as Error).message} onRetry={() => activity.refetch()} /> : <ActivityFeed items={activity.data ?? []} onOpenTask={openTask} />}
        </div>
      ) : (
        <div className="card p-5"><FilesPanel projectId={p.id} canManage={!!p.canManage} /></div>
      )}

      <TaskFormModal open={!!creating} onClose={() => setCreating(null)} projectId={p.id} defaults={creating ?? undefined} />
      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={p} />
      <TeamModal open={teamOpen} onClose={() => setTeamOpen(false)} project={p} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project?"
        message={`“${p.name}” and all of its ${p.taskCount} tasks, comments and files will be permanently deleted for everyone.`}
        confirmLabel="Delete project"
        busy={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

/** Add or remove project members. Only owners and workspace admins can change the team. */
function TeamModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { user } = useSession();
  const workspaceMembers = useMembers();
  const qc = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = () => {
    for (const k of ["project", "projects", "dashboard", "tasks", "activity", "members"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const add = useMutation({
    mutationFn: (userId: string) => api.post(`/projects/${project.id}/members`, { userId }),
    onSuccess: () => { toast.success("Member added"); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/projects/${project.id}/members/${userId}`),
    onSuccess: () => { toast.success("Member removed"); setRemoving(null); refresh(); },
    onError: (e) => { toast.error(errMsg(e)); setRemoving(null); },
  });

  const memberIds = new Set(project.members.map((m) => m.id));
  const available = (workspaceMembers.data ?? []).filter((m) => !memberIds.has(m.id));

  return (
    <Modal open={open} onClose={onClose} title="Project team">
      <div className="space-y-6">
        <section>
          <h3 className="label">Members ({project.members.length})</h3>
          <ul className="space-y-1">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-coral-light/60">
                <Avatar name={m.name} avatar={m.avatar} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{m.name}{m.id === user.id && <span className="ml-1 text-xs font-semibold text-muted">(you)</span>}</span>
                  <span className="block truncate text-xs text-muted">{m.jobTitle ?? m.email}</span>
                </span>
                {m.id === project.ownerId ? (
                  <span className="chip bg-sun">Owner</span>
                ) : (project.canManage || m.id === user.id) ? (
                  <button className="btn-ghost !min-h-[34px] !px-3 text-xs" onClick={() => setRemoving(m.id)} aria-label={`${m.id === user.id ? "Leave" : "Remove"} ${m.name}`}>
                    <UserMinus size={14} /> {m.id === user.id ? "Leave" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {project.canManage && (
          <section>
            <h3 className="label">Add from workspace</h3>
            {workspaceMembers.isLoading ? (
              <Skeleton className="h-12" />
            ) : available.length === 0 ? (
              <p className="rounded-xl bg-coral-light p-3 text-sm text-muted">Everyone in the workspace is already on this project. Invite more people from the People page.</p>
            ) : (
              <ul className="space-y-1">
                {available.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-coral-light/60">
                    <Avatar name={m.name} avatar={m.avatar} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{m.name}</span>
                      <span className="block truncate text-xs text-muted">{m.jobTitle ?? m.email}</span>
                    </span>
                    <button className="btn-primary !min-h-[34px] !px-3 text-xs" disabled={add.isPending} onClick={() => add.mutate(m.id)}>
                      <UserPlus size={14} /> Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        title={removing === user.id ? "Leave this project?" : "Remove member?"}
        message={removing === user.id ? "You will lose access to this project unless you are a workspace admin." : "Their tasks on this project will become unassigned."}
        confirmLabel={removing === user.id ? "Leave" : "Remove"}
        busy={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </Modal>
  );
}

