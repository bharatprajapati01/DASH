import { forwardRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Field } from "@/components/ui";
import { api } from "@/lib/api";
import { errMsg } from "@/lib/format";
import type { User } from "@/lib/types";

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-charcoal p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo size={44} />
        <div className="relative z-10 max-w-md">
          <h2 className="text-5xl font-extrabold leading-[1.05] tracking-tight">Plan it. <span className="text-coral">Assign it.</span> Ship it together.</h2>
          <p className="mt-5 text-lg text-white/70">Boards, calendars and conversations for teams that move fast.</p>
        </div>
        <svg className="pointer-events-none absolute -bottom-10 -right-10" width="460" height="460" viewBox="0 0 460 460" aria-hidden>
          <circle cx="300" cy="260" r="170" fill="#FF896D" />
          <circle cx="170" cy="380" r="90" fill="#FFE735" />
          <circle cx="400" cy="120" r="60" fill="#C7FF24" />
          <rect x="60" y="250" width="120" height="120" rx="34" fill="#D9D1FF" transform="rotate(-14 120 310)" />
        </svg>
        <p className="relative z-10 text-sm text-white/50">© {new Date().getFullYear()} FIBNK</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden"><Logo dark={false} /></div>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        </motion.div>
      </main>
    </div>
  );
}

function Banner({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-4 flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm font-medium ${kind === "error" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(function PasswordInput({ error, ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} ref={ref} type={show ? "text" : "password"} className={`input pr-12 ${error ? "border-danger" : ""}`} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-coral-light">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});

function Submit({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px] text-base">
      {loading && <Loader2 size={18} className="animate-spin" />} {children}
    </button>
  );
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(8, "At least 8 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number");

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string; password: string }>({
    resolver: zodResolver(z.object({ email, password: z.string().min(1, "Enter your password") })),
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post<{ user: User }>("/auth/login", v);
      await qc.invalidateQueries();
      navigate(params.get("next") || "/", { replace: true });
    } catch (e) {
      setError(errMsg(e));
    }
  });
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your workspace." footer={<>New here? <Link to="/signup" className="font-bold text-ink underline decoration-coral decoration-2 underline-offset-4">Create an account</Link></>}>
      {params.get("reset") && <Banner kind="success">Password updated. Sign in with your new password.</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" autoFocus {...register("email")} placeholder="you@company.com" /></Field>
        <Field label="Password" error={errors.password?.message}><PasswordInput autoComplete="current-password" error={!!errors.password} {...register("password")} placeholder="Your password" /></Field>
        <div className="text-right"><Link to="/forgot-password" className="text-sm font-semibold text-coral hover:underline">Forgot password?</Link></div>
        <Submit loading={isSubmitting}>Sign in</Submit>
      </form>
      <p className="mt-5 rounded-xl bg-coral-light px-3.5 py-3 text-xs text-ink/80">Demo (after seeding): <b>alex@fibnk.dev</b> / <b>Password123</b></p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string; email: string; password: string; workspaceName?: string }>({
    resolver: zodResolver(z.object({ name: z.string().trim().min(2, "Enter your name"), email, password, workspaceName: z.string().trim().max(80).optional() })),
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/auth/register", { ...v, workspaceName: v.workspaceName || undefined });
      await qc.invalidateQueries();
      navigate("/", { replace: true });
    } catch (e) {
      setError(errMsg(e));
    }
  });
  return (
    <AuthLayout title="Create your account" subtitle="Start a workspace and invite your team." footer={<>Already have an account? <Link to="/login" className="font-bold text-ink underline decoration-coral decoration-2 underline-offset-4">Sign in</Link></>}>
      {error && <Banner kind="error">{error}</Banner>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" error={errors.name?.message}><input className="input" autoComplete="name" autoFocus {...register("name")} placeholder="Alex Morgan" /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register("email")} placeholder="you@company.com" /></Field>
        <Field label="Password" error={errors.password?.message}><PasswordInput autoComplete="new-password" error={!!errors.password} {...register("password")} placeholder="8+ characters, a letter and a number" /></Field>
        <Field label="Workspace name (optional)" error={errors.workspaceName?.message}><input className="input" {...register("workspaceName")} placeholder="e.g. Design Team" /></Field>
        <Submit loading={isSubmitting}>Create account</Submit>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [done, setDone] = useState<{ message: string; devResetUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email })) });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      setDone(await api.post("/auth/forgot-password", v));
    } catch (e) {
      setError(errMsg(e));
    }
  });
  return (
    <AuthLayout title="Forgot password?" subtitle="Enter your email and we'll send a reset link." footer={<Link to="/login" className="font-bold text-ink underline decoration-coral decoration-2 underline-offset-4">Back to sign in</Link>}>
      {error && <Banner kind="error">{error}</Banner>}
      {done ? (
        <div>
          <Banner kind="success">{done.message}</Banner>
          {done.devResetUrl && (
            <p className="rounded-xl bg-lilac/50 px-3.5 py-3 text-xs">
              Development mode (no email service configured): <a className="font-bold underline" href={done.devResetUrl}>open your reset link</a>.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoFocus {...register("email")} placeholder="you@company.com" /></Field>
          <Submit loading={isSubmitting}>Send reset link</Submit>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })),
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password: v.password });
      navigate("/login?reset=1", { replace: true });
    } catch (e) {
      setError(errMsg(e));
    }
  });
  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you haven't used before." footer={<Link to="/login" className="font-bold text-ink underline decoration-coral decoration-2 underline-offset-4">Back to sign in</Link>}>
      {!token && <Banner kind="error">This reset link is missing its token. Request a new one.</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" error={errors.password?.message}><PasswordInput autoComplete="new-password" error={!!errors.password} {...register("password")} /></Field>
        <Field label="Confirm password" error={errors.confirm?.message}><PasswordInput autoComplete="new-password" error={!!errors.confirm} {...register("confirm")} /></Field>
        <Submit loading={isSubmitting}>Update password</Submit>
      </form>
    </AuthLayout>
  );
}
