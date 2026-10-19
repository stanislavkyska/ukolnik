"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, dayName, cap, todayISO } from "@/lib/dates";
import type { ParsedTask } from "@/lib/parse";
import { deadlinesSoon, doneGroups, dueOn, overdue, planGroups } from "@/lib/plan";
import { getStore } from "@/lib/store";
import { countTags } from "@/lib/tags";
import type { TimeEntry } from "@/lib/time";
import type { Task, TaskPatch } from "@/lib/types";
import { EditSheet } from "./EditSheet";
import { QuickAdd, type QuickAddHandle } from "./QuickAdd";
import { RunningTimer } from "./RunningTimer";
import { Tag } from "./TagSuggest";
import { TaskRow } from "./TaskRow";
import { TimeSheet } from "./TimeSheet";
import { TimeView } from "./TimeView";
import { DayWeather, useWeather, WeatherCard } from "./Weather";
import { CalendarSheet, EventList, filterEvents, useCalendar } from "./Calendar";
import { GoalsBar, GoalsSheet } from "./Goals";
import type { TimeGoal } from "@/lib/goals";
import { localToISO } from "@/lib/time";

type View = "today" | "plan" | "done" | "time";
// měření času: načítáme 45 dní zpět (pokryje měsíc i týden přes přelom měsíce)
const TIME_HISTORY_DAYS = 45;
const MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

interface Toast {
  text: string;
  undo?: () => void;
}

export function App() {
  const store = getStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [timeError, setTimeError] = useState(false);
  const [editingTime, setEditingTime] = useState<TimeEntry | "new" | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [goals, setGoals] = useState<TimeGoal[]>([]);
  const [goalsError, setGoalsError] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  // datum až v prohlížeči – stránka se předgeneruje při buildu
  const [today, setToday] = useState<string | null>(null);
  const quick = useRef<QuickAddHandle>(null);
  const weather = useWeather();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - TIME_HISTORY_DAYS * 86400000).toISOString();
    const [t, tm, gl] = await Promise.allSettled([store.list(), store.listTime(since), store.listGoals()]);
    if (gl.status === "fulfilled") {
      setGoals(gl.value);
      setGoalsError(false);
    } else setGoalsError(true);
    try {
      if (t.status === "fulfilled") {
        setTasks(t.value);
        setError(null);
      } else {
        setError("Úkoly se nepodařilo načíst. Zkontroluj připojení a obnov stránku.");
        console.error(t.reason);
      }
      if (tm.status === "fulfilled") {
        setTimes(tm.value);
        setTimeError(false);
      } else {
        setTimeError(true);
        console.error(tm.reason);
      }
    } finally {
      setLoaded(true);
      setToday(todayISO());
    }
  }, [store]);

  const cal = useCalendar(!store.demo, load);

  useEffect(() => {
    // návrat z připojení kalendáře
    const p = new URLSearchParams(window.location.search).get("calendar");
    if (!p) return;
    const msg: Record<string, string> = {
      connected: "Kalendář připojen. Úkoly s datem se zapisují do kalendáře „Úkoly“.",
      denied: "Připojení kalendáře bylo zrušeno.",
      "no-refresh": "Google nevrátil trvalý přístup. Odeber aplikaci v účtu Google (Zabezpečení → Aplikace třetích stran) a připoj znovu.",
      "not-configured": "Napojení kalendáře ještě není nastavené na serveru.",
      error: "Připojení kalendáře se nepovedlo. Zkus to znovu.",
    };
    showToast({ text: msg[p] ?? msg.error });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    load();
    // po návratu do aplikace (jiné zařízení mohlo něco změnit) načíst znovu
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  useEffect(() => {
    // zkratka: N nebo / skočí do zadávání
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "/") {
        e.preventDefault();
        quick.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (t: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const fail = (e: unknown) => {
    console.error(e);
    showToast({ text: "Změnu se nepodařilo uložit." });
    load();
  };

  const replace = (t: Task) => setTasks((list) => list.map((x) => (x.id === t.id ? t : x)));

  const patch = async (task: Task, p: TaskPatch, msg?: string) => {
    const before = task;
    replace({ ...task, ...p, done_at: p.done === true ? new Date().toISOString() : p.done === false ? null : task.done_at });
    try {
      replace(await store.update(task.id, p));
      cal.requestSync();
      if (msg) {
        showToast({
          text: msg,
          undo: () => patch(before, {
            done: before.done,
            due_date: before.due_date,
            due_time: before.due_time,
            deadline: before.deadline,
          }),
        });
      }
    } catch (e) {
      fail(e);
    }
  };

  const add = async (p: ParsedTask) => {
    try {
      const t = await store.create({
        title: p.title,
        due_date: p.dueDate,
        due_time: p.dueTime,
        deadline: p.deadline,
        tags: p.tags,
        important: p.important,
      });
      setTasks((list) => [...list, t]);
      cal.requestSync();
      // když úkol nebude v aktuálním pohledu vidět, dát vědět, kam spadl
      const day = t.due_date ?? t.deadline;
      if (view === "today" && day !== today) {
        showToast({ text: day ? "Přidáno do plánu." : "Přidáno do plánu bez termínu." });
      }
    } catch (e) {
      fail(e);
      throw e;
    }
  };

  const toggle = (t: Task) => patch(t, { done: !t.done }, t.done ? "Vráceno mezi úkoly." : "Hotovo.");

  const moveTo = (id: string, date: string | null) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.due_date === date) return;
    patch(t, { due_date: date, due_time: date ? t.due_time : null }, "Přesunuto.");
  };

  const moveOverdueToToday = async (list: Task[]) => {
    const ids = list.map((t) => t.id);
    const day = todayISO();
    setTasks((all) => all.map((t) => (ids.includes(t.id) ? { ...t, due_date: day } : t)));
    try {
      await store.updateMany(ids, { due_date: day });
      cal.requestSync();
      showToast({ text: `Přesunuto na dnes: ${ids.length}.` });
    } catch (e) {
      fail(e);
    }
  };

  // štítky jsou společné pro úkoly i čas
  const usage = useMemo(() => countTags([...tasks.map((t) => t.tags), ...times.map((e) => e.tags)]), [tasks, times]);
  const running = times.find((e) => !e.ended_at) ?? null;

  const replaceTime = (e: TimeEntry) => setTimes((list) => list.map((x) => (x.id === e.id ? e : x)));

  const startTimer = async (entry: { title: string; tags: string[]; task_id: string | null; started_at?: string }) => {
    try {
      const { started, stopped } = await store.startTimer(entry);
      setTimes((list) => [started, ...list.map((x) => (stopped && x.id === stopped.id ? stopped : x))]);
    } catch (e) {
      fail(e);
    }
  };

  const stopTimer = async () => {
    if (!running) return;
    const ended_at = new Date().toISOString();
    replaceTime({ ...running, ended_at });
    try {
      replaceTime(await store.updateTime(running.id, { ended_at }));
    } catch (e) {
      fail(e);
    }
  };

  const onTaskTimer = (t: Task) => {
    if (running?.task_id === t.id) stopTimer();
    else startTimer({ title: t.title, tags: t.tags, task_id: t.id });
  };
  const visible = useMemo(
    () => (filter ? tasks.filter((t) => t.tags.some((g) => g.toLowerCase() === filter.toLowerCase())) : tasks),
    [tasks, filter],
  );

  const openTagUsage = useMemo(() => countTags(tasks.filter((t) => !t.done).map((t) => t.tags)), [tasks]);

  if (!today) return <div className="app" aria-busy="true" />;
  const [, m, d] = today.split("-").map(Number);
  const late = overdue(visible, today);
  const todays = dueOn(visible, today);
  const tomorrowCount = dueOn(visible, addDays(today, 1)).length;
  const soon = deadlinesSoon(visible, today);
  const todayEvents = filterEvents(cal.byDay.get(today), filter);
  const busyDates = new Set([...cal.byDay.keys()].filter((d) => filterEvents(cal.byDay.get(d), filter).length));

  const rowProps = {
    today,
    onToggle: toggle,
    onOpen: setEditing,
    onTag: (t: string) => setFilter((f) => (f === t ? null : t)),
    onTimer: timeError ? undefined : onTaskTimer,
  };
  const timingId = running?.task_id ?? null;

  return (
    <div className="app">
      <header className="head">
        <div className="head-date">
          <h1>
            <span className="head-day">{cap(dayName(today))}</span>
            <span className="head-num">
              {d}. {MONTHS[m - 1]}
            </span>
          </h1>
          <p className="head-sum">
            {!loaded
              ? "Načítám…"
              : todays.length + late.length === 0
                ? "Na dnes nic nečeká."
                : `Na dnes ${todays.length}${late.length ? `, po termínu ${late.length}` : ""}.`}
          </p>
        </div>
        <WeatherCard w={weather} today={today} />
      </header>

      {store.demo && (
        <p className="demo">Ukázkový režim: úkoly se ukládají jen v tomto prohlížeči. Po nastavení Supabase se budou synchronizovat mezi zařízeními.</p>
      )}

      {running && <RunningTimer entry={running} onStop={stopTimer} onOpen={() => setEditingTime(running)} />}

      {view === "time" ? (
        <QuickAdd
          key="timer"
          ref={quick}
          timer
          tagUsage={usage}
          onAdd={async (p) => {
            const day = p.yesterday ? addDays(todayISO(), -1) : todayISO();
            const at = (hhmm: string) => Date.parse(localToISO(day, hhmm));
            const dur = p.durationMs ?? 0;
            let start: number | null = null;
            let end: number | null = null;
            if (p.fromTime && p.toTime) {
              start = at(p.fromTime);
              end = at(p.toTime);
              if (end <= start) end += 86400000; // přes půlnoc
            } else if (p.fromTime && dur) {
              start = at(p.fromTime);
              end = start + dur;
            } else if (p.toTime && dur) {
              end = at(p.toTime);
              start = end - dur;
            } else if (dur) {
              // jen délka: končí teď, u „včera“ včera v 17:00
              end = p.yesterday ? at("17:00") : Date.now();
              start = end - dur;
            } else if (p.fromTime) {
              // stopky běžící od zadaného času
              const from = at(p.fromTime);
              if (from > Date.now() + 60000) {
                showToast({ text: `Začátek ${p.fromTime} je v budoucnu.` });
                throw new Error("future");
              }
              await startTimer({ title: p.title, tags: p.tags, task_id: null, started_at: new Date(from).toISOString() });
              return;
            }
            if (start === null || end === null) {
              await startTimer({ title: p.title, tags: p.tags, task_id: null });
              return;
            }
            if (end > Date.now() + 60000) {
              showToast({ text: "Konec záznamu je v budoucnu. Pro běžící stopky napiš jen „od 8:00“." });
              throw new Error("future");
            }
            try {
              const created = await store.createTime({
                title: p.title,
                tags: p.tags,
                task_id: null,
                started_at: new Date(start).toISOString(),
                ended_at: new Date(end).toISOString(),
              });
              setTimes((list) => [created, ...list]);
              showToast({ text: "Čas zapsán." });
            } catch (e) {
              fail(e);
            }
          }}
        />
      ) : (
        <QuickAdd key="task" ref={quick} tagUsage={usage} onAdd={add} />
      )}

      <nav className="tabs" aria-label="Pohled">
        {(
          [
            ["today", "Dnes"],
            ["plan", "Plán"],
            ["done", "Hotovo"],
            ["time", "Čas"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button key={v} type="button" className={view === v ? "tab is-active" : "tab"} aria-current={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </nav>

      {view !== "time" && openTagUsage.length > 0 && (
        <div className="filters" role="group" aria-label="Filtrovat podle štítku">
          {openTagUsage.map((t) => (
            <Tag key={t.name} name={t.name} active={filter === t.name} onClick={() => setFilter((f) => (f === t.name ? null : t.name))} />
          ))}
          {filter && (
            <button type="button" className="filters-clear" onClick={() => setFilter(null)}>
              Zrušit filtr
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <main className="lists">
        {view === "today" && loaded && (
          <>
            <GoalsBar goals={goals} entries={times} today={today} />
            {todayEvents.length > 0 && (
              <section className="group">
                <div className="group-head">
                  <h2>V kalendáři</h2>
                </div>
                <EventList events={todayEvents} day={today} onTag={rowProps.onTag} />
              </section>
            )}
            {late.length > 0 && (
              <section className="group tone-overdue">
                <div className="group-head">
                  <h2>Po termínu</h2>
                  <button type="button" className="btn-ghost small" onClick={() => moveOverdueToToday(late)}>
                    Přesunout vše na dnes
                  </button>
                </div>
                <ul>
                  {late.map((t) => (
                    <TaskRow key={t.id} task={t} showDate timing={timingId === t.id} {...rowProps} />
                  ))}
                </ul>
              </section>
            )}
            <section className="group">
              {late.length > 0 && (
                <div className="group-head">
                  <h2>Dnes</h2>
                </div>
              )}
              {todays.length ? (
                <ul>
                  {todays.map((t) => (
                    <TaskRow key={t.id} task={t} timing={timingId === t.id} {...rowProps} />
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  {filter ? `Na dnes nic se štítkem #${filter}.` : "Na dnes nic. Napiš úkol do pole nahoře, termín pozná sám."}
                </p>
              )}
            </section>
            {soon.length > 0 && (
              <section className="group tone-deadline">
                <div className="group-head">
                  <h2>Blíží se deadline</h2>
                </div>
                <ul>
                  {soon.map((t) => (
                    <TaskRow key={t.id} task={t} showDate timing={timingId === t.id} {...rowProps} />
                  ))}
                </ul>
              </section>
            )}
            {tomorrowCount > 0 && (
              <button type="button" className="peek" onClick={() => setView("plan")}>
                Zítra {tomorrowCount === 1 ? "čeká 1 úkol" : tomorrowCount < 5 ? `čekají ${tomorrowCount} úkoly` : `čeká ${tomorrowCount} úkolů`}
              </button>
            )}
          </>
        )}

        {view === "plan" &&
          loaded &&
          planGroups(visible, today, 14, busyDates).map((g) => {
            const dayEvents = g.date ? filterEvents(cal.byDay.get(g.date), filter) : [];
            const target = g.key === "none" ? null : g.date;
            const droppable = g.key === "none" || !!g.date;
            return (
              <section
                key={g.key}
                className={`group${g.tone ? ` tone-${g.tone}` : ""}${dropOn === g.key ? " is-drop" : ""}`}
                onDragOver={
                  droppable
                    ? (e) => {
                        e.preventDefault();
                        setDropOn(g.key);
                      }
                    : undefined
                }
                onDragLeave={() => setDropOn((k) => (k === g.key ? null : k))}
                onDrop={
                  droppable
                    ? (e) => {
                        e.preventDefault();
                        setDropOn(null);
                        const id = e.dataTransfer.getData("text/task-id");
                        if (id) moveTo(id, target);
                      }
                    : undefined
                }
              >
                <div className="group-head">
                  <h2>{g.label}</h2>
                  {g.date && <DayWeather day={weather.dayFor(g.date)} />}
                  {g.key === "overdue" && (
                    <button type="button" className="btn-ghost small" onClick={() => moveOverdueToToday(g.tasks)}>
                      Přesunout vše na dnes
                    </button>
                  )}
                </div>
                <EventList events={dayEvents} day={g.date ?? today} onTag={rowProps.onTag} />
                {g.tasks.length ? (
                  <ul>
                    {g.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} showDate={!g.date} timing={timingId === t.id} {...rowProps} />
                    ))}
                  </ul>
                ) : (
                  !dayEvents.length && <p className="empty small">Volno.</p>
                )}
              </section>
            );
          })}

        {view === "done" && loaded && (
          <section className="group">
            {doneGroups(visible).length ? (
              <ul>
                {doneGroups(visible).map((t) => (
                  <TaskRow key={t.id} task={t} showDate timing={timingId === t.id} {...rowProps} />
                ))}
              </ul>
            ) : (
              <p className="empty">Zatím nic hotového za posledních 30 dní.</p>
            )}
          </section>
        )}
        {view === "time" && loaded && (
          timeError ? (
            <p className="error">
              Měření času ještě není v databázi. V Supabase spusť SQL ze souboru supabase/002_time.sql a obnov stránku.
            </p>
          ) : (
            <>
            {goals.length ? (
              <GoalsBar goals={goals} entries={times} today={today} onManage={() => setGoalsOpen(true)} />
            ) : (
              <div className="goals-cta">
                {goalsError ? (
                  <p className="sheet-hint">Cíle hodin ještě nejsou v databázi – v Supabase spusť SQL ze souboru supabase/005_goals.sql.</p>
                ) : (
                  <button type="button" className="btn-ghost small" onClick={() => setGoalsOpen(true)}>
                    Nastavit cíl hodin (např. projekce 8 h denně)
                  </button>
                )}
              </div>
            )}
            <TimeView
              entries={times}
              today={today}
              onOpen={setEditingTime}
              onAdd={() => setEditingTime("new")}
              onRestart={(e) => startTimer({ title: e.title, tags: e.tags, task_id: e.task_id })}
              onStop={stopTimer}
            />
            </>
          )
        )}
      </main>

      {editingTime && (
        <TimeSheet
          key={editingTime === "new" ? "new" : editingTime.id}
          entry={editingTime === "new" ? null : editingTime}
          usage={usage}
          onClose={() => setEditingTime(null)}
          onSave={async (p) => {
            const target = editingTime;
            setEditingTime(null);
            try {
              if (target === "new") {
                const created = await store.createTime({ ...p, task_id: null });
                setTimes((list) => [created, ...list]);
                showToast({ text: "Záznam přidán." });
              } else {
                replaceTime({ ...target, ...p });
                replaceTime(await store.updateTime(target.id, p));
              }
            } catch (e) {
              fail(e);
            }
          }}
          onDelete={
            editingTime === "new"
              ? undefined
              : async () => {
                  const target = editingTime;
                  setEditingTime(null);
                  setTimes((list) => list.filter((x) => x.id !== target.id));
                  try {
                    await store.removeTime(target.id);
                    showToast({ text: "Záznam smazán." });
                  } catch (e) {
                    fail(e);
                  }
                }
          }
        />
      )}

      {editing && (
        <EditSheet
          key={editing.id}
          task={editing}
          usage={usage}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            patch(editing, p);
            setEditing(null);
          }}
          onDelete={async () => {
            const t = editing;
            setEditing(null);
            setTasks((list) => list.filter((x) => x.id !== t.id));
            try {
              await store.remove(t.id);
              cal.requestSync();
              showToast({ text: "Úkol smazán." });
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}

      {!store.demo && (
        <footer className="foot">
          <button type="button" className="btn-ghost small" onClick={() => setCalOpen(true)}>
            {cal.status?.reconnect ? "⚠ Kalendář – připojit znovu" : cal.connected ? (cal.syncing ? "Kalendář · synchronizuji…" : "Kalendář") : "Připojit kalendář"}
          </button>
          <button type="button" className="btn-ghost small" onClick={() => store.signOut()}>
            Odhlásit
          </button>
        </footer>
      )}

      {calOpen && <CalendarSheet cal={cal} onClose={() => setCalOpen(false)} />}

      {goalsOpen && (
        <GoalsSheet
          goals={goals}
          usage={countTags(times.map((e) => e.tags))}
          onClose={() => setGoalsOpen(false)}
          onCreate={async (g) => {
            try {
              const created = await store.createGoal(g);
              setGoals((list) => [...list, created]);
            } catch (e) {
              fail(e);
            }
          }}
          onRemove={async (id) => {
            setGoals((list) => list.filter((g) => g.id !== id));
            try {
              await store.removeGoal(id);
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}

      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div className="toast">
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Zpět
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

