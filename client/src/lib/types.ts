export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type WorkspaceRole = "ADMIN" | "MEMBER";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  jobTitle: string | null;
  lastActiveAt: string;
}

export interface UserLite {
  id: string;
  name: string;
  avatar: string | null;
  jobTitle?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  role: WorkspaceRole;
  memberCount?: number;
  projectCount?: number;
}

export interface Member extends User {
  workspaceRole: WorkspaceRole;
  joinedAt?: string;
  assignedCount?: number;
  completedCount?: number;
  currentProject?: { id: string; name: string } | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  status: ProjectStatus;
  workspaceId: string;
  ownerId: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  members: (User & { projectRole?: string })[];
  owner?: User;
  taskCount: number;
  doneCount: number;
  inProgressCount: number;
  completion: number;
  canManage?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assigneeId: string | null;
  createdById: string;
  status: TaskStatus;
  priority: Priority;
  position: number;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: User | null;
  createdBy: User;
  project: { id: string; name: string; color: string };
  _count: { comments: number; attachments: number };
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  user: UserLite;
}

export interface Activity {
  id: string;
  userId: string;
  projectId: string;
  taskId: string | null;
  action: string;
  details: string;
  createdAt: string;
  user: UserLite;
  task?: { id: string; title: string } | null;
  project?: { id: string; name: string };
}

export interface FileItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  projectId: string;
  taskId: string | null;
  uploadedBy: UserLite;
  task?: { id: string; title: string } | null;
  project?: { id: string; name: string; color: string } | null;
}

export interface TaskDetail extends Task {
  attachments: FileItem[];
  activities: Activity[];
}

export interface AppNotification {
  id: string;
  type: "TASK_ASSIGNED" | "COMMENT" | "MENTION" | "PROJECT_INVITE" | "DEADLINE_SOON" | "OVERDUE" | "STATUS_CHANGE";
  message: string;
  relatedProjectId: string | null;
  relatedTaskId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  taskId: string;
  title: string;
  project: { id: string; name: string; color: string };
  commentCount: number;
  lastComment: Comment;
  unread: number;
}

export interface DashboardData {
  range: "week" | "month";
  totals: {
    total: number;
    completed: number;
    inProgress: number;
    completionRate: number;
    createdChange: number;
    completedChange: number;
  };
  chart: { label: string; created: number; completed: number }[];
  projects: (Omit<Project, "members" | "canManage"> & { members: User[] })[];
  members: (User & { workspaceRole: WorkspaceRole })[];
  activity: Activity[];
}
