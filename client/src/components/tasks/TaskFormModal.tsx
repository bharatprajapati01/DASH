import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal, Field } from "../ui";
import { useProject, useProjects, useTaskMutations } from "@/lib/queries";
import { dateToIso, PRIORITIES, STATUSES, errMsg } from "@/lib/format";
import { useToast } from "@/lib/toast";
import type { Priority, TaskStatus } from "@/lib/types";

const schema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(160, "Keep the title under 160 characters"),
    description: z.string().max(5000),
    projectId: z.string().min(1, "Choose a project"),
    assigneeId: z.string(),
    status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    startDate: z.string(),
    dueDate: z.string(),
    labels: z.string().max(200),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "Due date must be on or after the start date" });

type Values = z.infer<typeof schema>;

export function TaskFormModal({
  open,
  onClose,
  projectId,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  defaults?: { dueDate?: string; status?: TaskStatus; assigneeId?: string };
}) {
  const projects = useProjects();
  const { create } = useTaskMutations();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: blank(projectId, defaults),
  });

  useEffect(() => {
    if (open) reset(blank(projectId ?? projects.data?.[0]?.id, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, defaults?.dueDate, defaults?.status]);

  useEffect(() => {
    if (open && !watch("projectId") && projects.data?.[0]) setValue("projectId", projectId ?? projects.data[0].id);
  }, [open, projects.data, projectId, setValue, watch]);

  const selectedProject = watch("projectId");
  const project = useProject(selectedProject || undefined);

  const submit = handleSubmit(async (v) => {
    try {
      await create.mutateAsync({
        projectId: v.projectId,
        title: v.title,
        description: v.description,
        assigneeId: v.assigneeId || null,
        status: v.status,
        priority: v.priority,
        startDate: dateToIso(v.startDate),
        dueDate: dateToIso(v.dueDate),
        labels: v.labels.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 8),
      });
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={create.isPending} type="button">{create.isPending ? "Creating…" : "Create task"}</button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Title" error={errors.title?.message}>
          <input className="input" autoFocus {...register("title")} placeholder="What needs to be done?" />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <textarea className="input min-h-[88px] py-2.5" {...register("description")} placeholder="Add context, links or acceptance criteria" />
        </Field>
        {!projectId && (
          <Field label="Project" error={errors.projectId?.message}>
            <select className="input" {...register("projectId")}>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Assignee">
            <select className="input" {...register("assigneeId")}>
              <option value="">Unassigned</option>
              {project.data?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" {...register("status")}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" {...register("priority")}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Labels (comma separated)" error={errors.labels?.message}>
            <input className="input" {...register("labels")} placeholder="design, review" />
          </Field>
          <Field label="Start date" error={errors.startDate?.message}>
            <input type="date" className="input" {...register("startDate")} />
          </Field>
          <Field label="Due date" error={errors.dueDate?.message}>
            <input type="date" className="input" {...register("dueDate")} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function blank(projectId: string | undefined, d?: { dueDate?: string; status?: TaskStatus; assigneeId?: string }): Values {
  return {
    title: "",
    description: "",
    projectId: projectId ?? "",
    assigneeId: d?.assigneeId ?? "",
    status: d?.status ?? "TODO",
    priority: "MEDIUM" as Priority,
    startDate: "",
    dueDate: d?.dueDate ?? "",
    labels: "",
  };
}
