"use client";

// Datová vrstva aplikace. Se Supabase ukládá do databáze; bez ní (ukázkový
// režim) do prohlížeče, aby šla aplikace vyzkoušet ještě před nastavením.

import { supabaseBrowser } from "./supabase/client.ts";
import { TASK_COLUMNS, type Task, type TaskPatch } from "./types.ts";

export interface NewTask {
  title: string;
  notes?: string;
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  important: boolean;
}

export interface TaskStore {
  demo: boolean;
  list(): Promise<Task[]>;
  create(t: NewTask): Promise<Task>;
  update(id: string, patch: TaskPatch): Promise<Task>;
  updateMany(ids: string[], patch: TaskPatch): Promise<void>;
  remove(id: string): Promise<void>;
  signOut(): Promise<void>;
}

export const DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

function supabaseStore(): TaskStore {
  const sb = supabaseBrowser();
  const recentDone = () => new Date(Date.now() - 30 * 86400000).toISOString();
  return {
    demo: false,
    async list() {
      const { data, error } = await sb
        .from("tasks")
        .select(TASK_COLUMNS)
        .or(`done.eq.false,done_at.gte.${recentDone()}`)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
    async create(t) {
      const { data, error } = await sb.from("tasks").insert(t).select(TASK_COLUMNS).single();
      if (error) throw error;
      return data as Task;
    },
    async update(id, patch) {
      const { data, error } = await sb.from("tasks").update(patch).eq("id", id).select(TASK_COLUMNS).single();
      if (error) throw error;
      return data as Task;
    },
    async updateMany(ids, patch) {
      const { error } = await sb.from("tasks").update(patch).in("id", ids);
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
      window.location.href = "/login";
    },
  };
}

const KEY = "ukolnik-demo-tasks";

function demoStore(): TaskStore {
  const read = (): Task[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      return [];
    }
  };
  const write = (tasks: Task[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tasks));
    } catch {
      /* úložiště nedostupné – data zůstanou jen v paměti */
    }
  };
  let mem: Task[] | null = null;
  const all = () => (mem ??= read());
  const apply = (t: Task, patch: TaskPatch): Task => {
    const next = { ...t, ...patch, updated_at: new Date().toISOString() };
    if (patch.done === true && !t.done) next.done_at = new Date().toISOString();
    if (patch.done === false) next.done_at = null;
    return next;
  };
  return {
    demo: true,
    async list() {
      return [...all()];
    },
    async create(t) {
      const now = new Date().toISOString();
      const task: Task = { id: crypto.randomUUID(), notes: "", done: false, done_at: null, created_at: now, updated_at: now, ...t };
      mem = [...all(), task];
      write(mem);
      return task;
    },
    async update(id, patch) {
      let out: Task | undefined;
      mem = all().map((t) => (t.id === id ? (out = apply(t, patch)) : t));
      write(mem);
      if (!out) throw new Error("Úkol neexistuje");
      return out;
    },
    async updateMany(ids, patch) {
      const set = new Set(ids);
      mem = all().map((t) => (set.has(t.id) ? apply(t, patch) : t));
      write(mem);
    },
    async remove(id) {
      mem = all().filter((t) => t.id !== id);
      write(mem);
    },
    async signOut() {},
  };
}

let store: TaskStore | null = null;
export function getStore(): TaskStore {
  return (store ??= DEMO ? demoStore() : supabaseStore());
}
