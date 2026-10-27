import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Avatar, Field, Modal } from "../ui";
import { api } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { dateToIso, dayKey, errMsg, PROJECT_COLORS, PROJECT_STATUSES } from "@/lib/format";
import type { Project } from "@/lib/types";

const schema = z
  .object({
    name: z.string().trim().min(2, "Project name is too short").max(100, "Keep the name under 100 characters"),
    description: z.string().max(2000),
    category: z.string().trim().min(1, "Add a category").max(40),
    status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"]),
    startDate: z.string(),
    dueDate: z.string(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "The deadline must be on or after the start date" });
type Values = z.infer<typeof schema>;

const blank = (p?: Project): Values => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  category: p?.category ?? "General",
  status: p?.status ?? "ACTIVE",
  startDate: p?.startDate ? dayKey(p.startDate) : "",
  dueDate: p?.dueDate ? dayKey(p.dueDate) : "",
});

/** Create a project (with an initial team) or edit an existing one. */
export function ProjectFormModal({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved?: (p: Project) => void }) {
  const { workspace, user } = useSession();
  const members = useMembers();
  const qc = useQueryClient();
  const toast = useToast();
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]!);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState(project?.ownerId ?? user.id);
  const editing = !!project;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank(project) });

  useEffect(() => {
    if (!open) return;
    reset(blank(project));
    setColor(project?.color ?? PROJECT_COLORS[0]!);
    setMemberIds([]);
    setOwnerId(project?.ownerId ?? user.id);
  }, [open, project, reset, user.id]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const body = {
        name: v.name,
        description: v.description,
        category: v.category,
        status: v.status,
        color,
        startDate: dateToIso(v.startDate),
        dueDate: dateToIso(v.dueDate),
      };
      if (editing) return api.patch<{ project: Project }>(`/projects/${project!.id}`, { ...body, ...(ownerId !== project!.ownerId ? { ownerId } : {}) });
      return api.post<{ project: Project }>("/projects", { ...body, workspaceId: workspace.id, memberIds });
    },
    onSuccess: (d) => {
      toast.success(editing ? "Project updated" : "Project created");
      for (const k of ["projects", "project", "dashboard", "activity", "tasks"]) qc.invalidateQueries({ queryKey: [k] });
      onClose();
      onSaved?.(d.project);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const toggle = (id: string) => setMemberIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const others = (members.data ?? []).filter((m) => m.id !== user.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit project" : "New project"}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary" form="project-form" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create project"}
          </button>
        </div>
      }
    >
      <form id="project-form" onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Project name" error={errors.name?.message}>
          <input className="input" placeholder="e.g. Smart Bike App" maxLength={100} {...register("name")} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <textarea className="input min-h-[84px] py-2.5" placeholder="What is this project about?" maxLength={2000} {...register("description")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={errors.category?.message}>
            <input className="input" placeholder="App UI/UX" maxLength={40} {...register("category")} />
          </Field>
          <Field label="Status">
            <select className="input" {...register("status")}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Start date" error={errors.startDate?.message}>
            <input type="date" className="input" {...register("startDate")} />
          </Field>
          <Field label="Deadline" error={errors.dueDate?.message}>
            <input type="date" className="input" {...register("dueDate")} />
          </Field>
        </div>

        <div>
          <span className="label">Color</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Project color">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`grid h-9 w-9 place-items-center rounded-full border-2 transition ${color === c ? "border-ink scale-110" : "border-transparent"}`} style={{ background: c }}>
                {color === c && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>

        {editing && project!.canManage && (
          <Field label="Project owner">
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {project!.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}

        {!editing && (
          <div>
            <span className="label">Team members</span>
            {members.isLoading ? (
              <p className="text-sm text-muted">Loading teammates…</p>
            ) : others.length === 0 ? (
              <p className="rounded-xl bg-coral-light p-3 text-sm text-muted">You're the only person in this workspace. Invite teammates from the People page, then add them to the project.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {others.map((m) => {
                  const on = memberIds.includes(m.id);
                  return (
                    <li key={m.id}>
                      <button type="button" aria-pressed={on} onClick={() => toggle(m.id)} className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition ${on ? "border-coral bg-coral-light" : "border-line hover:bg-coral-light/60"}`}>
                        <Avatar name={m.name} avatar={m.avatar} size={28} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                        {on && <Check size={16} className="text-coral" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
