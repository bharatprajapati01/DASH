import type { Priority, ProjectStatus, TaskStatus } from "./types";

export const STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: "TODO", label: "To Do", dot: "#777777" },
  { value: "IN_PROGRESS", label: "In Progress", dot: "#FF896D" },
  { value: "IN_REVIEW", label: "In Review", dot: "#8B7BFF" },
  { value: "DONE", label: "Done", dot: "#48A868" },
];

export const PRIORITIES: { value: Priority; label: string; color: string; bg: string }[] = [
  { value: "LOW", label: "Low", color: "#2B7FB0", bg: "#DDF4FF" },
  { value: "MEDIUM", label: "Medium", color: "#8A7600", bg: "#FFF6A8" },
  { value: "HIGH", label: "High", color: "#B8481F", bg: "#FFD9CC" },
  { value: "URGENT", label: "Urgent", color: "#B72F2F", bg: "#FFD0D0" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
];

export const PROJECT_COLORS = ["#FF896D", "#FFE735", "#C7FF24", "#D9D1FF", "#DDF4FF"];

export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.value === p)!;

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function lastSeen(iso: string): { label: string; online: boolean } {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 5) return { label: "Online now", online: true };
  return { label: `Active ${timeAgo(iso)}`, online: false };
}

export function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "No date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** yyyy-mm-dd in local time, for <input type="date"> and calendar keys. */
export function dayKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due || status === "DONE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due) < today;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  return ext === "JPEG" ? "JPG" : ext;
}

/** Local noon keeps a picked date stable across time zones. */
export function dateToIso(day: string | null | undefined): string | null {
  if (!day) return null;
  return new Date(`${day}T12:00:00`).toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
