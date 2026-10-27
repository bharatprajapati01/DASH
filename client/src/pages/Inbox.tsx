import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { Avatar, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { TaskPanel, useOpenTask } from "@/components/tasks/TaskPanel";
import { api } from "@/lib/api";
import { useInbox, useNotifications } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return match;
}

export default function InboxPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const desktop = useIsDesktop();
  const openTask = useOpenTask();
  const qc = useQueryClient();
  const inbox = useInbox(debounced);
  const notifications = useNotifications();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const markRead = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.post(`/notifications/${id}/read`))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const open = (taskId: string, unread: number) => {
    if (desktop) setSelected(taskId);
    else openTask(taskId);
    if (unread > 0) {
      const ids = (notifications.data?.notifications ?? []).filter((n) => !n.isRead && n.relatedTaskId === taskId && (n.type === "COMMENT" || n.type === "MENTION")).map((n) => n.id);
      if (ids.length) markRead.mutate(ids);
    }
  };

  const all = inbox.data ?? [];
  const list = unreadOnly ? all.filter((c) => c.unread > 0) : all;
  const totalUnread = all.reduce((n, c) => n + c.unread, 0);
  // Without a selection on desktop, show the first thread so the pane is never empty.
  const active = desktop ? (selected && list.some((c) => c.taskId === selected) ? selected : null) : null;

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Task discussions you can see, newest first." />

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section className={`card flex flex-col overflow-hidden ${active && !desktop ? "hidden" : ""}`} aria-label="Conversations">
          <div className="space-y-3 border-b border-line p-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-10" placeholder="Search conversations" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex gap-2" role="group" aria-label="Filter">
              <button onClick={() => setUnreadOnly(false)} aria-pressed={!unreadOnly} className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${!unreadOnly ? "bg-charcoal text-white" : "bg-coral-light text-ink/70"}`}>All</button>
              <button onClick={() => setUnreadOnly(true)} aria-pressed={unreadOnly} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold ${unreadOnly ? "bg-charcoal text-white" : "bg-coral-light text-ink/70"}`}>
                Unread {totalUnread > 0 && <span className="grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[11px] text-ink">{totalUnread}</span>}
              </button>
            </div>
          </div>
          <div className="scroll-thin max-h-[calc(100vh-300px)] min-h-[320px] flex-1 overflow-y-auto">
            {inbox.isLoading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : inbox.isError ? (
              <div className="p-4"><ErrorState message={(inbox.error as Error).message} onRetry={() => inbox.refetch()} /></div>
            ) : list.length === 0 ? (
              <div className="p-4"><EmptyState icon={<MessageCircle size={22} />} title={debounced ? "No conversations match" : unreadOnly ? "No unread messages" : "No conversations yet"} hint={debounced || unreadOnly ? undefined : "Comment on a task and the discussion will show up here."} /></div>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((c) => (
                  <li key={c.taskId}>
                    <button onClick={() => open(c.taskId, c.unread)} aria-current={active === c.taskId} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-coral-light/60 ${active === c.taskId ? "bg-coral-light" : ""}`}>
                      <Avatar name={c.lastComment.user.name} avatar={c.lastComment.user.avatar} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${c.unread ? "font-extrabold" : "font-bold"}`}>{c.title}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-muted">{timeAgo(c.lastComment.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.project.color }} />{c.project.name} · {c.commentCount} {c.commentCount === 1 ? "message" : "messages"}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[13px] text-ink/75"><b>{c.lastComment.user.name.split(" ")[0]}:</b> {c.lastComment.content}</span>
                      </span>
                      {c.unread > 0 && <span className="mt-1 grid min-w-[20px] place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {desktop && (
          <section className="card min-h-[420px] p-5" aria-label="Conversation">
            {active ? (
              <div>
                <button onClick={() => setSelected(null)} className="mb-3 flex items-center gap-1 text-xs font-bold text-muted hover:text-ink lg:hidden"><ArrowLeft size={14} /> Back</button>
                <TaskPanel key={active} taskId={active} onClose={() => setSelected(null)} />
              </div>
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center"><EmptyState icon={<MessageCircle size={22} />} title="Select a conversation" hint="Pick a task discussion on the left to read and reply." /></div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
