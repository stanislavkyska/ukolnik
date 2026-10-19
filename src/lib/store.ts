"use client";

// Datová vrstva aplikace. Se Supabase ukládá do databáze; bez ní (ukázkový
// režim) do prohlížeče, aby šla aplikace vyzkoušet ještě před nastavením.

import { supabaseBrowser } from "./supabase/client.ts";
import { TIME_COLUMNS, type TimeEntry, type TimeEntryPatch } from "./time.ts";
import { GOAL_COLUMNS, type NewTimeGoal, type TimeGoal } from "./goals.ts";
import { TASK_COLUMNS, type Task, type TaskPatch } from "./types.ts";

export interface NewTask {
  title: string;
  notes?: string;
  due_date: string | null;
  due_time: string | null;
  deadline: string | null;
  tags: string[];
  important: boolean;
}

export interface NewTimeEntry {
  title: string;
  tags: string[];
  task_id: string | null;
  started_at?: string;
  ended_at?: string | null;
}

export interface TaskStore {
  demo: boolean;
  list(): Promise<Task[]>;
  create(t: NewTask): Promise<Task>;
  update(id: string, patch: TaskPatch): Promise<Task>;
  updateMany(ids: string[], patch: TaskPatch): Promise<void>;
  remove(id: string): Promise<void>;
  signOut(): Promise<void>;
  /** záznamy času od data (ISO okamžik) + případné běžící stopky */
  listTime(sinceISO: string): Promise<TimeEntry[]>;
  /** zastaví běžící stopky a spustí nové */
  startTimer(e: NewTimeEntry): Promise<{ started: TimeEntry; stopped: TimeEntry | null }>;
  /** ruční záznam (už ukončený) */
  createTime(e: NewTimeEntry): Promise<TimeEntry>;
  updateTime(id: string, patch: TimeEntryPatch): Promise<TimeEntry>;
  removeTime(id: string): Promise<void>;
  listGoals(): Promise<TimeGoal[]>;
  createGoal(g: NewTimeGoal): Promise<TimeGoal>;
  removeGoal(id: string): Promise<void>;
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
    async listTime(sinceISO) {
      const { data, error } = await sb
        .from("time_entries")
        .select(TIME_COLUMNS)
        .or(`started_at.gte.${sinceISO},ended_at.is.null`)
        .order("started_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as TimeEntry[];
    },
    async startTimer(e) {
      const now = new Date().toISOString();
      const { data: stopped, error: e1 } = await sb
        .from("time_entries")
        .update({ ended_at: now })
        .is("ended_at", null)
        .select(TIME_COLUMNS);
      if (e1) throw e1;
      const { data, error } = await sb
        .from("time_entries")
        .insert({ title: e.title, tags: e.tags, task_id: e.task_id, started_at: now })
        .select(TIME_COLUMNS)
        .single();
      if (error) throw error;
      return { started: data as TimeEntry, stopped: ((stopped as TimeEntry[]) ?? [])[0] ?? null };
    },
    async createTime(e) {
      const { data, error } = await sb.from("time_entries").insert(e).select(TIME_COLUMNS).single();
      if (error) throw error;
      return data as TimeEntry;
    },
    async updateTime(id, patch) {
      const { data, error } = await sb.from("time_entries").update(patch).eq("id", id).select(TIME_COLUMNS).single();
      if (error) throw error;
      return data as TimeEntry;
    },
    async removeTime(id) {
      const { error } = await sb.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    async listGoals() {
      const { data, error } = await sb.from("time_goals").select(GOAL_COLUMNS).order("created_at");
      if (error) throw error;
      return (data as TimeGoal[]).map((g) => ({ ...g, hours: Number(g.hours) }));
    },
    async createGoal(g) {
      const { data, error } = await sb.from("time_goals").insert(g).select(GOAL_COLUMNS).single();
      if (error) throw error;
      return { ...(data as TimeGoal), hours: Number((data as TimeGoal).hours) };
    },
    async removeGoal(id) {
      const { error } = await sb.from("time_goals").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

const KEY = "ukolnik-demo-tasks";
const TIME_KEY = "ukolnik-demo-time";

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
  let tmem: TimeEntry[] | null = null;
  const tall = (): TimeEntry[] => {
    if (tmem) return tmem;
    try {
      tmem = JSON.parse(localStorage.getItem(TIME_KEY) ?? "[]");
    } catch {
      tmem = [];
    }
    return tmem!;
  };
  const twrite = () => {
    try {
      localStorage.setItem(TIME_KEY, JSON.stringify(tmem));
    } catch {
      /* jen v paměti */
    }
  };
  const all = () => (mem ??= read());
  const gall = (): TimeGoal[] => {
    try {
      return JSON.parse(localStorage.getItem("ukolnik-demo-goals") ?? "[]");
    } catch {
      return [];
    }
  };
  const gwrite = (list: TimeGoal[]) => {
    try {
      localStorage.setItem("ukolnik-demo-goals", JSON.stringify(list));
    } catch {
      /* jen v paměti */
    }
  };
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
    async listTime(sinceISO) {
      return tall().filter((e) => e.started_at >= sinceISO || !e.ended_at);
    },
    async startTimer(e) {
      const now = new Date().toISOString();
      let stopped: TimeEntry | null = null;
      tmem = tall().map((x) => (x.ended_at ? x : (stopped = { ...x, ended_at: now })));
      const started: TimeEntry = { id: crypto.randomUUID(), created_at: now, title: e.title, tags: e.tags, task_id: e.task_id, started_at: now, ended_at: null };
      tmem = [started, ...tmem];
      twrite();
      return { started, stopped };
    },
    async createTime(e) {
      const now = new Date().toISOString();
      const entry: TimeEntry = { id: crypto.randomUUID(), created_at: now, started_at: now, ended_at: now, ...e };
      tmem = [entry, ...tall()];
      twrite();
      return entry;
    },
    async updateTime(id, patch) {
      let out: TimeEntry | undefined;
      tmem = tall().map((x) => (x.id === id ? (out = { ...x, ...patch }) : x));
      twrite();
      if (!out) throw new Error("Záznam neexistuje");
      return out;
    },
    async removeTime(id) {
      tmem = tall().filter((x) => x.id !== id);
      twrite();
    },
    async listGoals() {
      return gall();
    },
    async createGoal(g) {
      const goal: TimeGoal = { ...g, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      gwrite([...gall(), goal]);
      return goal;
    },
    async removeGoal(id) {
      gwrite(gall().filter((g) => g.id !== id));
    },
  };
}

let store: TaskStore | null = null;
export function getStore(): TaskStore {
  return (store ??= DEMO ? demoStore() : supabaseStore());
}
