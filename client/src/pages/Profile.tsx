import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, LogOut } from "lucide-react";
import { Avatar, Field, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { errMsg, PROJECT_COLORS } from "@/lib/format";
import type { User } from "@/lib/types";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  jobTitle: z.string().trim().max(80),
});
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "At least 8 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export default function ProfilePage() {
  const { user, workspace, logout } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [color, setColor] = useState(user.avatar && /^#[0-9a-fA-F]{6}$/.test(user.avatar) ? user.avatar : PROJECT_COLORS[0]!);
  const [show, setShow] = useState(false);

  const profile = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name, jobTitle: user.jobTitle ?? "" } });
  const pw = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const saveProfile = profile.handleSubmit(async (v) => {
    try {
      const d = await api.patch<{ user: User }>("/auth/profile", { name: v.name, jobTitle: v.jobTitle, avatar: color });
      qc.setQueryData(["me"], d);
      for (const k of ["members", "dashboard", "projects", "project", "tasks"]) qc.invalidateQueries({ queryKey: [k] });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(errMsg(e));
    }
  });

  const changePassword = pw.handleSubmit(async (v) => {
    try {
      await api.post("/auth/change-password", { currentPassword: v.currentPassword, newPassword: v.newPassword });
      pw.reset();
      toast.success("Password changed");
    } catch (e) {
      toast.error(errMsg(e));
    }
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile & security" subtitle={`Signed in to ${workspace.name} as ${user.email}`} actions={<button className="btn-ghost" onClick={() => logout()}><LogOut size={16} /> Log out</button>} />

      <form onSubmit={saveProfile} className="card mb-5 space-y-5 p-5 sm:p-6" noValidate>
        <h2 className="text-lg font-extrabold">Your profile</h2>
        <div className="flex items-center gap-4">
          <Avatar name={profile.watch("name") || user.name} avatar={color} size={72} />
          <div>
            <span className="label">Avatar color</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Avatar color">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`grid h-9 w-9 place-items-center rounded-full border-2 transition ${color === c ? "scale-110 border-ink" : "border-transparent"}`} style={{ background: c }}>
                  {color === c && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={profile.formState.errors.name?.message}><input className="input" autoComplete="name" {...profile.register("name")} /></Field>
          <Field label="Job title" error={profile.formState.errors.jobTitle?.message}><input className="input" placeholder="e.g. Product Designer" {...profile.register("jobTitle")} /></Field>
          <Field label="Email"><input className="input bg-coral-light/40" value={user.email} readOnly aria-readonly /></Field>
        </div>
        <div className="flex justify-end"><button className="btn-primary" disabled={profile.formState.isSubmitting}>{profile.formState.isSubmitting ? "Saving…" : "Save profile"}</button></div>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-5 sm:p-6" noValidate>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Change password</h2>
          <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink" aria-pressed={show}>{show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? "Hide" : "Show"}</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" error={pw.formState.errors.currentPassword?.message}><input className="input" type={show ? "text" : "password"} autoComplete="current-password" {...pw.register("currentPassword")} /></Field>
          <Field label="New password" error={pw.formState.errors.newPassword?.message}><input className="input" type={show ? "text" : "password"} autoComplete="new-password" {...pw.register("newPassword")} /></Field>
          <Field label="Confirm new" error={pw.formState.errors.confirm?.message}><input className="input" type={show ? "text" : "password"} autoComplete="new-password" {...pw.register("confirm")} /></Field>
        </div>
        <div className="flex justify-end"><button className="btn-dark" disabled={pw.formState.isSubmitting}>{pw.formState.isSubmitting ? "Updating…" : "Update password"}</button></div>
      </form>
    </div>
  );
}
