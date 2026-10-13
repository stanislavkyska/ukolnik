import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIdFor, eventTimeLabel, syncTasks, taskToEvent, toCalEvent, type CalendarPort, type GEvent, type SyncTask } from "../src/lib/gcal.ts";

const now = new Date("2026-10-13T08:00:00Z"); // úterý 10:00 v Praze

function task(over: Partial<SyncTask> = {}): SyncTask {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Faktura Novák",
    notes: "",
    due_date: "2026-10-16",
    due_time: null,
    deadline: null,
    tags: ["really"],
    important: false,
    done: false,
    done_at: null,
    created_at: "2026-10-10T10:00:00Z",
    updated_at: "2026-10-12T10:00:00Z",
    gcal_event_id: null,
    gcal_etag: null,
    gcal_dirty: true,
    ...over,
  };
}

/** Napodobenina Google Kalendáře v paměti */
function fakeCal(initial: GEvent[] = []) {
  const events = new Map(initial.map((e) => [e.id, e]));
  let n = 0;
  const calls: string[] = [];
  const port: CalendarPort = {
    async list() {
      return [...events.values()].filter((e) => e.status !== "cancelled");
    },
    async upsert(id, body) {
      calls.push(`upsert ${id}`);
      const e = { ...body, id, etag: `"e${++n}"`, updated: now.toISOString() } as GEvent;
      events.set(id, e);
      return e;
    },
    async patch(id, body) {
      calls.push(`patch ${id}`);
      const e = { ...events.get(id)!, ...body, etag: `"e${++n}"` } as GEvent;
      events.set(id, e);
      return e;
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      events.delete(id);
    },
  };
  return { port, events, calls };
}

test("nový úkol s datem se zapíše jako celodenní událost", async () => {
  const cal = fakeCal();
  const t = task();
  const r = await syncTasks([t], cal.port, { now });
  assert.equal(r.pushed, 1);
  const ev = cal.events.get(eventIdFor(t.id))!;
  assert.deepEqual(ev.start, { date: "2026-10-16" });
  assert.deepEqual(ev.end, { date: "2026-10-17" });
  assert.equal(ev.summary, "Faktura Novák");
  assert.match(ev.description!, /#really/);
  assert.equal(r.updates[0].patch.gcal_event_id, eventIdFor(t.id));
});

test("úkol s časem je 30minutová událost v pražském čase", () => {
  const e = taskToEvent(task({ due_time: "14:30:00" }));
  assert.equal(e.start.dateTime, "2026-10-16T12:30:00.000Z");
  assert.equal(e.end.dateTime, "2026-10-16T13:00:00.000Z");
});

test("úkol jen s deadlinem má praporek a leží v den deadlinu", () => {
  const e = taskToEvent(task({ due_date: null, deadline: "2026-10-20" }));
  assert.equal(e.summary, "⚑ Faktura Novák");
  assert.deepEqual(e.start, { date: "2026-10-20" });
});

test("přesun události v kalendáři přesune úkol", async () => {
  const t = task({ gcal_dirty: false, gcal_event_id: eventIdFor("11111111-2222-3333-4444-555555555555"), gcal_etag: '"old"' });
  const moved: GEvent = {
    ...taskToEvent(t),
    id: t.gcal_event_id!,
    etag: '"new"',
    updated: "2026-10-13T07:00:00Z",
    start: { dateTime: "2026-10-19T07:00:00Z" },
    end: { dateTime: "2026-10-19T07:30:00Z" },
  };
  const cal = fakeCal([moved]);
  const r = await syncTasks([t], cal.port, { now });
  assert.equal(r.pulled, 1);
  assert.equal(r.updates[0].patch.due_date, "2026-10-19");
  assert.equal(r.updates[0].patch.due_time, "09:00");
  assert.equal(r.updates[0].patch.gcal_etag, '"new"');
  assert.equal(r.updates[0].patch.title, undefined, "název se nezměnil");
  assert.equal(cal.calls.length, 0, "do kalendáře se nic nezapisuje");
});

test("přesun deadline-only události posune deadline", async () => {
  const t = task({ due_date: null, deadline: "2026-10-20", gcal_dirty: false, gcal_event_id: "x", gcal_etag: '"a"' });
  const ev: GEvent = { ...taskToEvent(t), id: "x", etag: '"b"', start: { date: "2026-10-22" }, end: { date: "2026-10-23" } };
  const r = await syncTasks([t], fakeCal([ev]).port, { now });
  assert.equal(r.updates[0].patch.deadline, "2026-10-22");
  assert.equal(r.updates[0].patch.due_date, undefined);
});

test("změna na obou stranách: vyhraje novější", async () => {
  const base = task({ gcal_event_id: "x", gcal_etag: '"a"', gcal_dirty: true, updated_at: "2026-10-13T07:30:00Z" });
  const olderEv: GEvent = { ...taskToEvent(base), id: "x", etag: '"b"', updated: "2026-10-13T07:00:00Z", start: { date: "2026-10-18" }, end: { date: "2026-10-19" } };
  const c1 = fakeCal([olderEv]);
  const r1 = await syncTasks([base], c1.port, { now });
  assert.equal(r1.pushed, 1, "úkol je novější → přepíše kalendář");
  assert.deepEqual(c1.events.get("x")!.start, { date: "2026-10-16" });

  const newerEv = { ...olderEv, updated: "2026-10-13T07:45:00Z" };
  const r2 = await syncTasks([base], fakeCal([newerEv]).port, { now });
  assert.equal(r2.pulled, 1, "kalendář je novější → upraví úkol");
  assert.equal(r2.updates[0].patch.due_date, "2026-10-18");
});

test("hotový úkol a úkol bez data událost smažou", async () => {
  const t = task({ done: true, gcal_event_id: "x", gcal_etag: '"a"' });
  const cal = fakeCal([{ ...taskToEvent(task()), id: "x", etag: '"a"' }]);
  const r = await syncTasks([t], cal.port, { now });
  assert.equal(r.removed, 1);
  assert.equal(cal.events.size, 0);
  assert.equal(r.updates[0].patch.gcal_event_id, null);
});

test("událost smazaná v kalendáři → úkol přijde o datum", async () => {
  const t = task({ gcal_event_id: "x", gcal_etag: '"a"', gcal_dirty: false, due_time: "10:00:00" });
  const r = await syncTasks([t], fakeCal().port, { now });
  assert.equal(r.updates[0].patch.due_date, null);
  assert.equal(r.updates[0].patch.due_time, null);
});

test("úkol smazaný v aplikaci → událost se smaže", async () => {
  const cal = fakeCal([{ ...taskToEvent(task({ id: "gone" })), id: "x", etag: '"a"' }]);
  const r = await syncTasks([], cal.port, { now });
  assert.equal(r.removed, 1);
  assert.equal(cal.events.size, 0);
});

test("nová událost přidaná do kalendáře Úkoly → nový úkol", async () => {
  const ev: GEvent = { id: "manual1", etag: '"m"', summary: "Odvézt dřevo #maringotka", start: { date: "2026-10-15" }, end: { date: "2026-10-16" } };
  const cal = fakeCal([ev]);
  const r = await syncTasks([], cal.port, { now, newId: () => "new-id" });
  assert.equal(r.creates.length, 1);
  assert.deepEqual(r.creates[0], {
    id: "new-id",
    title: "Odvézt dřevo",
    due_date: "2026-10-15",
    due_time: null,
    tags: ["maringotka"],
    gcal_event_id: "manual1",
    gcal_etag: r.creates[0].gcal_etag,
    gcal_synced_at: now.toISOString(),
  });
  assert.equal(cal.events.get("manual1")!.extendedProperties!.private!.ukolnikTaskId, "new-id");
});

test("beze změn se nic neděje", async () => {
  const t = task();
  const cal = fakeCal();
  const r1 = await syncTasks([t], cal.port, { now });
  const synced = { ...t, ...r1.updates[0].patch, gcal_dirty: false } as SyncTask;
  const r2 = await syncTasks([synced], cal.port, { now });
  assert.equal(r2.updates.length, 0);
  assert.equal(cal.calls.length, 1);
});

test("vypnutý zápis úkolů: existující události se uklidí, nové nevznikají", async () => {
  const t = task({ gcal_event_id: "x", gcal_etag: '"a"', gcal_dirty: true });
  const cal = fakeCal([{ ...taskToEvent(t), id: "x", etag: '"a"' }]);
  const r = await syncTasks([t, task({ id: "22222222-2222-3333-4444-555555555555" })], cal.port, { now, write: false });
  assert.equal(r.removed, 1);
  assert.equal(r.pushed, 0);
});

test("zobrazení událostí: vícedenní a časové", () => {
  const cal = { id: "rodina", name: "Rodina", color: "#f00" };
  const trip = toCalEvent({ id: "a", summary: "Dovolená #rodina", start: { date: "2026-10-12" }, end: { date: "2026-10-15" } }, cal, "2026-10-13", "2026-10-26");
  assert.deepEqual(trip.days, ["2026-10-13", "2026-10-14"]);
  assert.deepEqual(trip.tags, ["rodina"]);
  assert.equal(trip.title, "Dovolená");
  const mtg = toCalEvent(
    { id: "b", summary: "Zubař", start: { dateTime: "2026-10-14T07:00:00Z" }, end: { dateTime: "2026-10-14T08:00:00Z" } },
    cal,
    "2026-10-13",
    "2026-10-26",
  );
  assert.deepEqual(mtg.days, ["2026-10-14"]);
  assert.equal(eventTimeLabel(mtg, "2026-10-14"), "09:00–10:00");
});
