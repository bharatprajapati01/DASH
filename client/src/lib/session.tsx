import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { connectSocket, disconnectSocket } from "./socket";
import type { User, Workspace } from "./types";

interface Session {
  user: User;
  workspaces: Workspace[];
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  isAdmin: boolean;
  socketConnected: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);
const WS_KEY = "fibnk:workspace"; // non-sensitive UI preference only

export function SessionProvider({ children, onSignedOut }: { children: ReactNode; onSignedOut: () => void }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: User }>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const wsQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get<{ workspaces: Workspace[] }>("/workspaces"),
    enabled: !!me.data,
  });
  const [wsId, setWsId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(WS_KEY);
    } catch {
      return null;
    }
  });
  const [socketConnected, setSocketConnected] = useState(false);

  const setWorkspaceId = useCallback((id: string) => {
    setWsId(id);
    try {
      localStorage.setItem(WS_KEY, id);
    } catch {
      /* storage unavailable: preference just won't persist */
    }
  }, []);

  // Sign out everywhere if any request reports an expired session.
  useEffect(() => {
    const handler = () => {
      qc.clear();
      disconnectSocket();
      onSignedOut();
    };
    window.addEventListener("fibnk:unauthenticated", handler);
    return () => window.removeEventListener("fibnk:unauthenticated", handler);
  }, [qc, onSignedOut]);

  // Real-time: keep one authenticated socket and refresh affected queries on server events.
  const userId = me.data?.user.id;
  useEffect(() => {
    if (!userId) return;
    const socket = connectSocket();
    const invalidate = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const onConnect = () => {
      setSocketConnected(true);
      // After any (re)connect, refetch everything that may have changed while offline.
      qc.invalidateQueries();
    };
    const onDisconnect = () => setSocketConnected(false);
    const onTask = () => invalidate("tasks", "task", "dashboard", "projects", "project", "inbox");
    const onComment = () => invalidate("comments", "inbox", "tasks", "task");
    const onProject = () => invalidate("projects", "project", "dashboard", "tasks", "members");
    const onActivity = () => invalidate("activity", "dashboard", "task");
    const onFile = () => invalidate("files", "task");
    const onNotification = () => invalidate("notifications");
    const onProjectRemoved = () => invalidate("projects", "project", "tasks", "dashboard");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("task:created", onTask);
    socket.on("task:updated", onTask);
    socket.on("task:deleted", onTask);
    socket.on("comment:created", onComment);
    socket.on("comment:updated", onComment);
    socket.on("comment:deleted", onComment);
    socket.on("project:updated", onProject);
    socket.on("project:deleted", onProject);
    socket.on("project:removed", onProjectRemoved);
    socket.on("activity:new", onActivity);
    socket.on("file:created", onFile);
    socket.on("file:deleted", onFile);
    socket.on("notification:new", onNotification);
    if (socket.connected) setSocketConnected(true);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.off("task:created", onTask);
      socket.off("task:updated", onTask);
      socket.off("task:deleted", onTask);
      socket.off("comment:created", onComment);
      socket.off("comment:updated", onComment);
      socket.off("comment:deleted", onComment);
      socket.off("project:updated", onProject);
      socket.off("project:deleted", onProject);
      socket.off("project:removed", onProjectRemoved);
      socket.off("activity:new", onActivity);
      socket.off("file:created", onFile);
      socket.off("file:deleted", onFile);
      socket.off("notification:new", onNotification);
    };
  }, [userId, qc]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      disconnectSocket();
      qc.clear();
      onSignedOut();
    }
  }, [qc, onSignedOut]);

  const value = useMemo<Session | null>(() => {
    const user = me.data?.user;
    const workspaces = wsQuery.data?.workspaces;
    if (!user || !workspaces || workspaces.length === 0) return null;
    const workspace = workspaces.find((w) => w.id === wsId) ?? workspaces[0]!;
    return { user, workspaces, workspace, setWorkspaceId, isAdmin: workspace.role === "ADMIN", socketConnected, logout };
  }, [me.data, wsQuery.data, wsId, setWorkspaceId, socketConnected, logout]);

  const unauth = me.error instanceof ApiError && me.error.status === 401;
  if (me.isLoading || (me.data && wsQuery.isLoading)) return <FullScreenLoader />;
  if (unauth || !me.data) return <SessionContext.Provider value={null}>{children}</SessionContext.Provider>;
  if (wsQuery.error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">We couldn't load your workspace</p>
          <p className="mt-1 text-sm text-muted">{(wsQuery.error as Error).message}</p>
          <button className="btn-primary mt-4" onClick={() => wsQuery.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useOptionalSession() {
  return useContext(SessionContext);
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession used outside an authenticated area");
  return s;
}

function FullScreenLoader() {
  return (
    <div className="grid h-full place-items-center bg-charcoal">
      <div className="flex items-center gap-3 text-white">
        <span className="h-3 w-3 animate-pulse rounded-full bg-coral" />
        <span className="text-sm font-semibold tracking-wide">Loading FIBNK…</span>
      </div>
    </div>
  );
}
