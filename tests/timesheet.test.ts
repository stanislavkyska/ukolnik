import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSheet, cellText, favorites, parseCell, parseToggl, planCell, slugTag, togglToEntries } from "../src/lib/timesheet.ts";
import type { TimeEntry } from "../src/lib/time.ts";

let n = 0;
const e = (start: string, end: string | null, tags: string[], title = "x"): TimeEntry => ({
  id: `e${++n}`, title, tags, task_id: null, started_at: start, ended_at: end, created_at: start,
});

const now = Date.parse("2026-10-21T12:00:00Z");

test("rychlý start: častější a novější výš", () => {
  const list = [
    e("2026-10-20T06:00:00Z", "2026-10-20T07:00:00Z", ["projekce/rd-senov"], "Výkresy"),
    e("2026-10-19T06:00:00Z", "2026-10-19T07:00:00Z", ["projekce/rd-senov"], "výkresy"),
    e("2026-10-21T06:00:00Z", "2026-10-21T07:00:00Z", ["maringotka"], "Elektro"),
    e("2026-08-01T06:00:00Z", "2026-08-01T07:00:00Z", ["stare"], "Staré"),
  ];
  const f = favorites(list, now);
  assert.equal(f.length, 2, "staré nad 30 dní vypadne");
  assert.equal(f[0].count + f[1].count, 3);
  assert.ok(f.some((x) => x.title === "Výkresy" && x.count === 2), "sloučí bez ohledu na velikost písmen");
});

test("výkaz: řádky podle štítků, součty dnů", () => {
  const list = [
    e("2026-10-19T06:00:00Z", "2026-10-19T10:00:00Z", ["projekce/rd-senov"]),
    e("2026-10-20T06:00:00Z", "2026-10-20T08:30:00Z", ["projekce/bd-poruba"]),
    e("2026-10-20T16:00:00Z", "2026-10-20T18:00:00Z", ["maringotka"]),
    e("2026-10-21T06:00:00Z", null, ["projekce/rd-senov"]),
    e("2026-10-27T06:00:00Z", "2026-10-27T08:00:00Z", ["mimo"]),
  ];
  const s = buildSheet(list, "2026-10-19", ["really"], now);
  assert.deepEqual(s.rows.map((r) => r.tag), ["maringotka", "projekce/bd-poruba", "projekce/rd-senov", "really"]);
  const rd = s.rows.find((r) => r.tag === "projekce/rd-senov")!;
  assert.equal(cellText(rd.cells[0]), "4:00");
  assert.equal(cellText(rd.cells[2]), "6:00", "běžící do teď");
  assert.equal(rd.running[2], true);
  assert.equal(cellText(s.dayTotals[1]), "4:30");
  assert.equal(cellText(s.total), "14:30");
});

test("buňka: přidání naváže na poslední záznam dne", () => {
  const list = [e("2026-10-19T06:00:00Z", "2026-10-19T10:00:00Z", ["projekce/rd-senov"])];
  const p = planCell(list, "projekce/rd-senov", "2026-10-19", 6 * 3600000, now);
  assert.deepEqual(p.create, {
    title: "Výkaz",
    tags: ["projekce/rd-senov"],
    started_at: "2026-10-19T10:00:00.000Z",
    ended_at: "2026-10-19T12:00:00.000Z",
  });
  const empty = planCell([], "maringotka", "2026-10-22", 90 * 60000, now);
  assert.equal(empty.create!.started_at, "2026-10-22T06:00:00.000Z", "prázdný den od 8:00 pražského času");
});

test("buňka: ubrání zkracuje a maže od nejpozdějšího", () => {
  const a = e("2026-10-19T06:00:00Z", "2026-10-19T08:00:00Z", ["p"]);
  const b = e("2026-10-19T09:00:00Z", "2026-10-19T10:00:00Z", ["p"]);
  const p = planCell([a, b], "p", "2026-10-19", 90 * 60000, now);
  assert.deepEqual(p.remove, [b.id]);
  assert.deepEqual(p.shorten, [{ id: a.id, ended_at: "2026-10-19T07:30:00.000Z" }]);
  assert.equal(p.create, null);
  const zero = planCell([a, b], "p", "2026-10-19", 0, now);
  assert.deepEqual(zero.remove.sort(), [a.id, b.id].sort());
});

test("zadání do buňky", () => {
  assert.equal(parseCell("1:30"), 5400000);
  assert.equal(parseCell("1,5"), 5400000);
  assert.equal(parseCell("2h"), 7200000);
  assert.equal(parseCell("45m"), 2700000);
  assert.equal(parseCell(""), 0);
  assert.equal(parseCell("abc"), null);
  assert.equal(parseCell("30"), null, "víc než 24 h za den nedává smysl");
});

test("import z Togglu", () => {
  const csv = [
    "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount ()",
    'Stanislav,s@x.cz,,RD Šenov,,"Půdorysy, 1.NP",No,2026-10-01,08:00:00,2026-10-01,11:30:00,03:30:00,"kontrola, výkresy",',
    "Stanislav,s@x.cz,,Maringotka,,Elektro,No,2026-10-02,18:00:00,2026-10-02,20:00:00,02:00:00,,",
    "Stanislav,s@x.cz,,,,Bez projektu,No,2026-10-03,09:00:00,2026-10-03,09:00:00,00:00:00,,",
  ].join("\n");
  const r = parseToggl(csv);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 2, "nulová délka se přeskočí");
  assert.equal(r.rows[0].description, "Půdorysy, 1.NP");
  assert.equal(r.rows[0].start, "2026-10-01T06:00:00.000Z");
  assert.deepEqual(r.rows[0].tags, ["kontrola", "výkresy"]);
  assert.equal(slugTag("RD Šenov"), "rd-šenov");
  const { entries, skipped } = togglToEntries(r.rows, { "RD Šenov": "projekce/rd-senov" }, [
    e("2026-10-02T16:00:00.000Z", "2026-10-02T18:00:00.000Z", []),
  ]);
  assert.equal(skipped, 1, "už importované se přeskočí");
  assert.deepEqual(entries[0].tags, ["projekce/rd-senov", "kontrola", "výkresy"]);
  assert.match(parseToggl("a,b\n1,2").error!, /Toggl/);
});
