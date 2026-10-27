import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Bell, BellRing, Check, CheckCheck, ChevronDown, Clock, FolderKanban, LifeBuoy, LogOut, Menu, MessageSquare, Plus, Search, Settings, UserPlus, Wifi, WifiOff } from "lucide-react";
import { Avatar } from "../ui";
import { api, qs } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useMembers, useNotifications } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import type { AppNotification, Project, Task } from "@/lib/types";
import { Modal } from "../ui";
import { useToast } from "@/lib/toast";
import { errMsg } from "@/lib/format";

function useOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, onOutside, active]);
}

function Dropdown({ trigger, children, align = "left", width = "w-64" }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className={`absolute top-full z-50 mt-2 ${width} max-w-[92vw] rounded-2xl border border-line bg-white p-2 text-ink shadow-lift ${align === "right" ? "right-0" : "left-0"}`}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopBar({ onOpenMenu, sidebarWidth }: { onOpenMenu: () => void; sidebarWidth: number }) {
  const { user, workspace, workspaces, setWorkspaceId, logout, socketConnected, isAdmin } = useSession();
  const members = useMembers();
  const navigate = useNavigate();
  const [newWs, setNewWs] = useState(false);
  const [invite, setInvite] = useState(false);

  return (
    <header className="fixed right-0 top-0 z-20 px-3 pt-3 sm:px-5 sm:pt-4" style={{ left: 0 }}>
      <div className="lg:transition-[padding] lg:duration-200" style={{ paddingLeft: `var(--sb, ${sidebarWidth}px)` }}>
        <div className="flex items-center gap-2 rounded-[26px] bg-charcoal px-3 py-2 text-white shadow-lift sm:gap-3 sm:px-4">
          <button onClick={onOpenMenu} aria-label="Open menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10 lg:hidden">
            <Menu size={20} />
          </button>

          <Dropdown
            width="w-72"
            trigger={(open, toggle) => (
              <button onClick={toggle} aria-expanded={open} className="flex h-10 max-w-[170px] items-center gap-2 rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-coral text-xs font-extrabold text-ink">{workspace.name[0]}</span>
                <span className="hidden truncate sm:inline">{workspace.name}</span>
                <ChevronDown size={14} />
              </button>
            )}
          >
            {(close) => (
              <div>
                <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">Workspaces</p>
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      setWorkspaceId(w.id);
                      close();
                      navigate("/");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-coral-light"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-coral text-xs font-extrabold">{w.name[0]}</span>
                    <span className="flex-1 truncate">{w.name}</span>
                    {w.id === workspace.id && <Check size={16} className="text-coral" />}
                  </button>
                ))}
                <div className="my-1 border-t border-line" />
                <button onClick={() => { close(); setNewWs(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-coral-light">
                  <Plus size={16} /> Create workspace
                </button>
              </div>
            )}
          </Dropdown>

          <div className="hidden md:block">
            <Dropdown
              trigger={(open, toggle) => (
                <button onClick={toggle} aria-expanded={open} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">
                  Management <ChevronDown size={14} />
                </button>
              )}
            >
              {(close) => (
                <div>
                  <MenuLink to="/projects" icon={<FolderKanban size={16} />} onClick={close}>Projects</MenuLink>
                  <MenuLink to="/people" icon={<UserPlus size={16} />} onClick={close}>People and roles</MenuLink>
                  <MenuLink to="/documents" icon={<Settings size={16} />} onClick={close}>Documents</MenuLink>
                  {isAdmin && (
                    <button onClick={() => { close(); setInvite(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-coral-light">
                      <UserPlus size={16} /> Invite someone
                    </button>
                  )}
                </div>
              )}
            </Dropdown>
          </div>
          <Link to="/help" className="hidden items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white lg:flex">
            <LifeBuoy size={16} /> Support Center
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link to="/people" className="hidden items-center sm:flex" aria-label="Team members">
              {(members.data ?? []).slice(0, 4).map((m, i) => (
                <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar name={m.name} avatar={m.avatar} size={28} ring />
                </span>
              ))}
            </Link>

            <GlobalSearch />

            <span className="hidden items-center sm:flex" title={socketConnected ? "Live updates connected" : "Reconnecting… changes still save"}>
              {socketConnected ? <Wifi size={16} className="text-lime" /> : <WifiOff size={16} className="text-warning" />}
            </span>

            <NotificationBell />

            <Dropdown
              align="right"
              width="w-64"
              trigger={(open, toggle) => (
                <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 hover:bg-white/20">
                  <Avatar name={user.name} avatar={user.avatar} size={32} />
                  <span className="hidden text-left leading-tight lg:block">
                    <span className="block text-sm font-bold">{user.name.split(" ")[0]}</span>
                    <span className="block text-[11px] text-white/60">{user.jobTitle ?? (isAdmin ? "Admin" : "Member")}</span>
                  </span>
                  <ChevronDown size={14} className="hidden lg:block" />
                </button>
              )}
            >
              {(close) => (
                <div>
                  <div className="px-3 py-2">
                    <p className="text-sm font-bold">{user.name}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                    <p className="mt-1 text-xs font-semibold text-coral">{user.jobTitle} · {isAdmin ? "Admin" : "Member"}</p>
                  </div>
                  <div className="my-1 border-t border-line" />
                  <MenuLink to="/profile" icon={<Settings size={16} />} onClick={close}>Profile and security</MenuLink>
                  <button onClick={() => { close(); logout(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10">
                    <LogOut size={16} /> Log out
                  </button>
                </div>
              )}
            </Dropdown>
          </div>
        </div>
      </div>
      <CreateWorkspaceModal open={newWs} onClose={() => setNewWs(false)} />
      <InviteModal open={invite} onClose={() => setInvite(false)} />
    </header>
  );
}

function MenuLink({ to, icon, children, onClick }: { to: string; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-coral-light">
      {icon} {children}
    </Link>
  );
}

function GlobalSearch() {
  const { workspace } = useSession();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: ["search", workspace.id, debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const [p, t] = await Promise.all([
        api.get<{ projects: Project[] }>(`/projects${qs({ workspaceId: workspace.id, q: debounced })}`),
        api.get<{ tasks: Task[] }>(`/tasks${qs({ workspaceId: workspace.id, q: debounced, limit: 6 })}`),
      ]);
      return { projects: p.projects.slice(0, 4), tasks: t.tasks.slice(0, 6) };
    },
  });

  const go = (to: string) => {
    setOpen(false);
    setTerm("");
    navigate(to);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 focus-within:bg-white/20 focus-within:ring-2 focus-within:ring-coral">
        <Search size={16} className="shrink-0 text-white/60" />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search"
          aria-label="Search projects and tasks"
          className="w-16 bg-transparent text-sm text-white outline-none placeholder:text-white/50 focus:w-32 sm:w-36 sm:focus:w-52"
          style={{ transition: "width .2s" }}
        />
      </div>
      {open && debounced.length >= 2 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-2xl border border-line bg-white p-2 text-ink shadow-lift">
          {results.isLoading && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}
          {results.data && results.data.projects.length === 0 && results.data.tasks.length === 0 && <p className="px-3 py-3 text-sm text-muted">Nothing matches “{debounced}”.</p>}
          {results.data?.projects.map((p) => (
            <button key={p.id} onClick={() => go(`/projects/${p.id}`)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-coral-light">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 truncate font-semibold">{p.name}</span>
              <span className="text-xs text-muted">Project</span>
            </button>
          ))}
          {results.data?.tasks.map((t) => (
            <button key={t.id} onClick={() => go(`/projects/${t.projectId}?task=${t.id}`)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-coral-light">
              <span className="h-3 w-3 rounded-sm" style={{ background: t.project.color }} />
              <span className="flex-1 truncate font-semibold">{t.title}</span>
              <span className="text-xs text-muted">{t.project.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const NOTE_ICON: Record<AppNotification["type"], ReactNode> = {
  TASK_ASSIGNED: <UserPlus size={16} />,
  COMMENT: <MessageSquare size={16} />,
  MENTION: <AtSign size={16} />,
  PROJECT_INVITE: <FolderKanban size={16} />,
  DEADLINE_SOON: <Clock size={16} />,
  OVERDUE: <BellRing size={16} />,
  STATUS_CHANGE: <Check size={16} />,
};

function NotificationBell() {
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const unread = data?.unreadCount ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  const open = (n: AppNotification, close: () => void) => {
    if (!n.isRead) markRead.mutate(n.id);
    close();
    if (n.relatedProjectId && n.relatedTaskId) navigate(`/projects/${n.relatedProjectId}?task=${n.relatedTaskId}`);
    else if (n.relatedProjectId) navigate(`/projects/${n.relatedProjectId}`);
  };

  return (
    <Dropdown
      align="right"
      width="w-[380px]"
      trigger={(isOpen, toggle) => (
        <button onClick={toggle} aria-expanded={isOpen} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <Bell size={18} />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span key={unread} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-extrabold text-ink">
                {unread > 99 ? "99+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-extrabold">Notifications</p>
            <button disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()} className="flex items-center gap-1 text-xs font-bold text-coral hover:underline disabled:text-muted disabled:no-underline">
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="scroll-thin max-h-[420px] overflow-y-auto">
            {!data && <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>}
            {data && data.notifications.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">You're all caught up.</p>}
            {data?.notifications.map((n) => (
              <button key={n.id} onClick={() => open(n, close)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-coral-light ${n.isRead ? "" : "bg-coral-light/60"}`}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-coral ring-1 ring-line">{NOTE_ICON[n.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm leading-snug ${n.isRead ? "text-ink/80" : "font-semibold"}`}>{n.message}</span>
                  <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { setWorkspaceId } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: () => api.post<{ workspace: { id: string } }>("/workspaces", { name }),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setWorkspaceId(d.workspace.id);
      toast.success("Workspace created");
      setName("");
      onClose();
      navigate("/");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal open={open} onClose={onClose} title="Create workspace" width="max-w-md" footer={<div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Creating…" : "Create"}</button></div>}>
      <label className="block"><span className="label">Workspace name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Team" maxLength={80} /></label>
    </Modal>
  );
}

export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const m = useMutation({
    mutationFn: () => api.post(`/workspaces/${workspace.id}/members`, { email, role }),
    onSuccess: () => {
      toast.success(`${email} was added to ${workspace.name}`);
      qc.invalidateQueries({ queryKey: ["members"] });
      setEmail("");
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal open={open} onClose={onClose} title="Invite to workspace" width="max-w-md" footer={<div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!email.includes("@") || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Inviting…" : "Invite"}</button></div>}>
      <div className="space-y-4">
        <label className="block"><span className="label">Email</span><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" /></label>
        <label className="block"><span className="label">Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select>
        </label>
        <p className="text-xs text-muted">They need an existing FIBNK account. Ask them to sign up first, then invite them by email.</p>
      </div>
    </Modal>
  );
}
