import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtClock, fmtDuration, localDate, localTime, localToISO, rangeDates, toCSV, totalsByTag, type TimeEntry } from "../src/lib/time.ts";

const e = (start: string, end: string | null, tags: string[], title = "x"): TimeEntry => ({
  id: Math.random().toString(),
  title,
  tags,
  task_id: null,
  started_at: start,
  ended_at: end,
  created_at: start,
});

test("formát délky", () => {
  assert.equal(fmtDuration(25 * 60000), "25 min");
  assert.equal(fmtDuration(85 * 60000), "1 h 25 min");
  assert.equal(fmtDuration(120 * 60000), "2 h");
  assert.equal(fmtClock(3723000), "1:02:03");
});

test("převody na pražský čas – letní i zimní", () => {
  assert.equal(localToISO("2026-10-13", "09:00"), "2026-10-13T07:00:00.000Z"); // letní čas
  assert.equal(localToISO("2026-12-01", "09:00"), "2026-12-01T08:00:00.000Z"); // zimní čas
  assert.equal(localTime("2026-10-13T07:00:00.000Z"), "09:00");
  assert.equal(localDate("2026-10-12T22:30:00.000Z"), "2026-10-13", "po půlnoci v Praze");
});

test("rozsahy", () => {
  assert.deepEqual(rangeDates("week", "2026-10-14"), { from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(rangeDates("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
});

test("součty podle štítků včetně podštítků", () => {
  const list = [
    e("2026-10-13T07:00:00Z", "2026-10-13T08:00:00Z", ["projekce/rd-senov"]),
    e("2026-10-13T08:00:00Z", "2026-10-13T08:30:00Z", ["projekce/bd-poruba"]),
    e("2026-10-13T09:00:00Z", "2026-10-13T10:00:00Z", ["maringotka"]),
    e("2026-10-13T10:00:00Z", "2026-10-13T10:15:00Z", []),
    // dva štítky – celkem se počítá jednou, u každého štítku zvlášť
    e("2026-10-13T11:00:00Z", "2026-10-13T11:30:00Z", ["really", "maringotka"]),
  ];
  const r = totalsByTag(list);
  assert.equal(r.total, (60 + 30 + 60 + 15 + 30) * 60000);
  const proj = r.tags.find((t) => t.tag === "projekce")!;
  assert.equal(proj.ms, 90 * 60000);
  assert.deepEqual(proj.children.map((c) => c.tag), ["projekce/rd-senov", "projekce/bd-poruba"]);
  assert.equal(r.tags.find((t) => t.tag === "maringotka")!.ms, 90 * 60000);
  assert.equal(r.tags.at(-1)!.tag, "", "bez štítku na konci");
});

test("běžící záznam se počítá do teď", () => {
  const now = Date.parse("2026-10-13T08:10:00Z");
  const r = totalsByTag([e("2026-10-13T08:00:00Z", null, ["a"])], now);
  assert.equal(r.total, 10 * 60000);
});

test("CSV export", () => {
  const csv = toCSV([e("2026-10-13T07:00:00Z", "2026-10-13T08:15:00Z", ["projekce/rd-senov"], "výkresy; řez")]);
  const lines = csv.replace("﻿", "").split("\r\n");
  assert.equal(lines[1], '2026-10-13;09:00;10:15;1,25;"výkresy; řez";projekce/rd-senov');
});
