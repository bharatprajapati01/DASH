import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, FolderKanban, LifeBuoy, Mail, MessageCircle, Users, Wifi } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/lib/session";

const FAQ: { q: string; a: string }[] = [
  { q: "How do I create a project and invite my team?", a: "Open Project Boards → Create New Board, fill in the details and pick teammates. Only people already in your workspace can join. Admins can add new people from the People page by email (they need a FIBNK account first)." },
  { q: "How do I assign a task?", a: "Open any task and choose an assignee from the selector, or pick one when you create the task. Tasks can only be assigned to members of the project." },
  { q: "Can I drag tasks between columns and days?", a: "Yes. On a project board, drag a card to another column to change its status. On the calendar, drag a card to another day to change its deadline. Keyboard users can focus a card and use Space plus the arrow keys." },
  { q: "How do mentions work?", a: "Type @ in a comment and choose a teammate. They receive a notification that links straight to the task." },
  { q: "What are the roles?", a: "Workspace admins manage members and can see every project. Project owners manage their project's team, settings and deadline. Members work on the tasks of projects they belong to." },
  { q: "Which files can I upload?", a: "PDF, PNG, JPG, DOCX, XLSX and ZIP files up to 10 MB each. File contents are checked on the server, not just the extension." },
  { q: "Why did I stop getting live updates?", a: "FIBNK uses a live connection for instant updates. If it drops, the app keeps working and refreshes on its own every so often, then reconnects automatically." },
];

export default function HelpPage() {
  const { socketConnected, workspace } = useSession();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Help & Support Center" subtitle="Quick answers for working in FIBNK." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Tile to="/projects?new=1" bg="#FF896D" icon={<FolderKanban size={20} />} title="Start a project" text="Create a board and add your team." />
        <Tile to="/people" bg="#D9D1FF" icon={<Users size={20} />} title="Invite people" text="Manage members and roles." />
        <Tile to="/inbox" bg="#C7FF24" icon={<MessageCircle size={20} />} title="Open the inbox" text="Catch up on discussions." />
      </div>

      <section className="card mb-6 p-5">
        <h2 className="mb-3 text-lg font-extrabold">Frequently asked questions</h2>
        <ul className="divide-y divide-line">
          {FAQ.map((f, i) => (
            <li key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-bold">
                {f.q}
                <ChevronDown size={18} className={`shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="pb-4 text-sm leading-relaxed text-ink/75">{f.a}</p>}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold"><Wifi size={18} /> Connection</h2>
          <p className="text-sm text-ink/75">Live updates are <b className={socketConnected ? "text-success" : "text-warning"}>{socketConnected ? "connected" : "reconnecting"}</b>. You are working in <b>{workspace.name}</b>.</p>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold"><LifeBuoy size={18} /> Still stuck?</h2>
          <p className="text-sm text-ink/75">Ask a workspace admin for access issues, or email the support team.</p>
          <a href="mailto:support@fibnk.dev" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-coral hover:underline"><Mail size={16} /> support@fibnk.dev</a>
        </section>
      </div>
    </div>
  );
}

function Tile({ to, bg, icon, title, text }: { to: string; bg: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="rounded-card p-4 transition hover:-translate-y-1 hover:shadow-lift" style={{ background: bg }}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/70">{icon}</span>
      <p className="mt-3 font-extrabold">{title}</p>
      <p className="text-sm text-ink/70">{text}</p>
    </Link>
  );
}
