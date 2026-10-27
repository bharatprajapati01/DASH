import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileText,
  FolderKanban,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Users,
  UserSquare2,
  Layers,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { useProjects, useNotifications } from "@/lib/queries";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const location = useLocation();
  const [boardsOpen, setBoardsOpen] = useState(true);
  const projects = useProjects();
  const notifications = useNotifications();

  const unread = notifications.data?.notifications.filter((n) => !n.isRead) ?? [];
  const inboxBadge = unread.filter((n) => n.type === "COMMENT" || n.type === "MENTION").length;
  const todoBadge = unread.filter((n) => ["TASK_ASSIGNED", "DEADLINE_SOON", "OVERDUE"].includes(n.type)).length;
  const firstProject = projects.data?.[0]?.id;

  const boards: Item[] = [
    { to: "/projects", label: "All Projects", icon: FolderKanban, end: true },
    { to: firstProject ? `/projects/${firstProject}` : "/projects", label: "Project Details", icon: Layers },
    { to: "/todo?scope=assigned", label: "My Tasks", icon: CheckSquare },
    { to: "/projects?filter=team", label: "Team Projects", icon: Users },
    { to: "/projects?new=1", label: "Create New Board", icon: PlusCircle },
  ];
  const workspaceNav: Item[] = [
    { to: "/people", label: "People", icon: UserSquare2 },
    { to: "/todo", label: "To-do", icon: ListTodo, badge: todoBadge },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/inbox", label: "Inbox", icon: Inbox, badge: inboxBadge },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/help", label: "Help", icon: HelpCircle },
  ];

  const isActive = (item: Item) => {
    const [path, query] = item.to.split("?");
    if (location.pathname !== path && !(path !== "/" && !item.end && location.pathname.startsWith(`${path}/`))) return false;
    if (query) return location.search.includes(query);
    // Plain links should not light up when a query-specific sibling is active.
    if (path === "/projects" || path === "/todo") return !location.search;
    return true;
  };

  const content = (isMobile: boolean) => {
    const slim = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col bg-charcoal text-white">
        <div className={`flex items-center ${slim ? "justify-center px-3" : "justify-between px-5"} pb-4 pt-5`}>
          <Logo withText={!slim} />
          {isMobile ? (
            <button onClick={onCloseMobile} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
              <X size={18} />
            </button>
          ) : (
            !slim && (
              <button onClick={onToggle} aria-label="Collapse sidebar" className="grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                <PanelLeftClose size={18} />
              </button>
            )
          )}
        </div>
        {slim && (
          <button onClick={onToggle} aria-label="Expand sidebar" className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <PanelLeftOpen size={18} />
          </button>
        )}

        <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
          {!slim && <p className="px-3 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Frequently used</p>}
          <NavItem item={{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }} active={location.pathname === "/"} slim={slim} onNavigate={onCloseMobile} />

          <button
            onClick={() => (slim ? onToggle() : setBoardsOpen((o) => !o))}
            aria-expanded={boardsOpen}
            className="group relative mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <FolderKanban size={18} className="shrink-0" />
            {!slim && (
              <>
                <span className="flex-1 text-left">Project Boards</span>
                <ChevronDown size={16} className={`transition-transform ${boardsOpen ? "rotate-180" : ""}`} />
              </>
            )}
            {slim && <Tip label="Project Boards" />}
          </button>
          <AnimatePresence initial={false}>
            {boardsOpen && !slim && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <div className="ml-5 border-l border-white/10 pl-2">
                  {boards.map((b) => (
                    <NavItem key={b.label} item={b} active={isActive(b)} slim={false} onNavigate={onCloseMobile} compact />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!slim && <p className="px-3 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Workspace</p>}
          {slim && <div className="my-3 border-t border-white/10" />}
          {workspaceNav.map((n) => (
            <NavItem key={n.label} item={n} active={isActive(n)} slim={slim} onNavigate={onCloseMobile} />
          ))}
        </nav>

        {!slim && <DecorPanel />}
      </div>
    );
  };

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? "w-[76px]" : "w-[264px]"}`}>{content(false)}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-charcoal/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCloseMobile} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ duration: 0.2 }} className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw]">
              {content(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({ item, active, slim, onNavigate, compact }: { item: Item; active: boolean; slim: boolean; onNavigate: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative my-0.5 flex items-center gap-3 rounded-xl px-3 ${compact ? "py-2 text-[13px]" : "py-2.5 text-sm"} font-semibold transition hover:translate-x-0.5 ${
        active ? "bg-coral text-ink" : "text-white/80 hover:bg-white/10 hover:text-white"
      } ${slim ? "justify-center" : ""}`}
    >
      {active && <motion.span layoutId={compact ? undefined : "nav-indicator"} className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-sun" />}
      <Icon size={compact ? 16 : 18} className="shrink-0" />
      {!slim && <span className="flex-1 truncate">{item.label}</span>}
      {!!item.badge && item.badge > 0 && (
        <motion.span
          key={item.badge}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          className={`grid min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${slim ? "absolute right-1 top-1" : ""} ${active ? "bg-charcoal text-white" : "bg-coral text-ink"}`}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </motion.span>
      )}
      {slim && <Tip label={item.label} />}
    </NavLink>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-ink opacity-0 shadow-lift transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

/** Decorative coral panel at the bottom of the sidebar. */
function DecorPanel() {
  return (
    <div className="relative m-3 overflow-hidden rounded-[22px] bg-coral p-4 text-ink">
      <svg className="absolute -right-6 -top-6 opacity-90" width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <circle cx="70" cy="50" r="42" fill="#FFE735" />
        <circle cx="96" cy="86" r="22" fill="#C7FF24" />
        <path d="M10 100 Q40 60 70 100 T130 100 V120 H10Z" fill="#D9D1FF" />
      </svg>
      <p className="relative mt-16 text-base font-extrabold leading-tight">Ship faster, together.</p>
      <p className="relative mt-1 text-xs font-medium text-ink/70">Plan, assign and ship with your team in one place.</p>
    </div>
  );
}
