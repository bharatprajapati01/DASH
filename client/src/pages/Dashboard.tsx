import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, FileText, FolderPlus, MessageCircle, Plus, Users } from "lucide-react";
import { Avatar, AvatarStack, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui";
import { CalendarView } from "@/components/tasks/CalendarView";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useOpenTask } from "@/components/tasks/TaskPanel";
import { useDashboard, useFiles, useInbox } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { fileKind, fmtDate, fmtSize, lastSeen, timeAgo } from "@/lib/format";

function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex flex-col p-5 ${className}`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { user, workspace } = useSession();
  const [range, setRange] = useState<"week" | "month">("week");
  const [creating, setCreating] = useState<{ dueDate?: string } | null>(null);
  const dash = useDashboard(range);
  const openTask = useOpenTask();
  const navigate = useNavigate();

  const d = dash.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{workspace.name}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting()}, {user.name.split(" ")[0]} <span aria-hidden>👋</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/projects?new=1" className="btn-ghost">
            <FolderPlus size={16} /> New project
          </Link>
          <button className="btn-primary" onClick={() => setCreating({})}>
            <Plus size={16} /> New task
          </button>
        </div>
      </div>

      {dash.isError ? (
        <ErrorState message={(dash.error as Error).message} onRetry={() => dash.refetch()} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.25fr_1.25fr_1fr]">
          {/* ---------------- All Projects ---------------- */}
          <Card title="All Projects" action={<Link to="/projects" className="text-sm font-bold text-coral hover:underline">View all</Link>}>
            {dash.isLoading ? (
              <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px]" />)}</div>
            ) : d && d.projects.length === 0 ? (
              <EmptyState title="No projects yet" hint="Create your first project to start planning." action={<Link to="/projects?new=1" className="btn-primary">Create project</Link>} />
            ) : (
              <ul className="space-y-3">
                {d?.projects.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="group w-full rounded-[20px] p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:-translate-y-0.5"
                      style={{ background: p.color }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-extrabold">{p.name}</p>
                          <p className="truncate text-xs font-semibold text-ink/60">{p.category}</p>
                        </div>
                        <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-sm font-extrabold tabular-nums">{p.completion}%</span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar value={p.completion} color="#292929" height={6} />
                        </div>
                        <AvatarStack users={p.members} max={3} size={24} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---------------- Progress Analytics ---------------- */}
          <Card
            title="Progress"
            action={
              <div className="flex rounded-full bg-coral-light p-1 text-xs font-bold" role="group" aria-label="Chart range">
                {(["week", "month"] as const).map((r) => (
                  <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={`rounded-full px-3 py-1 capitalize transition ${range === r ? "bg-charcoal text-white" : "text-muted hover:text-ink"}`}>
                    {r}
                  </button>
                ))}
              </div>
            }
          >
            {dash.isLoading || !d ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
                <Skeleton className="h-[190px]" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Total tasks" value={d.totals.total} bg="#D9D1FF" change={d.totals.createdChange} />
                  <Stat label="Completed" value={d.totals.completed} bg="#C7FF24" change={d.totals.completedChange} />
                  <Stat label="In progress" value={d.totals.inProgress} bg="#FFE735" />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted">
                  <span>{range === "week" ? "Last 7 days" : "Last 4 weeks"}</span>
                  <span className="flex items-center gap-3">
                    <Legend color="#FF896D" label="Created" />
                    <Legend color="#292929" label="Completed" />
                  </span>
                </div>
                <div className="mt-2 h-[190px]" role="img" aria-label={`Bar chart of tasks created and completed over the last ${range === "week" ? "7 days" : "4 weeks"}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.chart} barGap={3} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#F0D5CE" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#777777" }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#777777" }} />
                      <Tooltip cursor={{ fill: "#FFF0EB" }} contentStyle={{ borderRadius: 12, border: "1px solid #F0D5CE", fontSize: 12, fontWeight: 600 }} />
                      <Bar dataKey="created" name="Created" fill="#FF896D" radius={[6, 6, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="completed" name="Completed" fill="#292929" radius={[6, 6, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 size={16} className="text-success" />
                  {d.totals.completionRate}% of all tasks are done
                </div>
              </>
            )}
          </Card>

          {/* ---------------- Team Members ---------------- */}
          <Card title="Team" action={<Link to="/people" className="text-sm font-bold text-coral hover:underline">See all</Link>}>
            {dash.isLoading || !d ? (
              <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : d.members.length === 0 ? (
              <EmptyState title="Just you so far" hint="Invite teammates from the People page." icon={<Users size={22} />} />
            ) : (
              <ul className="space-y-1">
                {d.members.slice(0, 6).map((m) => {
                  const seen = lastSeen(m.lastActiveAt);
                  return (
                    <li key={m.id}>
                      <Link to={`/people?member=${m.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-coral-light">
                        <Avatar name={m.name} avatar={m.avatar} size={40} online={seen.online} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{m.name}</span>
                          <span className="block truncate text-xs text-muted">{m.jobTitle ?? (m.workspaceRole === "ADMIN" ? "Admin" : "Member")}</span>
                        </span>
                        <span className={`shrink-0 text-[11px] font-semibold ${seen.online ? "text-success" : "text-muted"}`}>{seen.online ? "Online" : timeAgo(m.lastActiveAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ---------------- Project calendar ---------------- */}
      <Card title="Project Calendar" className="overflow-hidden">
        <CalendarView onOpenTask={openTask} onCreate={(day) => setCreating({ dueDate: day })} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <FilesCard />
        <CommunicationCard />
      </div>

      <TaskFormModal open={!!creating} onClose={() => setCreating(null)} defaults={creating ?? undefined} />
    </div>
  );
}

function Stat({ label, value, bg, change }: { label: string; value: number; bg: string; change?: number }) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="rounded-2xl p-3" style={{ background: bg }}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {change !== undefined && (
        <p className="mt-0.5 flex items-center gap-0.5 text-[11px] font-bold" aria-label={`${up ? "Up" : "Down"} ${Math.abs(change)} percent versus the previous period`}>
          {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(change)}%
        </p>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function FilesCard() {
  const files = useFiles({});
  return (
    <Card title="Project Files" action={<Link to="/documents" className="flex items-center gap-1 text-sm font-bold text-coral hover:underline">Open <ArrowRight size={14} /></Link>}>
      {files.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : files.isError ? (
        <ErrorState message={(files.error as Error).message} onRetry={() => files.refetch()} />
      ) : files.data && files.data.length === 0 ? (
        <EmptyState title="No files yet" hint="Upload briefs, mockups and docs from the Documents page." icon={<FileText size={22} />} />
      ) : (
        <ul className="divide-y divide-line">
          {files.data?.slice(0, 5).map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold" style={{ background: f.project?.color ?? "#FFF0EB" }}>
                {fileKind(f.fileName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{f.fileName}</span>
                <span className="block truncate text-xs text-muted">
                  {f.project?.name} · {f.uploadedBy.name} · {fmtDate(f.createdAt)}
                </span>
              </span>
              <span className="text-xs font-semibold text-muted">{fmtSize(f.fileSize)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CommunicationCard() {
  const inbox = useInbox("");
  const openTask = useOpenTask();
  return (
    <Card title="Team Communication" action={<Link to="/inbox" className="flex items-center gap-1 text-sm font-bold text-coral hover:underline">Inbox <ArrowRight size={14} /></Link>}>
      {inbox.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : inbox.isError ? (
        <ErrorState message={(inbox.error as Error).message} onRetry={() => inbox.refetch()} />
      ) : inbox.data && inbox.data.length === 0 ? (
        <EmptyState title="No conversations yet" hint="Comment on a task to start a discussion." icon={<MessageCircle size={22} />} />
      ) : (
        <ul className="space-y-1">
          {inbox.data?.slice(0, 4).map((c) => (
            <li key={c.taskId}>
              <button onClick={() => openTask(c.taskId)} className="flex w-full items-start gap-3 rounded-2xl p-2 text-left transition hover:bg-coral-light">
                <Avatar name={c.lastComment.user.name} avatar={c.lastComment.user.avatar} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{c.title}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-muted">{timeAgo(c.lastComment.createdAt)}</span>
                  </span>
                  <span className="line-clamp-1 block text-xs text-muted">
                    <b className="text-ink">{c.lastComment.user.name.split(" ")[0]}:</b> {c.lastComment.content}
                  </span>
                </span>
                {c.unread > 0 && <span className="mt-1 grid min-w-[20px] place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold">{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
