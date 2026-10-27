export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"] as const;
export const WORKSPACE_ROLES = ["ADMIN", "MEMBER"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type NotificationType =
  | "TASK_ASSIGNED"
  | "COMMENT"
  | "MENTION"
  | "PROJECT_INVITE"
  | "DEADLINE_SOON"
  | "OVERDUE"
  | "STATUS_CHANGE";

export const PRIORITY_RANK: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

export const USER_PUBLIC = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  jobTitle: true,
  lastActiveAt: true,
} as const;
