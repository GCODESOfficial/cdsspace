export const TASKBOARD_COLORS = [
  "#0A4FE8",
  "#040B37",
  "#7C3AED",
  "#0F9F6E",
  "#EA580C",
  "#DB2777",
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskboardMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  departments?: string[];
  board_role?: "owner" | "editor" | "viewer";
}

export interface TaskboardAttachment {
  id: string;
  task_id: string;
  kind: "upload" | "external" | "cdoc" | "brand_brief";
  title: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface TaskboardDocumentOption {
  id: string;
  kind: "cdoc" | "brand_brief";
  title: string;
  subtitle: string | null;
  url: string;
}

export interface TaskboardComment {
  id: string;
  task_id: string;
  author_kind: "admin" | "team";
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface TaskboardTask {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  due_at: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_kind: "admin" | "team" | null;
  created_by_id: string | null;
  created_by_name: string | null;
  completed_by_kind: "admin" | "team" | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
  assignees: TaskboardMember[];
  attachments: TaskboardAttachment[];
  comments: TaskboardComment[];
}

export interface TaskboardList {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_by_kind: "admin" | "team" | null;
  created_by_id: string | null;
  tasks: TaskboardTask[];
  members: TaskboardMember[];
}

export interface TaskboardBoard {
  id: string;
  title: string;
  description: string | null;
  color: string;
  created_by_kind: "admin" | "team";
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskboardActivity {
  id: string;
  board_id: string;
  task_id: string | null;
  actor_kind: "admin" | "team" | "system";
  actor_name: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface TaskboardPayload {
  ok: true;
  portal: "admin" | "team";
  viewer: {
    kind: "admin" | "team";
    id: string;
    name: string;
    can_edit: boolean;
    can_manage: boolean;
    can_view_all_tasks: boolean;
    can_add_list: boolean;
  };
  boards: TaskboardBoard[];
  board: TaskboardBoard | null;
  lists: TaskboardList[];
  members: TaskboardMember[];
  available_members: TaskboardMember[];
  document_options: TaskboardDocumentOption[];
  activity: TaskboardActivity[];
}
