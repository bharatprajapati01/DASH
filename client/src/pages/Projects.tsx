import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, FolderKanban, Plus, Search, Users } from "lucide-react";
import { AvatarStack, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from "@/components/ui";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { useProjects } from "@/lib/queries";
import { fmtDate, PROJECT_STATUSES } from "@/lib/format";

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const team = params.get("filter") === "team";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // The sidebar's "Create New Board" link arrives as ?new=1.
  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
  }, [params]);

  const closeCreate = () => {
    setCreating(false);
    if (params.has("new")) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  };

  const projects = useProjects({ q: debounced, status, mine });
  const list = (projects.data ?? []).filter((p) => !team || p.members.length > 1);

  return (
    <div>
      <PageHeader
        title={team ? "Team Projects" : "All Projects"}
        subtitle={team ? "Projects shared by more than one person." : "Every board you can see in this workspace."}
        actions={
          <>
            {team && <Link to="/projects" className="btn-ghost">Show all projects</Link>}
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New project
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search projects" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={() => setMine((m) => !m)} aria-pressed={mine} className={`btn border ${mine ? "border-coral bg-coral text-ink" : "border-line bg-white hover:bg-coral-light"}`}>
          <Users size={16} /> My projects
        </button>
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[220px]" />)}</div>
      ) : projects.isError ? (
        <ErrorState message={(projects.error as Error).message} onRetry={() => projects.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title={debounced || status || mine || team ? "No projects match" : "No projects yet"}
          hint={debounced || status || mine || team ? "Try clearing a filter or searching for something else." : "Create a project to start adding tasks and inviting your team."}
          action={<button className="btn-primary" onClick={() => setCreating(true)}>Create project</button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <motion.li key={p.id} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.2 }}>
              <button onClick={() => navigate(`/projects/${p.id}`)} className="group flex h-full w-full flex-col overflow-hidden rounded-card border border-line bg-white text-left shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
                <div className="p-4" style={{ background: p.color }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold">{p.category}</span>
                    <span className="rounded-full bg-charcoal px-2.5 py-0.5 text-xs font-bold text-white">{PROJECT_STATUSES.find((s) => s.value === p.status)?.label}</span>
                  </div>
                  <h2 className="mt-5 line-clamp-1 text-xl font-extrabold">{p.name}</h2>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <p className="line-clamp-2 min-h-[40px] text-sm text-muted">{p.description || "No description yet."}</p>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-bold">
                      <span>{p.doneCount}/{p.taskCount} tasks</span>
                      <span className="tabular-nums">{p.completion}%</span>
                    </div>
                    <ProgressBar value={p.completion} color="#FF896D" />
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <AvatarStack users={p.members} max={4} />
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                      <CalendarDays size={14} /> {p.dueDate ? fmtDate(p.dueDate) : "No deadline"}
                    </span>
                  </div>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <ProjectFormModal open={creating} onClose={closeCreate} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </div>
  );
}
