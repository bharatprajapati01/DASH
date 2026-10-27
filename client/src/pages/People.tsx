import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Mail, Search, Shield, UserMinus, UserPlus, Users } from "lucide-react";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, PriorityBadge, Skeleton, StatusBadge } from "@/components/ui";
import { InviteModal } from "@/components/layout/TopBar";
import { useOpenTask } from "@/components/tasks/TaskPanel";
import { api } from "@/lib/api";
import { useMembers, useTasks } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { errMsg, fmtDate, lastSeen } from "@/lib/format";
import type { Member } from "@/lib/types";

export default function PeoplePage() {
  const { isAdmin } = useSession();
  const [params, setParams] = useSearchParams();
  const members = useMembers();
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);

  const selectedId = params.get("member");
  const selected = members.data?.find((m) => m.id === selectedId) ?? null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("member");
    setParams(next, { replace: true });
  };

  const term = q.trim().toLowerCase();
  const list = (members.data ?? []).filter((m) => !term || m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term) || (m.jobTitle ?? "").toLowerCase().includes(term));

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={members.data ? `${members.data.length} ${members.data.length === 1 ? "person" : "people"} in this workspace` : "Your workspace directory"}
        actions={isAdmin && <button className="btn-primary" onClick={() => setInvite(true)}><UserPlus size={16} /> Invite member</button>}
      />
      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Search people" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {members.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[190px]" />)}</div>
      ) : members.isError ? (
        <ErrorState message={(members.error as Error).message} onRetry={() => members.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No one matches" hint="Try a different name, email or job title." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => {
            const seen = lastSeen(m.lastActiveAt);
            return (
              <li key={m.id}>
                <button
                  onClick={() => setParams({ member: m.id }, { replace: true })}
                  className="group h-full w-full rounded-card border border-line bg-white p-5 text-left shadow-soft transition hover:-translate-y-1 hover:shadow-lift"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} avatar={m.avatar} size={52} online={seen.online} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold">{m.name}</p>
                      <p className="truncate text-sm text-muted">{m.jobTitle ?? "Team member"}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><Mail size={12} /> {m.email}</p>
                    </div>
                    <RoleChip role={m.workspaceRole} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-2xl bg-lilac/60 p-2.5"><p className="text-xl font-extrabold tabular-nums">{m.assignedCount ?? 0}</p><p className="text-[11px] font-bold uppercase tracking-wide text-ink/60">Assigned</p></div>
                    <div className="rounded-2xl bg-lime/70 p-2.5"><p className="text-xl font-extrabold tabular-nums">{m.completedCount ?? 0}</p><p className="text-[11px] font-bold uppercase tracking-wide text-ink/60">Completed</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold">{m.currentProject ? `On ${m.currentProject.name}` : "No active project"}</span>
                    <span className={`shrink-0 font-semibold ${seen.online ? "text-success" : "text-muted"}`}>{seen.label}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <InviteModal open={invite} onClose={() => setInvite(false)} />
      <MemberModal member={selected} onClose={close} />
    </div>
  );
}

function RoleChip({ role }: { role: Member["workspaceRole"] }) {
  return role === "ADMIN" ? (
    <span className="chip shrink-0 bg-sun"><Shield size={12} /> Admin</span>
  ) : (
    <span className="chip shrink-0 bg-sky">Member</span>
  );
}

function MemberModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { user, workspace, isAdmin } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const openTask = useOpenTask();
  const [confirm, setConfirm] = useState(false);
  const tasks = useTasks({ assigneeId: member?.id, sort: "dueDate" }, { enabled: !!member });
  const open = (tasks.data ?? []).filter((t) => t.status !== "DONE").slice(0, 5);

  const refresh = () => {
    for (const k of ["members", "projects", "project", "tasks", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const setRole = useMutation({
    mutationFn: (role: string) => api.patch(`/workspaces/${workspace.id}/members/${member!.id}`, { role }),
    onSuccess: () => { toast.success("Role updated"); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspace.id}/members/${member!.id}`),
    onSuccess: () => { toast.success("Member removed"); setConfirm(false); refresh(); onClose(); },
    onError: (e) => { toast.error(errMsg(e)); setConfirm(false); },
  });

  const isOwner = member?.id === workspace.ownerId;
  const self = member?.id === user.id;

  return (
    <Modal open={!!member} onClose={onClose} title="Profile" width="max-w-lg">
      {member && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={member.name} avatar={member.avatar} size={72} online={lastSeen(member.lastActiveAt).online} />
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-xl font-extrabold">{member.name}{isOwner && <Crown size={16} className="text-warning" aria-label="Workspace owner" />}</h3>
              <p className="text-sm text-muted">{member.jobTitle ?? "Team member"}</p>
              <a href={`mailto:${member.email}`} className="text-sm font-semibold text-coral hover:underline">{member.email}</a>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Role"><RoleChip role={member.workspaceRole} /></Info>
            <Info label="Availability">{lastSeen(member.lastActiveAt).label}</Info>
            <Info label="Joined">{member.joinedAt ? fmtDate(member.joinedAt, true) : "—"}</Info>
            <Info label="Current project">{member.currentProject?.name ?? "None"}</Info>
            <Info label="Assigned tasks">{member.assignedCount ?? 0}</Info>
            <Info label="Completed">{member.completedCount ?? 0}</Info>
          </dl>

          <section>
            <h4 className="label">Open tasks</h4>
            {tasks.isLoading ? (
              <Skeleton className="h-16" />
            ) : open.length === 0 ? (
              <p className="rounded-xl bg-coral-light p-3 text-sm text-muted">No open tasks assigned.</p>
            ) : (
              <ul className="space-y-1.5">
                {open.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => { onClose(); setTimeout(() => openTask(t.id), 0); }} className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left hover:bg-coral-light">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.project.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</span>
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin && (
            <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-coral-light/60 p-4">
              <label className="block min-w-[140px] flex-1">
                <span className="label">Workspace role</span>
                <select className="input" value={member.workspaceRole} disabled={isOwner || setRole.isPending} onChange={(e) => setRole.mutate(e.target.value)}>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              {!isOwner && (
                <button className="btn-ghost text-danger" onClick={() => setConfirm(true)}>
                  <UserMinus size={16} /> {self ? "Leave workspace" : "Remove"}
                </button>
              )}
            </section>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={self ? "Leave this workspace?" : "Remove this member?"}
        message="They will lose access to the workspace and its projects, and their tasks will become unassigned."
        confirmLabel={self ? "Leave" : "Remove"}
        busy={remove.isPending}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
      />
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-bold">{children}</dd>
    </div>
  );
}
