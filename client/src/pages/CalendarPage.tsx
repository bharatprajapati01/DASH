import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CalendarView } from "@/components/tasks/CalendarView";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useOpenTask } from "@/components/tasks/TaskPanel";
import { useProjects } from "@/lib/queries";

export default function CalendarPage() {
  const openTask = useOpenTask();
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [creating, setCreating] = useState<{ dueDate?: string } | null>(null);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Drag a task card to a new day to reschedule it. Click a day's + to add one."
        actions={
          <>
            <select className="input !min-h-[40px] !w-auto" aria-label="Filter calendar by project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-primary" onClick={() => setCreating({})}><Plus size={16} /> New task</button>
          </>
        }
      />
      <div className="card p-3 sm:p-5">
        <CalendarView key={projectId} projectId={projectId || undefined} onOpenTask={openTask} onCreate={(day) => setCreating({ dueDate: day })} />
      </div>
      <TaskFormModal open={!!creating} onClose={() => setCreating(null)} projectId={projectId || undefined} defaults={creating ?? undefined} />
    </div>
  );
}
