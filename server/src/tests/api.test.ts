/**
 * Integration tests. They run against a live API (default http://localhost:4000) and a seeded database:
 *   npm run seed && npm run dev   (in one terminal)   |   npm test   (in another)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";

const BASE = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = "http://localhost:5173";

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, extra: RequestInit = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { Origin: ORIGIN, ...(body && !isForm ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      ...extra,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (downloads) */ }
    return { status: res.status, json, headers: res.headers, text };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
  del = (p: string) => this.req("DELETE", p);
}

const connect = (c: Client): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { extraHeaders: { cookie: c.cookie, origin: ORIGIN }, transports: ["websocket"], reconnection: false });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 5000);
  });

const waitFor = (s: Socket, event: string, ms = 2500) =>
  new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    s.once(event, (d) => { clearTimeout(t); resolve(d); });
  });

const PASSWORD = "Password123";
const stamp = Date.now();

describe("FIBNK API", () => {
  const alex = new Client(); // workspace admin + project member (seed)
  const priya = new Client(); // seeded project member
  const outsider = new Client(); // freshly registered, belongs to nothing
  let ws = "", projectId = "", priyaId = "", taskId = "";
  const sockets: Socket[] = [];

  before(async () => {
    assert.equal((await alex.post("/auth/login", { email: "alex@fibnk.dev", password: PASSWORD })).status, 200, "seed data missing — run `npm run seed`");
    assert.equal((await priya.post("/auth/login", { email: "priya@fibnk.dev", password: PASSWORD })).status, 200);
    const reg = await outsider.post("/auth/register", { name: "Olive Outsider", email: `outsider${stamp}@example.com`, password: PASSWORD });
    assert.equal(reg.status, 201);
    ws = (await alex.get("/workspaces")).json.workspaces[0].id;
    const projects = (await priya.get(`/projects?workspaceId=${ws}`)).json.projects;
    const p = projects.find((x: any) => x.members.some((m: any) => m.email === "priya@fibnk.dev") && x.members.some((m: any) => m.email === "alex@fibnk.dev"));
    assert.ok(p, "need a project shared by Alex and Priya");
    projectId = p.id;
    priyaId = p.members.find((m: any) => m.email === "priya@fibnk.dev").id;
  });

  after(async () => {
    sockets.forEach((s) => s.disconnect());
    if (taskId) await alex.del(`/tasks/${taskId}`);
  });

  describe("authentication", () => {
    it("rejects unauthenticated requests", async () => {
      for (const path of ["/auth/me", "/projects", "/tasks", "/notifications", "/workspaces"]) {
        assert.equal((await new Client().get(path)).status, 401, path);
      }
    });
    it("rejects wrong passwords without revealing which part was wrong", async () => {
      const r = await new Client().post("/auth/login", { email: "alex@fibnk.dev", password: "WrongPass999" });
      assert.equal(r.status, 401);
    });
    it("enforces the password policy on sign-up", async () => {
      const r = await new Client().post("/auth/register", { name: "Weak", email: `weak${stamp}@example.com`, password: "short" });
      assert.equal(r.status, 400);
    });
    it("rejects duplicate emails", async () => {
      const r = await new Client().post("/auth/register", { name: "Dup", email: "alex@fibnk.dev", password: PASSWORD });
      assert.equal(r.status, 409);
    });
    it("sets an HttpOnly session cookie and never returns the password hash", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ email: "alex@fibnk.dev", password: PASSWORD }) });
      assert.match(res.headers.get("set-cookie") ?? "", /HttpOnly/i);
      assert.ok(!JSON.stringify(await res.json()).includes("passwordHash"));
    });
    it("does not reveal whether an email exists on forgot-password", async () => {
      const a = await new Client().post("/auth/forgot-password", { email: "alex@fibnk.dev" });
      const b = await new Client().post("/auth/forgot-password", { email: `nobody${stamp}@example.com` });
      assert.equal(a.status, b.status);
    });
    it("blocks foreign origins (CORS)", async () => {
      const res = await fetch(`${BASE}/api/health`, { headers: { Origin: "http://evil.example" } });
      assert.equal(res.status, 403);
    });
  });

  describe("authorization", () => {
    it("hides projects, tasks, comments and files from non-members", async () => {
      const tasks = (await alex.get(`/tasks?projectId=${projectId}`)).json.tasks;
      const t = tasks[0];
      assert.ok(t);
      assert.equal((await outsider.get(`/projects/${projectId}`)).status, 404);
      assert.equal((await outsider.get(`/tasks/${t.id}`)).status, 404);
      assert.equal((await outsider.get(`/tasks/${t.id}/comments`)).status, 404);
      assert.equal((await outsider.get(`/projects/${projectId}/activity`)).status, 404);
      assert.equal((await outsider.get(`/files?projectId=${projectId}`)).status, 404);
      assert.equal((await outsider.get(`/tasks?workspaceId=${ws}`)).status, 404);
      assert.equal((await outsider.get(`/dashboard?workspaceId=${ws}`)).status, 404);
    });
    it("stops non-members writing", async () => {
      assert.equal((await outsider.post("/tasks", { projectId, title: "sneaky" })).status, 404);
      assert.equal((await outsider.patch(`/projects/${projectId}`, { name: "Hacked" })).status, 404);
      assert.equal((await outsider.del(`/projects/${projectId}`)).status, 404);
      assert.equal((await outsider.post(`/projects/${projectId}/members`, { userId: priyaId })).status, 404);
    });
    it("only lets owners or admins delete a project", async () => {
      const r = await priya.del(`/projects/${projectId}`);
      assert.ok([403, 404].includes(r.status), `got ${r.status}`);
      assert.equal((await alex.get(`/projects/${projectId}`)).status, 200);
    });
    it("only lets workspace admins invite or change roles", async () => {
      assert.equal((await priya.post(`/workspaces/${ws}/members`, { email: `outsider${stamp}@example.com` })).status, 403);
      assert.equal((await priya.patch(`/workspaces/${ws}/members/${priyaId}`, { role: "ADMIN" })).status, 403);
    });
    it("refuses to assign tasks to people outside the project", async () => {
      const me = (await outsider.get("/auth/me")).json.user.id;
      assert.equal((await alex.post("/tasks", { projectId, title: "bad assignee", assigneeId: me })).status, 400);
    });
    it("does not leak other workspaces' notifications", async () => {
      assert.equal((await outsider.get("/notifications")).json.notifications.length, 0);
    });
  });

  describe("tasks, comments and notifications", () => {
    it("validates input", async () => {
      assert.equal((await alex.post("/tasks", { projectId, title: "" })).status, 400);
      assert.equal((await alex.post("/tasks", { projectId, title: "x", priority: "NOPE" })).status, 400);
      assert.equal((await alex.post("/tasks", { projectId, title: "x", startDate: "2026-02-10", dueDate: "2026-02-01" })).status, 400);
    });
    it("creates a task and notifies the assignee", async () => {
      const before = (await priya.get("/notifications")).json.unreadCount;
      const r = await alex.post("/tasks", { projectId, title: `Test task ${stamp}`, description: "<script>alert(1)</script>hello", assigneeId: priyaId, priority: "HIGH", dueDate: new Date(Date.now() + 3 * 86400000).toISOString(), labels: ["qa"] });
      assert.equal(r.status, 201);
      taskId = r.json.task.id;
      assert.ok(!r.json.task.description.includes("<script>"), "markup should be stripped");
      const after = await priya.get("/notifications");
      assert.equal(after.json.unreadCount, before + 1);
      assert.equal(after.json.notifications[0].type, "TASK_ASSIGNED");
      assert.equal(after.json.notifications[0].relatedTaskId, taskId);
    });
    it("changes status, sets completedAt on Done, and notifies the creator", async () => {
      const r = await priya.post(`/tasks/${taskId}/move`, { status: "DONE", position: 1 });
      assert.equal(r.status, 200);
      assert.equal(r.json.task.status, "DONE");
      assert.ok(r.json.task.completedAt);
      const n = (await alex.get("/notifications")).json.notifications.find((x: any) => x.relatedTaskId === taskId && x.type === "STATUS_CHANGE");
      assert.ok(n, "creator should be told about the status change");
      const back = await priya.patch(`/tasks/${taskId}`, { status: "IN_PROGRESS" });
      assert.equal(back.json.task.completedAt, null);
    });
    it("supports comments, replies, @mentions, and own-comment edit/delete only", async () => {
      const c = await alex.post(`/tasks/${taskId}/comments`, { content: "Looking good @Priya", mentions: [priyaId] });
      assert.equal(c.status, 201);
      const mention = (await priya.get("/notifications")).json.notifications.find((x: any) => x.type === "MENTION" && x.relatedTaskId === taskId);
      assert.ok(mention);
      const reply = await priya.post(`/tasks/${taskId}/comments`, { content: "Thanks!", parentCommentId: c.json.comment.id });
      assert.equal(reply.status, 201);
      assert.equal((await priya.patch(`/comments/${c.json.comment.id}`, { content: "edited by someone else" })).status, 403);
      assert.equal((await priya.del(`/comments/${c.json.comment.id}`)).status, 403);
      assert.equal((await alex.patch(`/comments/${c.json.comment.id}`, { content: "Looking great" })).status, 200);
      assert.equal((await alex.get(`/tasks/${taskId}/comments`)).json.comments.length, 2);
    });
    it("shows the discussion in the inbox", async () => {
      const inbox = (await priya.get(`/inbox?workspaceId=${ws}`)).json.conversations;
      assert.ok(inbox.some((c: any) => c.taskId === taskId));
    });
    it("marks notifications read individually and all at once", async () => {
      const list = (await priya.get("/notifications")).json.notifications;
      const one = list.find((n: any) => !n.isRead);
      assert.ok(one);
      assert.equal((await priya.post(`/notifications/${one.id}/read`)).status, 200);
      assert.equal((await priya.post("/notifications/read-all")).status, 200);
      assert.equal((await priya.get("/notifications")).json.unreadCount, 0);
      assert.equal((await alex.post(`/notifications/${one.id}/read`)).status, 404, "cannot touch someone else's notification");
    });
    it("records activity and reflects the task in dashboard stats", async () => {
      const act = (await alex.get(`/projects/${projectId}/activity`)).json.activity;
      assert.ok(act.some((a: any) => a.taskId === taskId));
      const d = (await alex.get(`/dashboard?workspaceId=${ws}&range=week`)).json;
      assert.ok(d.totals.total >= 1 && d.chart.length === 7);
      assert.equal((await alex.get(`/dashboard?workspaceId=${ws}&range=month`)).json.chart.length, 4);
    });
  });

  describe("files", () => {
    const pdf = () => new Blob(["%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"], { type: "application/pdf" });
    let fileId = "";
    it("uploads a valid PDF and lists it", async () => {
      const fd = new FormData();
      fd.append("file", pdf(), "brief.pdf");
      const r = await alex.req("POST", `/projects/${projectId}/files`, fd);
      assert.equal(r.status, 201, r.text);
      fileId = r.json.file.id;
      assert.ok(!("fileUrl" in r.json.file), "disk name must not leak");
      assert.ok((await priya.get(`/files?projectId=${projectId}`)).json.files.some((f: any) => f.id === fileId));
    });
    it("rejects disallowed types and content that does not match the extension", async () => {
      const exe = new FormData();
      exe.append("file", new Blob(["MZ binary"], { type: "application/octet-stream" }), "evil.exe");
      assert.equal((await alex.req("POST", `/projects/${projectId}/files`, exe)).status >= 400, true);
      const fake = new FormData();
      fake.append("file", new Blob(["just text pretending"], { type: "application/pdf" }), "fake.pdf");
      assert.equal((await alex.req("POST", `/projects/${projectId}/files`, fake)).status, 415);
    });
    it("serves downloads only to project members", async () => {
      const ok = await priya.get(`/files/${fileId}/download`);
      assert.equal(ok.status, 200);
      assert.ok(ok.text.startsWith("%PDF"));
      assert.equal((await outsider.get(`/files/${fileId}/download`)).status, 404);
      assert.equal((await outsider.del(`/files/${fileId}`)).status, 404);
    });
    it("lets the uploader delete the file", async () => {
      assert.equal((await alex.del(`/files/${fileId}`)).status, 200);
      assert.equal((await alex.get(`/files/${fileId}/download`)).status, 404);
    });
  });

  describe("real-time (Socket.IO)", () => {
    it("rejects unauthenticated socket connections", async () => {
      await assert.rejects(connect(new Client()));
    });
    it("broadcasts task updates to project members only", async () => {
      const [sAlex, sOut] = await Promise.all([connect(alex), connect(outsider)]);
      sockets.push(sAlex, sOut);
      const memberGot = waitFor(sAlex, "task:updated");
      const outsiderGot = waitFor(sOut, "task:updated", 1500);
      const r = await priya.patch(`/tasks/${taskId}`, { priority: "URGENT" });
      assert.equal(r.status, 200);
      const evt = await memberGot;
      assert.ok(evt, "project member should receive task:updated");
      assert.equal((evt.task ?? evt).id, taskId);
      assert.equal(await outsiderGot, null, "non-member must not receive project events");
    });
    it("pushes notifications to the recipient's personal channel", async () => {
      const sPriya = await connect(priya);
      sockets.push(sPriya);
      const got = waitFor(sPriya, "notification:new");
      await alex.post(`/tasks/${taskId}/comments`, { content: "ping", mentions: [priyaId] });
      assert.ok(await got, "recipient should get notification:new");
    });
  });
});
