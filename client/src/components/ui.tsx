import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Inbox, X } from "lucide-react";
import type { Priority, TaskStatus } from "@/lib/types";
import { initials, priorityMeta, STATUSES } from "@/lib/format";

/* ---------- Avatar ---------- */

const FALLBACKS = ["#FF896D", "#FFE735", "#C7FF24", "#D9D1FF", "#DDF4FF"];

function colorFor(seed: string, avatar?: string | null): string {
  if (avatar && /^#[0-9a-fA-F]{6}$/.test(avatar)) return avatar;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length]!;
}

export function Avatar({
  name,
  avatar,
  size = 32,
  ring = false,
  online,
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  ring?: boolean;
  online?: boolean;
}) {
  const isUrl = !!avatar && /^https?:\/\//.test(avatar);
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-bold text-ink ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size, background: isUrl ? "#eee" : colorFor(name, avatar), fontSize: Math.max(10, size * 0.38) }}
      title={name}
      aria-label={name}
    >
      {isUrl ? <img src={avatar!} alt={name} className="h-full w-full rounded-full object-cover" /> : initials(name)}
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-success" : "bg-[#BDBDBD]"}`}
        />
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 28 }: { users: { id: string; name: string; avatar: string | null }[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={u.name} avatar={u.avatar} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="grid place-items-center rounded-full bg-charcoal text-[10px] font-bold text-white ring-2 ring-white"
          style={{ width: size, height: size, marginLeft: -8 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ---------- Progress ---------- */

export function ProgressBar({ value, color = "#FF896D", height = 8 }: { value: number; color?: string; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="w-full overflow-hidden rounded-full bg-coral-light" style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: reduce ? `${value}%` : 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

/* ---------- Badges ---------- */

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = priorityMeta(priority);
  return (
    <span className="chip" style={{ background: p.bg, color: p.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
      {p.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUSES.find((x) => x.value === status)!;
  return (
    <span className="chip bg-white ring-1 ring-line">
      <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/* ---------- Skeletons and states ---------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-coral-light/40 px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-coral shadow-soft">{icon ?? <Inbox size={22} />}</div>
      <p className="text-base font-bold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-card border border-danger/30 bg-danger/5 px-6 py-8 text-center">
      <AlertTriangle className="text-danger" />
      <p className="text-sm font-semibold">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-1" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ---------- Modal / Drawer ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  side = false,
  width = "max-w-lg",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  side?: boolean;
  width?: string;
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  // Keep the latest onClose without re-running the open/close effect (parents pass a new function every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const root = panelRef.current;
      // Prefer a form field over the header's close button so typing can start immediately.
      (root?.querySelector<HTMLElement>("[autofocus],input:not([type=hidden]):not([readonly]),textarea,select") ?? root?.querySelector<HTMLElement>("button"))?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lastFocus.current?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-50 flex ${side ? "justify-end" : "items-end justify-center sm:items-center"} sm:p-4`}>
          <motion.div
            className="absolute inset-0 bg-charcoal/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : "Dialog"}
            initial={reduce ? { opacity: 0 } : side ? { x: 480, opacity: 0.6 } : { y: 40, opacity: 0, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : side ? { x: 480, opacity: 0 } : { y: 30, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
            className={`relative flex max-h-[92vh] w-full flex-col bg-white shadow-lift ${
              side ? "h-full max-h-none sm:max-w-xl sm:rounded-l-[28px]" : `${width} rounded-t-[28px] sm:rounded-[28px]`
            }`}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
                <h2 className="text-lg font-extrabold">{title}</h2>
                <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-coral-light">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && <div className="border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      {/* Wrapping label ties the text to its control without needing ids. */}
      <label className="block">
        <span className="label">{label}</span>
        {children}
      </label>
      {error && (
        <p className="mt-1 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
