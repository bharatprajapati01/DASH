import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "./api";
import { useSession } from "./session";
import { useToast } from "./toast";
import { errMsg } from "./format";
import type {
  AppNotification,
  Comment,
  Conversation,
  DashboardData,
  FileItem,
  Member,
  Project,
  Task,
  TaskDetail,
  Activity,
} from "./types";

export interface TaskFilters {
  projectId?: string;
  scope?: "all" | "assigned" | "created" | "today" | "upcoming" | "overdue" | "completed";
  status?: string;
  priority?: string;
  assigneeId?: string;
  q?: string;
  from?: string;
  to?: string;
  deadline?: string;
  sort?: string;
}

export function useProjects(filters: { q?: string; status?: string; mine?: boolean } = {}) {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["projects", workspace.id, filters],
    queryFn: () => api.get<{ projects: Project[] }>(`/projects${qs({ workspaceId: workspace.id, q: filters.q, status: filters.status, mine: filters.mine ? "true" : undefined })}`),
    select: (d) => d.projects,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<{ project: Project }>(`/projects/${id}`),
    select: (d) => d.project,
    enabled: !!id,
  });
}

export function useTasks(filters: TaskFilters, opts: { enabled?: boolean } = {}) {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["tasks", workspace.id, filters],
    queryFn: () => api.get<{ tasks: Task[] }>(`/tasks${qs({ workspaceId: filters.projectId ? undefined : workspace.id, ...filters })}`),
    select: (d) => d.tasks,
    enabled: opts.enabled ?? true,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.get<{ task: TaskDetail }>(`/tasks/${id}`),
    select: (d) => d.task,
    enabled: !!id,
  });
}

export function useComments(taskId: string | null) {
  return useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => api.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`),
    select: (d) => d.comments,
    enabled: !!taskId,
  });
}

export function useMembers() {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["members", workspace.id],
    queryFn: () => api.get<{ members: Member[] }>(`/workspaces/${workspace.id}/members`),
    select: (d) => d.members,
  });
}

export function useDashboard(range: "week" | "month") {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["dashboard", workspace.id, range],
    queryFn: () => api.get<DashboardData>(`/dashboard${qs({ workspaceId: workspace.id, range })}`),
  });
}

export function useNotifications() {
  const { socketConnected } = useSession();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: AppNotification[]; unreadCount: number }>("/notifications?limit=50"),
    // If the socket is down, fall back to polling so notifications still arrive.
    refetchInterval: socketConnected ? false : 30_000,
  });
}

export function useInbox(q: string) {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["inbox", workspace.id, q],
    queryFn: () => api.get<{ conversations: Conversation[] }>(`/inbox${qs({ workspaceId: workspace.id, q })}`),
    select: (d) => d.conversations,
  });
}

export function useFiles(params: { projectId?: string; q?: string }) {
  const { workspace } = useSession();
  return useQuery({
    queryKey: ["files", workspace.id, params],
    queryFn: () => api.get<{ files: FileItem[] }>(`/files${qs({ workspaceId: params.projectId ? undefined : workspace.id, ...params })}`),
    select: (d) => d.files,
  });
}

export function useProjectActivity(projectId: string | undefined) {
  return useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => api.get<{ activity: Activity[] }>(`/projects/${projectId}/activity?limit=40`),
    select: (d) => d.activity,
    enabled: !!projectId,
  });
}

/** Task mutations share one invalidation policy so every view (board, list, calendar, dashboard) stays in sync. */
export function useTaskMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    for (const k of ["tasks", "task", "dashboard", "projects", "project", "inbox", "notifications", "activity"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ task: Task }>("/tasks", body),
    onSuccess: () => {
      toast.success("Task created");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<{ task: Task }>(`/tasks/${id}`, body),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(errMsg(e));
      refresh();
    },
  });

  const move = useMutation({
    mutationFn: ({ id, status, position }: { id: string; status: string; position: number }) =>
      api.post<{ task: Task }>(`/tasks/${id}/move`, { status, position }),
    // Optimistic: patch every cached task list immediately; roll back on failure.
    onMutate: async ({ id, status, position }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData<{ tasks: Task[] }>({ queryKey: ["tasks"] });
      qc.setQueriesData<{ tasks: Task[] }>({ queryKey: ["tasks"] }, (old) =>
        old ? { tasks: old.tasks.map((t) => (t.id === id ? { ...t, status: status as Task["status"], position } : t)) } : old,
      );
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(errMsg(e));
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      toast.success("Task deleted");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return { create, update, move, remove };
}
