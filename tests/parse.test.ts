import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "../src/lib/parse.ts";
import { suggestTags, tagTokenAt, countTags } from "../src/lib/tags.ts";

// pondělí 12. 10. 2026, 9:00 v Praze
const now = new Date("2026-10-12T07:00:00Z");
const p = (s: string, knownTags: string[] = []) => parseQuickAdd(s, { now, knownTags });

test("relativní dny", () => {
  assert.equal(p("zavolat Novákovi zítra").dueDate, "2026-10-13");
  assert.equal(p("zavolat Novákovi zítra").title, "zavolat Novákovi");
  assert.equal(p("dnes nakoupit").dueDate, "2026-10-12");
  assert.equal(p("pozítří servis auta").dueDate, "2026-10-14");
  assert.equal(p("pozitri servis auta").dueDate, "2026-10-14");
});

test("dny v týdnu včetně skloňování a předložek", () => {
  const r = p("faktura Novák v pátek");
  assert.equal(r.dueDate, "2026-10-16");
  assert.equal(r.title, "faktura Novák");
  assert.equal(p("odevzdat výkresy do pátku").deadline, "2026-10-16");
  assert.equal(p("odevzdat výkresy do pátku").dueDate, null);
  assert.equal(p("odevzdat výkresy do pátku").title, "odevzdat výkresy");
  assert.equal(p("ve středu focení").dueDate, "2026-10-14");
  assert.equal(p("pondělí porada").dueDate, "2026-10-19", "dnes je pondělí → příští");
  assert.equal(p("čt revize").dueDate, "2026-10-15");
  assert.equal(p("v ne oběd u našich").dueDate, "2026-10-18");
});

test("zkratky, které jsou běžná slova, bez předložky nemění datum", () => {
  const r = p("zavolat po obědě");
  assert.equal(r.dueDate, null);
  assert.equal(r.title, "zavolat po obědě");
  assert.equal(p("ne nic").dueDate, null);
});

test("příští týden / příští pátek / za X", () => {
  assert.equal(p("příští týden objednat dřevo").dueDate, "2026-10-19");
  assert.equal(p("příští pátek výplata").dueDate, "2026-10-23");
  assert.equal(p("za 3 dny kontrola").dueDate, "2026-10-15");
  assert.equal(p("za týden kontrola").dueDate, "2026-10-19");
  assert.equal(p("za 2 týdny kontrola").dueDate, "2026-10-26");
  assert.equal(p("za měsíc STK").dueDate, "2026-11-12");
});

test("absolutní data", () => {
  assert.equal(p("daně 15.10.").dueDate, "2026-10-15");
  assert.equal(p("daně 15. 10.").dueDate, "2026-10-15");
  assert.equal(p("daně 15. 10. 2027").dueDate, "2027-10-15");
  assert.equal(p("daně do 1.3.").deadline, "2027-03-01", "bez roku a v minulosti → příští rok");
  assert.equal(p("daně do 1.3.").title, "daně");
  assert.equal(p("nesmysl 31.2.").dueDate, null);
});

test("čas", () => {
  const r = p("schůzka s makléřem zítra ve 14:30");
  assert.equal(r.dueDate, "2026-10-13");
  assert.equal(r.dueTime, "14:30");
  assert.equal(r.title, "schůzka s makléřem");
  assert.equal(p("focení 9h").dueTime, "09:00");
  assert.equal(p("focení v 9.30").dueTime, "09:30");
});

test("štítky a důležitost", () => {
  const r = p("poslat fotky Novákovi zítra #really #Klient ! ");
  assert.deepEqual(r.tags, ["really", "klient"]);
  assert.equal(r.important, true);
  assert.equal(r.title, "poslat fotky Novákovi");
  // existující štítek s diakritikou se použije, i když napíšu bez ní
  assert.deepEqual(p("výkres #kancelar", ["kancelář"]).tags, ["kancelář"]);
});

test("prázdný název po vytažení zůstane původní text", () => {
  assert.equal(p("zítra").title, "zítra");
});

test("našeptávač štítků", () => {
  const usage = [
    { name: "really", count: 10 },
    { name: "realitka-novak", count: 2 },
    { name: "kancelář", count: 7 },
    { name: "maringotka", count: 3 },
    { name: "domácnost", count: 4 },
  ];
  assert.deepEqual(suggestTags("rea", usage).map((t) => t.name), ["really", "realitka-novak"]);
  assert.equal(suggestTags("kanc", usage)[0].name, "kancelář");
  assert.equal(suggestTags("kanelar", usage)[0].name, "kancelář", "vynechané písmeno uprostřed");
  assert.equal(suggestTags("xyz", usage).length, 0, "nic podobného");
  assert.equal(suggestTags("marig", usage)[0].name, "maringotka");
  assert.equal(suggestTags("mrng", usage)[0].name, "maringotka", "vynechaná písmena");
  assert.equal(suggestTags("rwal", usage)[0].name, "really", "překlep");
  assert.equal(suggestTags("novak", usage)[0].name, "realitka-novak", "část za pomlčkou");
  assert.equal(suggestTags("", usage)[0].name, "really", "prázdné = nejpoužívanější");
  assert.deepEqual(suggestTags("really", usage).map((t) => t.name), [], "celé napsané se nenabízí");
  assert.ok(!suggestTags("", usage, 6, ["really"]).some((t) => t.name === "really"));
});

test("token štítku pod kurzorem", () => {
  assert.deepEqual(tagTokenAt("faktura #rea", 12), { start: 8, end: 12, query: "rea" });
  assert.equal(tagTokenAt("faktura rea", 11), null);
});

test("počítání štítků sloučí varianty bez diakritiky", () => {
  const c = countTags([["kancelář"], ["kancelar", "really"], ["really"]]);
  assert.equal(c.length, 2);
  assert.equal(c.find((t) => t.name === "kancelář")?.count, 2);
});

test("deadline vs. kdy na tom dělat", () => {
  const r = p("faktura Novák ve středu do pátku #really");
  assert.equal(r.dueDate, "2026-10-14");
  assert.equal(r.deadline, "2026-10-16");
  assert.equal(r.title, "faktura Novák");
  assert.equal(p("stavební povolení deadline 30.10.").deadline, "2026-10-30");
  assert.equal(p("stavební povolení deadline 30.10.").title, "stavební povolení");
  assert.equal(p("přiznání nejpozději 15. 10.").deadline, "2026-10-15");
  assert.equal(p("výkresy do ne").deadline, "2026-10-18");
  assert.equal(p("zavolat zítra").deadline, null);
});
