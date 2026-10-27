import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { STATUSES } from "@/lib/format";
import { useTaskMutations } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

export function BoardView({
  tasks,
  onOpenTask,
  onAdd,
  showProject = false,
}: {
  tasks: Task[];
  onOpenTask: (id: string) => void;
  onAdd?: (status: TaskStatus) => void;
  showProject?: boolean;
}) {
  const { move } = useTaskMutations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press-and-hold keeps vertical scrolling usable on touch screens.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
    for (const t of tasks) by[t.status].push(t);
    for (const k of Object.keys(by) as TaskStatus[]) by[k].sort((a, b) => a.position - b.position);
    return by;
  }, [tasks]);

  const active = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverCol(null);
    const { active: a, over } = e;
    if (!over) return;
    const dragged = tasks.find((t) => t.id === a.id);
    if (!dragged) return;

    const overId = String(over.id);
    let targetStatus: TaskStatus;
    let overTaskId: string | null = null;
    if (overId.startsWith("col:")) {
      targetStatus = overId.slice(4) as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      targetStatus = overTask.status;
      overTaskId = overTask.id;
    }

    const list = columns[targetStatus].filter((t) => t.id !== dragged.id);
    let insertAt = list.length;
    if (overTaskId) {
      const overIdx = list.findIndex((t) => t.id === overTaskId);
      const originalList = columns[targetStatus];
      const draggedIdx = originalList.findIndex((t) => t.id === dragged.id);
      const overOriginalIdx = originalList.findIndex((t) => t.id === overTaskId);
      // Dragging downward inside a column lands after the hovered card.
      insertAt = dragged.status === targetStatus && draggedIdx !== -1 && draggedIdx < overOriginalIdx ? overIdx + 1 : overIdx;
    }
    const prev = list[insertAt - 1];
    const next = list[insertAt];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;

    if (dragged.status === targetStatus && Math.abs(position - dragged.position) < 1e-9) return;
    move.mutate({ id: dragged.id, status: targetStatus, position });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        const id = e.over ? String(e.over.id) : null;
        if (!id) return setOverCol(null);
        setOverCol(id.startsWith("col:") ? (id.slice(4) as TaskStatus) : tasks.find((t) => t.id === id)?.status ?? null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverCol(null);
      }}
    >
      <div className="scroll-thin -mx-3 flex snap-x gap-4 overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0" aria-label="Task board">
        {STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} dot={s.dot} tasks={columns[s.value]} highlight={overCol === s.value} onAdd={onAdd} onOpenTask={onOpenTask} showProject={showProject} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>{active ? <TaskCard task={active} dragging showProject={showProject} /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, label, dot, tasks, highlight, onAdd, onOpenTask, showProject }: { status: TaskStatus; label: string; dot: string; tasks: Task[]; highlight: boolean; onAdd?: (s: TaskStatus) => void; onOpenTask: (id: string) => void; showProject: boolean }) {
  const { setNodeRef } = useDroppable({ id: `col:${status}` });
  return (
    <section className={`flex w-[286px] shrink-0 snap-start flex-col rounded-card border p-3 transition-colors sm:w-[300px] xl:w-0 xl:min-w-[240px] xl:flex-1 xl:shrink ${highlight ? "border-coral bg-coral-light" : "border-line bg-coral-light/40"}`} aria-label={`${label}, ${tasks.length} tasks`}>
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
          <h3 className="text-sm font-extrabold">{label}</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted ring-1 ring-line">{tasks.length}</span>
        </div>
        {onAdd && (
          <button onClick={() => onAdd(status)} aria-label={`Add task to ${label}`} className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-soft hover:bg-coral">
            <Plus size={16} />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className="flex min-h-[120px] flex-1 flex-col gap-3">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} showProject={showProject} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-xs font-medium text-muted">Drop a task here</p>}
      </div>
    </section>
  );
}

function SortableCard({ task, onOpen, showProject }: { task: Task; onOpen: () => void; showProject: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <TaskCard task={task} onOpen={onOpen} showProject={showProject} />
    </div>
  );
}
