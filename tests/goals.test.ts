import { test } from "node:test";
import assert from "node:assert/strict";
import { goalProgress, hm, type TimeGoal } from "../src/lib/goals.ts";
import { parseDuration, type TimeEntry } from "../src/lib/time.ts";

const e = (start: string, end: string | null, tags: string[]): TimeEntry => ({
  id: Math.random().toString(), title: "", tags, task_id: null, started_at: start, ended_at: end, created_at: start,
});
const goal = (g: Partial<TimeGoal>): TimeGoal => ({ id: "g", tag: "projekce", period: "day", hours: 8, workdays: [1, 2, 3, 4, 5], created_at: "", ...g });

// středa 21. 10. 2026, 12:00 v Praze
const today = "2026-10-21";
const now = Date.parse("2026-10-21T10:00:00Z");

test("denní cíl: hotovo, zbývá, podštítky se počítají", () => {
  const p = goalProgress(goal({}), [
    e("2026-10-21T05:00:00Z", "2026-10-21T08:00:00Z", ["projekce/rd-senov"]),
    e("2026-10-21T08:00:00Z", "2026-10-21T09:00:00Z", ["really"]),
    e("2026-10-20T05:00:00Z", "2026-10-20T13:00:00Z", ["projekce"]),
  ], today, now);
  assert.equal(hm(p.done), "3:00");
  assert.equal(hm(p.remaining), "5:00");
  assert.equal(p.finishAt, null);
});

test("denní cíl s běžícími stopkami: odhad konce", () => {
  const p = goalProgress(goal({}), [e("2026-10-21T05:00:00Z", null, ["projekce"])], today, now);
  assert.equal(hm(p.done), "5:00");
  assert.equal(p.running, true);
  assert.equal(p.finishAt, "15:00");
});

test("denní cíl o víkendu je volno", () => {
  const p = goalProgress(goal({}), [], "2026-10-24", now);
  assert.equal(p.dayOff, true);
});

test("týdenní cíl: plán do dneška, skluz a tempo", () => {
  // po + út po 6 h, dnes (st) 2 h → 14 h z 40 h
  const list = [
    e("2026-10-19T05:00:00Z", "2026-10-19T11:00:00Z", ["projekce"]),
    e("2026-10-20T05:00:00Z", "2026-10-20T11:00:00Z", ["projekce"]),
    e("2026-10-21T06:00:00Z", "2026-10-21T08:00:00Z", ["projekce"]),
  ];
  const p = goalProgress(goal({ period: "week", hours: 40 }), list, today, now);
  assert.equal(hm(p.done), "14:00");
  assert.equal(hm(p.planToday), "24:00", "3 z 5 pracovních dní");
  assert.equal(hm(p.balance), "10:00");
  assert.ok(p.balance < 0);
  assert.equal(p.daysLeft, 3);
  assert.equal(hm(p.perDay), "8:40");
});

test("cíl celkem bez štítku a přesah", () => {
  const p = goalProgress(goal({ tag: null, hours: 2 }), [e("2026-10-21T05:00:00Z", "2026-10-21T08:00:00Z", ["really"])], today, now);
  assert.equal(hm(p.over), "1:00");
  assert.equal(p.remaining, 0);
});

test("dopsání času z textu", () => {
  assert.deepEqual(parseDuration("výkresy 2h #projekce/rd-senov"), { ms: 7200000, rest: "výkresy #projekce/rd-senov", yesterday: false });
  assert.equal(parseDuration("porada 1,5h").ms, 5400000);
  assert.equal(parseDuration("porada 1h30").ms, 5400000);
  assert.equal(parseDuration("porada 1h 30m").ms, 5400000);
  assert.equal(parseDuration("porada 2:15h").ms, 8100000);
  assert.equal(parseDuration("telefon 45min").ms, 2700000);
  assert.equal(parseDuration("včera 3h statika").yesterday, true);
  assert.equal(parseDuration("statika").ms, 0);
});
