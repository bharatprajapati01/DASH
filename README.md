# FIBNK — Team Project Management

A Trello/Asana-style collaboration tool with the **Coral Workspace** theme (white canvas, charcoal `#292929` sidebar,
coral `#FF896D` accents, yellow / lime / lilac project cards).

**Stack** — React 18 · Vite · TypeScript · Tailwind · React Router · TanStack Query · React Hook Form + Zod · Framer Motion ·
Recharts · dnd-kit · Express · Prisma 6 · PostgreSQL · Socket.IO

## Features

| Area | What you get |
|---|---|
| Auth | Sign up, log in, log out, forgot/reset password, profile editing, password change. bcrypt hashes, HTTP-only cookie sessions, rate-limited auth routes |
| Workspaces | Create workspaces, switch between them, invite members by email, admin / member roles |
| Projects | Create / edit / delete (with confirmation), owner, deadline, status, colour, category, team management, search + filters, completion % |
| Tasks | Board (drag & drop), List (sort + filter, inline status), Calendar (drag to reschedule, create from a date). Assignee, priority, status, labels, start/due dates, activity history |
| Collaboration | Task comments, replies, `@mentions`, edit/delete own comments, project activity feed, Inbox of task discussions |
| Files | Real on-disk uploads (PDF, PNG, JPG, DOCX, XLSX, ZIP), type + content sniffing, size limit, authorised downloads |
| Notifications | Assignments, comments, mentions, invitations, status changes, upcoming + overdue deadlines. Unread badges, mark read / all read, deep links |
| Real time | Authenticated Socket.IO. Task, comment, project, file and notification events are sent only to authorised members. The UI falls back to polling and auto-reconnects when the socket drops |
| Dashboard | Live project progress, task stats with period-over-period change, week/month chart, team list, calendar, files, conversations |
| Responsive | Collapsible sidebar with tooltips, slide-out drawer on mobile, horizontally scrollable board, no horizontal overflow, reduced-motion support |

## Quick start

Requirements: **Node 20+** and **PostgreSQL 14+** (or Docker).

```bash
# 1. Database (skip if you already run Postgres — create a role/db named fibnk, or edit server/.env)
docker compose up -d

# 2. Install
npm run install:all

# 3. Configure the API
cp server/.env.example server/.env        # then set JWT_SECRET to a long random string

# 4. Create the Prisma client, apply the migration, add demo data
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Run (two terminals)
npm run dev:server      # API + Socket.IO on http://localhost:4000
npm run dev:client      # app on http://localhost:5173
```

Open <http://localhost:5173> and sign in with **alex@fibnk.dev / Password123**
(Alex is a workspace admin). Other demo users: `priya@`, `marco@`, `lena@`, `sam@` `fibnk.dev`, same password.
Sign in as two users in two browsers to watch real-time updates.

### Environment variables (`server/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://fibnk:fibnk@localhost:5432/fibnk?schema=public` |
| `JWT_SECRET` | Signs session cookies (≥ 32 chars in production) | **required** |
| `PORT` | API port | `4000` |
| `CLIENT_ORIGIN` | Comma-separated allowed browser origins (CORS + Socket.IO) | `http://localhost:5173,http://127.0.0.1:5173` |
| `UPLOAD_DIR` | Where uploaded files are stored | `uploads` |
| `MAX_FILE_SIZE_MB` | Upload size limit | `10` |
| `NODE_ENV` | `production` enables `Secure` / `SameSite=None` cookies | `development` |

> **Prisma note.** The server uses Prisma 6's engine-free client with the `pg` driver adapter
> (`engineType = "client"`), so there is no native query-engine binary. `prisma generate` / `migrate` still download
> Prisma's small schema engine once, which needs normal internet access.
> The initial migration (`server/prisma/migrations/20261026000000_init`) was written to match `schema.prisma`.
> If `prisma migrate dev` ever reports drift, delete `server/prisma/migrations`, run `npx prisma migrate dev --name init`
> and re-seed.

## Tests

```bash
# API running + seeded, then:
npm test
```

27 integration tests cover authentication, input validation, **authorisation boundaries** (non-members cannot read or
write projects, tasks, comments, files, dashboards), the assign → notify → comment → mention flow, file validation and
download permissions, and **Socket.IO permissions** (project events reach members, never outsiders; unauthenticated
sockets are rejected).

## Project layout

```
server/
  prisma/            schema.prisma, migrations, seed.ts
  src/
    index.ts         Express + Socket.IO bootstrap, CORS, helmet
    auth.ts access.ts  session cookies and workspace/project permission checks
    realtime.ts      socket auth, rooms, notify(), logActivity()
    jobs.ts          deadline / overdue notification sweep
    routes/          auth, workspaces, projects, tasks, comments (+inbox), files, notifications, dashboard
    tests/           integration tests
client/
  src/
    pages/           Dashboard, Projects, ProjectDetail, Todo, CalendarPage, People, Inbox, Documents, Help, Profile, auth
    components/      layout (Sidebar, TopBar, AppShell), tasks (Board, List, Calendar, TaskPanel…), projects, files, ui
    lib/             api client, TanStack Query hooks, session + socket, formatting helpers
```

## Security notes

- Passwords hashed with bcrypt (cost 12); sessions are signed JWTs in HTTP-only, `SameSite` cookies.
- Every route re-checks workspace / project membership server-side; non-members receive `404` so ids don't leak.
- Zod validation on every body/query; user text is stripped of markup; React escapes on render.
- Helmet, strict CORS allow-list, rate limits on sign-in / reset endpoints.
- Uploads: extension allow-list, magic-byte check, size limit, random on-disk names, downloads only through an authorised route.
- Socket connections require the session cookie; users only join rooms for projects they belong to.

## Production

```bash
npm run build
cd server && NODE_ENV=production npm start      # serves the API; host client/dist with any static host
```
Serve the client and API from the same site (or set `CLIENT_ORIGIN` and use HTTPS so `SameSite=None; Secure` cookies work).
