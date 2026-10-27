import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { dateToIso, dayKey, isOverdue } from "@/lib/format";
import { useTaskMutations, useTasks } from "@/lib/queries";
import { ErrorState, Skeleton } from "../ui";
import type { Task } from "@/lib/types";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const startOfWeek = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function CalendarView({ projectId, onOpenTask, onCreate }: { projectId?: string; onOpenTask: (id: string) => void; onCreate: (day: string) => void }) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [dir, setDir] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const { update } = useTaskMutations();

  const days = useMemo(() => {
    if (mode === "week") {
      const s = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const total = Math.ceil((last.getDate() + first.getDay()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => addDays(s, i));
  }, [cursor, mode]);

  const from = days[0]!;
  const to = addDays(days[days.length - 1]!, 1);
  const tasks = useTasks({ projectId, from: from.toISOString(), to: to.toISOString(), sort: "dueDate" });

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks.data ?? []) {
      if (!t.dueDate) continue;
      const k = dayKey(t.dueDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [tasks.data]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const step = (n: number) => {
    setDir(n);
    setCursor((c) => (mode === "week" ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)));
  };

  const todayKey = dayKey(new Date());
  const title =
    mode === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${days[0]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6]!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const task = tasks.data?.find((t) => t.id === e.active.id);
    const target = String(e.over.id).replace("day:", "");
    if (!task || (task.dueDate && dayKey(task.dueDate) === target)) return;
    update.mutate({ id: task.id, dueDate: dateToIso(target) });
  };

  const active = activeId ? tasks.data?.find((t) => t.id === activeId) : undefined;

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-full border border-line hover:bg-coral-light" onClick={() => step(-1)} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button>
          <button className="grid h-10 w-10 place-items-center rounded-full border border-line hover:bg-coral-light" onClick={() => step(1)} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button>
          <h2 className="ml-2 text-lg font-extrabold sm:text-xl" aria-live="polite">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost min-h-[38px]" onClick={() => setCursor(new Date())}>Today</button>
          <div className="flex rounded-full bg-coral-light p-1" role="group" aria-label="Calendar mode">
            {(["month", "week"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-full px-4 py-1.5 text-sm font-bold capitalize ${mode === m ? "bg-charcoal text-white" : "text-ink/70"}`}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      {tasks.error && <ErrorState message="Couldn't load the calendar." onRetry={() => tasks.refetch()} />}
      {tasks.isLoading && <Skeleton className="h-[420px] w-full" />}

      {tasks.data && (
        <>
          {/* Desktop / tablet grid with drag-and-drop scheduling */}
          <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
            <div className="hidden md:block">
              <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-xs font-bold uppercase tracking-wide text-muted">
                {DOW.map((d) => <div key={d}>{d}</div>)}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${mode}-${days[0]!.toISOString()}`}
                  initial={reduce ? false : { opacity: 0, x: 24 * dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.16 }}
                  className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line"
                >
                  {days.map((d) => (
                    <DayCell
                      key={d.toISOString()}
                      day={d}
                      muted={mode === "month" && d.getMonth() !== cursor.getMonth()}
                      isToday={dayKey(d) === todayKey}
                      tall={mode === "week"}
                      tasks={byDay.get(dayKey(d)) ?? []}
                      onOpenTask={onOpenTask}
                      onCreate={() => onCreate(dayKey(d))}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
            <DragOverlay>{active ? <TaskCard task={active} dragging showProject={false} /> : null}</DragOverlay>
          </DndContext>

          {/* Phone: agenda list (touch-friendly, no horizontal scrolling) */}
          <div className="md:hidden">
            <Agenda days={days} byDay={byDay} todayKey={todayKey} mode={mode} cursor={cursor} onOpenTask={onOpenTask} onCreate={onCreate} />
          </div>
          {(tasks.data ?? []).length === 0 && <p className="mt-4 text-center text-sm text-muted">No tasks with due dates in this range. Click a day to add one.</p>}
        </>
      )}
    </div>
  );
}

function DayCell({ day, muted, isToday, tall, tasks, onOpenTask, onCreate }: { day: Date; muted: boolean; isToday: boolean; tall: boolean; tasks: Task[]; onOpenTask: (id: string) => void; onCreate: () => void }) {
  const key = dayKey(day);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}` });
  const [expanded, setExpanded] = useState(false);
  const limit = tall || expanded ? 50 : 2;
  const shown = tasks.slice(0, limit);
  return (
    <div ref={setNodeRef} className={`group relative flex flex-col gap-1.5 p-1.5 ${tall ? "min-h-[360px]" : "min-h-[132px]"} ${muted ? "bg-coral-light/40" : "bg-white"} ${isOver ? "!bg-coral-light ring-2 ring-inset ring-coral" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-bold ${isToday ? "bg-coral text-ink" : muted ? "text-muted/60" : "text-ink"}`} aria-label={isToday ? `Today, ${key}` : key}>
          {day.getDate()}
        </span>
        <button onClick={onCreate} aria-label={`Add task on ${day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`} className="grid h-6 w-6 place-items-center rounded-full bg-charcoal text-white opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100">
          <Plus size={13} />
        </button>
      </div>
      {shown.map((t) => <DraggableCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} detailed={tall} />)}
      {tasks.length > limit && (
        <button onClick={() => setExpanded(true)} className="rounded-lg bg-charcoal px-2 py-1 text-[11px] font-bold text-white">+{tasks.length - limit} more</button>
      )}
    </div>
  );
}

function DraggableCard({ task, onOpen, detailed }: { task: Task; onOpen: () => void; detailed: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1, touchAction: "manipulation" }}>
      <CompactCard task={task} onOpen={onOpen} detailed={detailed} />
    </div>
  );
}

/** Cards vary in height: more content (description, labels) makes a taller card. */
function CompactCard({ task, onOpen, detailed }: { task: Task; onOpen: () => void; detailed: boolean }) {
  const hasBody = !!task.description;
  return <TaskCard task={task} onOpen={onOpen} showProject={false} detailed={detailed || hasBody} />;
}

function Agenda({ days, byDay, todayKey, mode, cursor, onOpenTask, onCreate }: { days: Date[]; byDay: Map<string, Task[]>; todayKey: string; mode: "month" | "week"; cursor: Date; onOpenTask: (id: string) => void; onCreate: (day: string) => void }) {
  const visible = days.filter((d) => (mode === "week" ? true : d.getMonth() === cursor.getMonth()));
  return (
    <ul className="space-y-3">
      {visible.map((d) => {
        const k = dayKey(d);
        const items = byDay.get(k) ?? [];
        if (mode === "month" && items.length === 0 && k !== todayKey) return null;
        return (
          <li key={k}>
            <div className="mb-2 flex items-center justify-between">
              <p className={`text-sm font-extrabold ${k === todayKey ? "text-coral" : ""}`}>
                {d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                {k === todayKey && " · Today"}
              </p>
              <button onClick={() => onCreate(k)} className="flex h-8 items-center gap-1 rounded-full bg-charcoal px-3 text-xs font-bold text-white"><Plus size={13} /> Add</button>
            </div>
            <div className="space-y-2">
              {items.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
              {items.length === 0 && <p className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">Nothing due</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export { isOverdue };
