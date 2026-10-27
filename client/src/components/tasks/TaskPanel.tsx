import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, MessageSquare, Paperclip, Pencil, Reply, Trash2, Upload, History, X } from "lucide-react";
import { Avatar, ConfirmDialog, ErrorState, Modal, Skeleton } from "../ui";
import { api } from "@/lib/api";
import { useComments, useProject, useTask, useTaskMutations } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { dateToIso, dayKey, errMsg, fileKind, fmtDateTime, fmtSize, PRIORITIES, STATUSES, timeAgo } from "@/lib/format";
import type { Comment, TaskDetail, User } from "@/lib/types";

export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params);
    next.set("task", id);
    setParams(next);
  };
}

export function TaskPanelHost() {
  const [params, setParams] = useSearchParams();
  const id = params.get("task");
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next, { replace: true });
  };
  return (
    <Modal open={!!id} onClose={close} side title={undefined} width="max-w-xl">
      {id && <TaskPanel taskId={id} onClose={close} />}
    </Modal>
  );
}

type Tab = "comments" | "files" | "activity";

export function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTask(taskId);
  const [tab, setTab] = useState<Tab>("comments");
  const [confirm, setConfirm] = useState(false);
  const { update, remove } = useTaskMutations();
  const toast = useToast();
  const project = useProject(task.data?.projectId);
  const { user } = useSession();

  if (task.isLoading) {
    return (
      <div className="space-y-4 py-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (task.error || !task.data) {
    return <ErrorState message={errMsg(task.error ?? new Error("This task could not be loaded. It may have been deleted."))} onRetry={() => task.refetch()} />;
  }
  const t = task.data;
  const members = project.data?.members ?? [];
  const canDelete = project.data?.canManage || t.createdById === user.id;

  const patch = (body: Record<string, unknown>) => update.mutate({ id: t.id, ...body });

  return (
    <div className="-mt-1">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.project.color }} />
            {t.project.name}
          </div>
          <EditableText value={t.title} onSave={(v) => v.trim() && patch({ title: v.trim() })} className="text-xl font-extrabold" label="Task title" />
        </div>
        <button onClick={onClose} aria-label="Close task" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-coral-light">
          <X size={18} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className={t.status === "DONE" ? "btn-ghost" : "btn-primary"}
          onClick={() => patch({ status: t.status === "DONE" ? "TODO" : "DONE" })}
          disabled={update.isPending}
        >
          <CheckCircle2 size={16} /> {t.status === "DONE" ? "Reopen task" : "Mark complete"}
        </button>
        {canDelete && (
          <button className="btn-ghost text-danger" onClick={() => setConfirm(true)}>
            <Trash2 size={16} /> Delete
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-coral-light/60 p-3 sm:gap-4 sm:p-4">
        <Prop label="Status">
          <select className="input" value={t.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Prop>
        <Prop label="Priority">
          <select className="input" value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Prop>
        <Prop label="Assignee">
          <select className="input" value={t.assigneeId ?? ""} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Prop>
        <Prop label="Due date">
          <input
            type="date"
            className="input"
            value={t.dueDate ? dayKey(t.dueDate) : ""}
            min={t.startDate ? dayKey(t.startDate) : undefined}
            onChange={(e) => patch({ dueDate: dateToIso(e.target.value) })}
          />
        </Prop>
        <Prop label="Start date">
          <input
            type="date"
            className="input"
            value={t.startDate ? dayKey(t.startDate) : ""}
            max={t.dueDate ? dayKey(t.dueDate) : undefined}
            onChange={(e) => patch({ startDate: dateToIso(e.target.value) })}
          />
        </Prop>
        <Prop label="Labels">
          <EditableText
            value={t.labels.join(", ")}
            placeholder="Add labels"
            onSave={(v) => patch({ labels: v.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 8) })}
            className="input flex items-center"
            label="Labels"
          />
        </Prop>
      </div>

      <div className="mt-4">
        <p className="label">Description</p>
        <EditableText value={t.description} multiline placeholder="Add a description…" onSave={(v) => patch({ description: v })} className="min-h-[72px] whitespace-pre-wrap text-sm" label="Description" />
      </div>

      <p className="mt-3 text-xs text-muted">
        Created by {t.createdBy.name} · {fmtDateTime(t.createdAt)} · Updated {timeAgo(t.updatedAt)}
      </p>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {([
          ["comments", "Comments", <MessageSquare key="c" size={15} />, t._count.comments],
          ["files", "Files", <Paperclip key="f" size={15} />, t.attachments.length],
          ["activity", "Activity", <History key="a" size={15} />, t.activities.length],
        ] as [Tab, string, ReactNode, number][]).map(([key, label, icon, n]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-bold ${tab === key ? "border-coral text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {icon} {label} <span className="rounded-full bg-coral-light px-1.5 text-xs">{n}</span>
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === "comments" && <CommentsTab taskId={t.id} members={members} />}
        {tab === "files" && <FilesTab task={t} />}
        {tab === "activity" && <ActivityTab task={t} />}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Delete this task?"
        message="The task, its comments and attachments will be permanently removed for everyone."
        busy={remove.isPending}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate(t.id, { onSuccess: () => { setConfirm(false); onClose(); } })}
      />
      {update.isError && <p className="sr-only" role="alert">{errMsg(update.error)}</p>}
      <span className="hidden">{toast ? "" : ""}</span>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Click-to-edit text that saves on blur or Cmd/Ctrl+Enter. */
function EditableText({ value, onSave, multiline, placeholder, className = "", label }: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; className?: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  if (editing) {
    const common = {
      autoFocus: true,
      value: draft,
      "aria-label": label,
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
      },
    };
    return multiline ? <textarea className="input min-h-[100px] py-2.5" {...common} /> : <input className="input" {...common} />;
  }
  return (
    <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} className={`group w-full rounded-xl text-left hover:bg-coral-light/70 ${className}`}>
      {value ? <span>{value}</span> : <span className="text-muted">{placeholder ?? "Click to edit"}</span>}
      <Pencil size={13} className="ml-2 inline opacity-0 transition group-hover:opacity-50" />
    </button>
  );
}

/* ---------------- Comments ---------------- */

function CommentsTab({ taskId, members }: { taskId: string; members: User[] }) {
  const comments = useComments(taskId);
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["comments", taskId] });
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const add = useMutation({
    mutationFn: (b: { content: string; parentCommentId?: string; mentions: string[] }) => api.post(`/tasks/${taskId}/comments`, b),
    onSuccess: () => {
      setReplyTo(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const edit = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.patch(`/comments/${id}`, { content }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e)),
  });

  const roots = (comments.data ?? []).filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => (comments.data ?? []).filter((c) => c.parentCommentId === id);

  const renderOne = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={`flex gap-3 ${isReply ? "ml-10 mt-3" : "mt-4"}`}>
      <Avatar name={c.user.name} avatar={c.user.avatar} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold">{c.user.name}</span>
          <span className="text-xs text-muted" title={fmtDateTime(c.createdAt)}>
            {timeAgo(c.createdAt)}
            {c.updatedAt !== c.createdAt && +new Date(c.updatedAt) - +new Date(c.createdAt) > 1000 ? " · edited" : ""}
          </span>
        </div>
        {editing === c.id ? (
          <InlineEdit initial={c.content} busy={edit.isPending} onCancel={() => setEditing(null)} onSave={(content) => edit.mutate({ id: c.id, content })} />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{highlightMentions(c.content, members)}</p>
        )}
        {editing !== c.id && (
          <div className="mt-1 flex gap-3 text-xs font-semibold text-muted">
            {!isReply && (
              <button onClick={() => setReplyTo(c)} className="flex items-center gap-1 hover:text-ink">
                <Reply size={12} /> Reply
              </button>
            )}
            {c.userId === user.id && (
              <>
                <button onClick={() => setEditing(c.id)} className="hover:text-ink">Edit</button>
                <button onClick={() => del.mutate(c.id)} className="hover:text-danger">Delete</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {comments.isLoading && <Skeleton className="h-20 w-full" />}
      {comments.error && <ErrorState message={errMsg(comments.error)} onRetry={() => comments.refetch()} />}
      {comments.data && roots.length === 0 && <p className="rounded-2xl bg-coral-light/50 px-4 py-6 text-center text-sm text-muted">No comments yet. Start the conversation and @mention a teammate.</p>}
      {roots.map((c) => (
        <div key={c.id}>
          {renderOne(c, false)}
          {repliesOf(c.id).map((r) => renderOne(r, true))}
        </div>
      ))}
      <div className="mt-5">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-coral-light px-3 py-1.5 text-xs font-semibold">
            Replying to {replyTo.user.name}
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={14} /></button>
          </div>
        )}
        <Composer
          members={members}
          busy={add.isPending}
          placeholder={replyTo ? "Write a reply…" : "Write a comment… use @ to mention"}
          onSubmit={(content, mentions) => add.mutate({ content, mentions, parentCommentId: replyTo?.id })}
        />
      </div>
    </div>
  );
}

function InlineEdit({ initial, onSave, onCancel, busy }: { initial: string; onSave: (v: string) => void; onCancel: () => void; busy: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-1">
      <textarea className="input min-h-[72px] py-2" value={v} onChange={(e) => setV(e.target.value)} maxLength={2000} autoFocus />
      <div className="mt-2 flex gap-2">
        <button className="btn-primary min-h-[34px] px-4" disabled={!v.trim() || busy} onClick={() => onSave(v)}>Save</button>
        <button className="btn-ghost min-h-[34px] px-4" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Composer({ members, onSubmit, busy, placeholder }: { members: User[]; onSubmit: (content: string, mentions: string[]) => void; busy: boolean; placeholder: string }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { user } = useSession();

  const suggestions = useMemo(
    () => (query === null ? [] : members.filter((m) => m.id !== user.id && m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5)),
    [query, members, user.id],
  );

  const onChange = (value: string) => {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const m = /(^|\s)@([\w ]{0,30})$/.exec(value.slice(0, caret));
    setQuery(m ? m[2]! : null);
  };

  const pick = (m: User) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[\w ]{0,30}$/, `@${m.name} `);
    setText(before + text.slice(caret));
    setQuery(null);
    ref.current?.focus();
  };

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    const mentions = members.filter((m) => content.includes(`@${m.name}`)).map((m) => m.id);
    onSubmit(content, mentions);
    setText("");
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder={placeholder}
        aria-label="Comment"
        className="input min-h-[84px] py-2.5"
      />
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-lift" role="listbox">
          {suggestions.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-coral-light">
                <Avatar name={m.name} avatar={m.avatar} size={24} /> {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{text.length}/2000</span>
        <button className="btn-primary min-h-[36px]" disabled={!text.trim() || busy} onClick={submit}>{busy ? "Posting…" : "Comment"}</button>
      </div>
    </div>
  );
}

export function highlightMentions(content: string, members: { name: string }[]): ReactNode {
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  if (names.length === 0) return content;
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return content.split(pattern).map((part, i) =>
    i % 2 === 1 ? <span key={i} className="rounded-md bg-lilac px-1 font-semibold">{part}</span> : <span key={i}>{part}</span>,
  );
}

/* ---------------- Files ---------------- */

function FilesTab({ task }: { task: TaskDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("taskId", task.id);
      return api.post(`/projects/${task.projectId}/files`, fd);
    },
    onSuccess: () => {
      toast.success("File uploaded");
      qc.invalidateQueries({ queryKey: ["task", task.id] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", task.id] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div>
      <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
      <button className="btn-ghost" onClick={() => input.current?.click()} disabled={upload.isPending}>
        <Upload size={16} /> {upload.isPending ? "Uploading…" : "Attach a file"}
      </button>
      <p className="mt-1 text-xs text-muted">PDF, PNG, JPG, DOCX, XLSX or ZIP.</p>
      <ul className="mt-3 space-y-2">
        {task.attachments.length === 0 && <li className="rounded-2xl bg-coral-light/50 px-4 py-6 text-center text-sm text-muted">No attachments yet.</li>}
        {task.attachments.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-light text-xs font-extrabold">{fileKind(f.fileName)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{f.fileName}</span>
              <span className="text-xs text-muted">{fmtSize(f.fileSize)} · {f.uploadedBy.name} · {timeAgo(f.createdAt)}</span>
            </span>
            <a href={`/api/files/${f.id}/download`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-coral-light" aria-label={`Download ${f.fileName}`}><Download size={16} /></a>
            <button onClick={() => del.mutate(f.id)} className="grid h-9 w-9 place-items-center rounded-full text-danger hover:bg-danger/10" aria-label={`Delete ${f.fileName}`}><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
      <span className="hidden"><FileText /></span>
    </div>
  );
}

/* ---------------- Activity ---------------- */

function ActivityTab({ task }: { task: TaskDetail }) {
  if (task.activities.length === 0) return <p className="rounded-2xl bg-coral-light/50 px-4 py-6 text-center text-sm text-muted">No activity recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {task.activities.map((a) => (
        <li key={a.id} className="flex gap-3">
          <Avatar name={a.user.name} avatar={a.user.avatar} size={28} />
          <div className="text-sm">
            <span className="font-bold">{a.user.name}</span> {a.details}
            <div className="text-xs text-muted">{timeAgo(a.createdAt)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
