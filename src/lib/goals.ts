// Cíle odpracovaných hodin: „projekce 8 h denně“, „celkem 40 h týdně“…
// Výpočet průběhu, zbývajícího času, tempa a odhadu, kdy bude hotovo.

import { addDays, addMonths, daysBetween, weekday } from "./dates.ts";
import { normalize } from "./text.ts";
import { durationMs, inRange, localDate, localTime, rangeDates, type TimeEntry } from "./time.ts";

export type GoalPeriod = "day" | "week" | "month" | "project";

export interface TimeGoal {
  id: string;
  tag: string | null; // null = všechen čas
  period: GoalPeriod;
  hours: number;
  workdays: number[]; // 1 = po … 7 = ne
  created_at: string;
}

export type NewTimeGoal = Omit<TimeGoal, "id" | "created_at">;

export const GOAL_COLUMNS = "id,tag,period,hours,workdays,created_at";
export const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

const H = 3600000;

/** Štítek cíle „mm“ započítá „mm“, „mm/rd-jarosek“ i „mm-rd-jarosek“ */
export function entryMatches(e: TimeEntry, tag: string | null): boolean {
  if (!tag) return true;
  const t = normalize(tag);
  return e.tags.some((g) => {
    const n = normalize(g);
    return n === t || n.startsWith(t + "/") || n.startsWith(t + "-");
  });
}

function workdaysBetween(from: string, to: string, workdays: number[]): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (workdays.includes(weekday(d))) n++;
  return n;
}

export interface GoalProgress {
  goal: TimeGoal;
  /** dnes je v cíli volný den (u denního cíle) */
  dayOff: boolean;
  done: number; // ms
  target: number; // ms
  remaining: number; // ms (≥ 0)
  over: number; // ms nad cíl
  /** kolik mělo být hotovo do konce dneška podle rovnoměrného plánu */
  planToday: number;
  /** done − planToday: kladné = náskok, záporné = skluz */
  balance: number;
  /** zbývající pracovní dny včetně dneška */
  daysLeft: number;
  /** potřebné tempo na den (týden/měsíc) */
  perDay: number;
  /** převod z minulých týdnů/měsíců: kladné = náskok, záporné = skluz (ms) */
  carry: number;
  /** běží stopky, které se do cíle počítají */
  running: boolean;
  /** pokud běží stopky: kdy bude cíl splněný (HH:MM), jen když je to ještě dnes */
  finishAt: string | null;
}

/** Začátek prvního období týdenního/měsíčního cíle (období, ve kterém byl cíl založen) */
export function goalStart(goal: Pick<TimeGoal, "period" | "created_at">): string | null {
  if ((goal.period !== "week" && goal.period !== "month") || !goal.created_at || isNaN(Date.parse(goal.created_at))) return null;
  return rangeDates(goal.period, localDate(goal.created_at)).from;
}

/** Odkud je potřeba načíst záznamy, aby šel spočítat převod skluzu u všech cílů */
export function goalsHistoryStart(goals: Pick<TimeGoal, "period" | "created_at">[]): string | null {
  const starts = goals.map(goalStart).filter((d): d is string => !!d);
  return starts.length ? starts.sort()[0] : null;
}

/**
 * Převod z minulých období: součet (odpracováno − cíl) za všechna ukončená období
 * od založení cíle. Kladné = náskok, záporné = skluz.
 */
export function goalCarry(goal: TimeGoal, entries: TimeEntry[], today: string, now: number = Date.now()): number {
  const start = goalStart(goal);
  if (!start) return 0;
  const current = rangeDates(goal.period as "week" | "month", today).from;
  const target = goal.hours * H;
  let carry = 0;
  for (let from = start; from < current; from = goal.period === "week" ? addDays(from, 7) : addMonths(from, 1)) {
    const to = rangeDates(goal.period as "week" | "month", from).to;
    const done = entries.filter((e) => inRange(e, from, to) && entryMatches(e, goal.tag)).reduce((s, e) => s + durationMs(e, now), 0);
    carry += done - target;
  }
  return carry;
}

/**
 * @param budgetDone u rozpočtu projektu: součet ukončených záznamů za celou dobu (ze serveru);
 *                   běžící stopky se přičtou z `entries`
 */
export function goalProgress(goal: TimeGoal, entries: TimeEntry[], today: string, now: number = Date.now(), budgetDone = 0): GoalProgress {
  if (goal.period === "project") {
    const live = entries.filter((e) => !e.ended_at && entryMatches(e, goal.tag));
    const done = budgetDone + live.reduce((s, e) => s + durationMs(e, now), 0);
    const target = goal.hours * H;
    return {
      goal,
      dayOff: false,
      done,
      target,
      remaining: Math.max(0, target - done),
      over: Math.max(0, done - target),
      planToday: target,
      balance: 0,
      daysLeft: 0,
      perDay: 0,
      running: live.length > 0,
      finishAt: null,
      carry: 0,
    };
  }
  const { from, to } = goal.period === "day" ? { from: today, to: today } : rangeDates(goal.period, today);
  const mine = entries.filter((e) => inRange(e, from, to) && entryMatches(e, goal.tag));
  const done = mine.reduce((s, e) => s + durationMs(e, now), 0);
  const running = mine.some((e) => !e.ended_at);
  const target = goal.hours * H;
  const carry = goal.period === "day" ? 0 : goalCarry(goal, entries, today, now);
  // skluz z minula se přičte k tomu, co je potřeba dodělat (náskok naopak ubere)
  const remaining = Math.max(0, target - carry - done);
  const over = Math.max(0, done + carry - target);

  const isWorkday = goal.workdays.includes(weekday(today));
  let planToday = target;
  let daysLeft = 1;
  if (goal.period === "day") {
    daysLeft = isWorkday ? 1 : 0;
  } else {
    const total = workdaysBetween(from, to, goal.workdays);
    const upToToday = workdaysBetween(from, today, goal.workdays);
    planToday = total ? (target * upToToday) / total : target;
    daysLeft = workdaysBetween(today, to, goal.workdays);
  }
  const perDay = daysLeft > 0 ? remaining / daysLeft : remaining;

  let finishAt: string | null = null;
  if (running && remaining > 0) {
    const end = now + remaining;
    const endDay = new Date(end);
    // jen když to vyjde ještě dnes
    if (daysBetween(today, isoDay(endDay)) === 0) finishAt = localTime(endDay.toISOString());
  }

  return {
    goal,
    dayOff: goal.period === "day" && !isWorkday,
    done,
    target,
    remaining,
    over,
    planToday,
    balance: done - planToday + carry,
    daysLeft,
    perDay,
    running,
    finishAt,
    carry,
  };
}

function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** „2:05“ – hodiny a minuty, pro cíle čitelnější než „2 h 5 min“ */
export function hm(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60000);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function goalLabel(g: Pick<TimeGoal, "tag" | "period">): string {
  const what = g.tag ? g.tag : "Celkem";
  const when = g.period === "day" ? "dnes" : g.period === "week" ? "tento týden" : g.period === "month" ? "tento měsíc" : "rozpočet projektu";
  return `${what} · ${when}`;
}

export function hoursText(h: number): string {
  const s = Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100).replace(".", ",");
  return `${s} h`;
}
