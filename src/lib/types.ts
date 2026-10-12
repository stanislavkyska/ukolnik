export interface Task {
  id: string;
  title: string;
  notes: string;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM[:SS]
  tags: string[];
  important: boolean;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskPatch = Partial<Pick<Task, "title" | "notes" | "due_date" | "due_time" | "tags" | "important" | "done">>;

export const TASK_COLUMNS = "id,title,notes,due_date,due_time,tags,important,done,done_at,created_at,updated_at";
