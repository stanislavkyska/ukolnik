"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, dateLabel, startOfWeek, weekday } from "@/lib/dates";
import { suggestTags, tagHue, type TagUsage } from "@/lib/tags";
import { normalize } from "@/lib/text";
import { hm } from "@/lib/goals";
import type { TimeEntry } from "@/lib/time";
import {
  buildSheet,
  cellText,
  favorites,
  isWeekend,
  NO_TAG,
  parseCell,
  parseToggl,
  planCell,
  slugTag,
  togglToEntries,
  type CellPlan,
  type Favorite,
  type TogglRow,
} from "@/lib/timesheet";
import { TagDot } from "./TagSuggest";

/* ---------- Rychlý start ---------- */

export function QuickStart({
  entries,
  running,
  onStart,
}: {
  entries: TimeEntry[];
  running: TimeEntry | null;
  onStart: (f: Favorite) => void;
}) {
  const favs = useMemo(() => favorites(entries), [entries]);
  if (!favs.length) return null;
  const isRunning = (f: Favorite) =>
    !!running && normalize(running.title) === normalize(f.title) && running.tags.map(normalize).sort().join() === f.tags.map(normalize).sort().join();
  return (
    <div className="qs" role="group" aria-label="Rychlý start stopek">
      {favs.map((f) => {
        const on = isRunning(f);
        return (
          <button
            key={f.title + f.tags.join()}
            type="button"
            className={on ? "qs-btn is-on" : "qs-btn"}
            onClick={() => !on && onStart(f)}
            aria-pressed={on}
            title={on ? "Právě běží" : "Spustit stopky"}
            style={f.tags[0] ? { ["--h" as string]: tagHue(f.tags[0].split("/")[0]) } : undefined}
          >
            <span className="qs-play" aria-hidden>
              {on ? "●" : "▶"}
            </span>
            <span className="qs-text">
              <span className="qs-title">{f.title || f.tags[0]}</span>
              {f.title && f.tags.length > 0 && <span className="qs-tag">{f.tags.join(" ")}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Týdenní výkaz ---------- */

const DAY_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export function WeekSheet({
  entries,
  today,
  usage,
  onApply,
  oldest,
}: {
  entries: TimeEntry[];
  today: string;
  usage: TagUsage[];
  onApply: (plan: CellPlan) => Promise<void>;
  /** nejstarší načtený den – starší týdny nejde upravovat */
  oldest: string;
}) {
  const [week, setWeek] = useState(() => startOfWeek(today));
  const [extra, setExtra] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ tag: string; day: string; text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const committing = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const sheet = useMemo(() => buildSheet(entries, week, extra, now), [entries, week, extra, now]);
  const sugg = useMemo(() => (adding ? suggestTags(adding, usage, 5, sheet.rows.map((r) => r.tag)) : []), [adding, usage, sheet.rows]);
  const canPrev = addDays(week, -1) >= oldest;
  const thisWeek = startOfWeek(today);

  const commit = async () => {
    // Enter i následný blur by jinak zapsaly změnu dvakrát
    if (!editing || committing.current) return;
    const ms = parseCell(editing.text);
    if (ms === null) {
      setEditing({ ...editing, error: true });
      return;
    }
    committing.current = true;
    setBusy(true);
    try {
      await onApply(planCell(entries, editing.tag, editing.day, ms, now));
      setEditing(null);
    } finally {
      setBusy(false);
      committing.current = false;
    }
  };

  const addRow = (tag: string) => {
    const t = tag.trim().replace(/^#/, "").toLowerCase();
    if (t && !sheet.rows.some((r) => normalize(r.tag) === normalize(t))) setExtra((x) => [...x, t]);
    setAdding("");
  };

  return (
    <div className="ws">
      <div className="ws-nav">
        <button type="button" className="btn-ghost small" onClick={() => setWeek(addDays(week, -7))} disabled={!canPrev} aria-label="Předchozí týden">
          ‹
        </button>
        <span className="ws-week">
          {week === thisWeek ? "Tento týden" : `${dateLabel(week, today)} – ${dateLabel(addDays(week, 6), today)}`}
        </span>
        <button type="button" className="btn-ghost small" onClick={() => setWeek(addDays(week, 7))} disabled={week >= thisWeek} aria-label="Další týden">
          ›
        </button>
        <span className="ws-total">{hm(sheet.total)}</span>
      </div>

      <div className="ws-scroll">
        <table className="ws-table">
          <thead>
            <tr>
              <th scope="col" className="ws-tagcol">
                Projekt
              </th>
              {sheet.days.map((d, i) => (
                <th key={d} scope="col" className={`${isWeekend(d) ? "is-we" : ""}${d === today ? " is-today" : ""}`}>
                  {DAY_SHORT[i]}
                  <small>{Number(d.slice(8))}.</small>
                </th>
              ))}
              <th scope="col">Σ</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.tag || "-"}>
                <th scope="row" className="ws-tagcol">
                  {r.tag ? (
                    <>
                      <TagDot name={r.tag} />
                      {r.tag}
                    </>
                  ) : (
                    <i>bez štítku</i>
                  )}
                </th>
                {sheet.days.map((d, i) => {
                  const ed = editing && editing.tag === r.tag && editing.day === d;
                  const future = d > today;
                  const tooOld = d < oldest;
                  return (
                    <td key={d} className={`${isWeekend(d) ? "is-we" : ""}${d === today ? " is-today" : ""}`}>
                      {ed ? (
                        <input
                          autoFocus
                          className={editing.error ? "ws-in is-err" : "ws-in"}
                          value={editing.text}
                          disabled={busy}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value, error: false })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          onBlur={commit}
                          aria-label={`${r.tag || "bez štítku"}, ${DAY_SHORT[i]}`}
                          title="např. 1:30, 1,5 nebo 90m; prázdné = smazat"
                        />
                      ) : (
                        <button
                          type="button"
                          className="ws-cell"
                          disabled={future || tooOld || r.running[i]}
                          onClick={() => setEditing({ tag: r.tag, day: d, text: cellText(r.cells[i]) })}
                          title={r.running[i] ? "Běží stopky – uprav je v záznamech" : future ? "Budoucí den" : "Upravit hodiny"}
                        >
                          {cellText(r.cells[i]) || <span className="ws-empty">·</span>}
                          {r.running[i] && <span className="ws-run" aria-label="běží" />}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="ws-sum">{cellText(r.total)}</td>
              </tr>
            ))}
            <tr className="ws-totals">
              <th scope="row" className="ws-tagcol">
                Celkem
              </th>
              {sheet.dayTotals.map((t, i) => (
                <td key={i}>{cellText(t)}</td>
              ))}
              <td className="ws-sum">{cellText(sheet.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        className="ws-add"
        onSubmit={(e) => {
          e.preventDefault();
          addRow(sugg[0]?.name ?? adding);
        }}
      >
        <input value={adding} onChange={(e) => setAdding(e.target.value.replace(/\s/g, ""))} placeholder="Přidat projekt, např. projekce/rd-senov" aria-label="Přidat řádek" list="ws-tags" />
        <datalist id="ws-tags">
          {sugg.map((t) => (
            <option key={t.name} value={t.name} />
          ))}
        </datalist>
        <button type="submit" className="btn-ghost small" disabled={!adding.trim()}>
          Přidat řádek
        </button>
      </form>
      <p className="sheet-hint">Klikni do buňky a napiš hodiny (1:30, 1,5 nebo 90m). Přidaný čas se zapíše jako záznam navazující na poslední práci dne, ubraný se odečte od nejpozdějších záznamů.</p>
    </div>
  );
}

/* ---------- Import z Togglu ---------- */

export function TogglImport({
  existing,
  onImport,
  onClose,
}: {
  existing: TimeEntry[];
  onImport: (list: ReturnType<typeof togglToEntries>["entries"]) => Promise<number>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<TogglRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState("");
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const projects = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.project, (m.get(r.project) ?? 0) + (Date.parse(r.end) - Date.parse(r.start)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const tagFor = (p: string) => map[p] ?? (p ? (prefix ? `${slugTag(prefix)}/` : "") + slugTag(p) : "");
  const preview = useMemo(
    () => togglToEntries(rows, Object.fromEntries(projects.map(([p]) => [p, tagFor(p)])), existing),
    [rows, projects, map, prefix, existing],
  );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = parseToggl(await f.text());
    setRows(r.rows);
    setError(r.error);
    setMap({});
    setDone(null);
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Import z Togglu"
    >
      <div className="sheet-inner">
        <h2 className="sheet-h">Import z Togglu</h2>
        <p className="sheet-text">
          V Togglu otevři <b>Reports → Detailed</b>, nastav období (třeba celý rok), vpravo nahoře <b>Export → CSV</b> a soubor sem nahraj.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} aria-label="CSV soubor z Togglu" />
        {error && <p className="sheet-text warn">{error}</p>}

        {rows.length > 0 && (
          <>
            <label className="sheet-label">
              Předpona štítku pro projekty (nepovinné)
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="např. projekce → projekce/rd-šenov" className="ti-in" />
            </label>
            <div className="ti-map">
              <div className="ti-head">
                <span>Projekt v Togglu</span>
                <span>Štítek v úkolníku</span>
              </div>
              {projects.map(([p, ms]) => (
                <label key={p || "-"} className="ti-row">
                  <span>
                    {p || <i>bez projektu</i>} <small>{hm(ms)}</small>
                  </span>
                  <input value={tagFor(p)} onChange={(e) => setMap((m) => ({ ...m, [p]: e.target.value.replace(/\s/g, "").toLowerCase() }))} placeholder="bez štítku" className="ti-in" />
                </label>
              ))}
            </div>
            <p className="sheet-hint">
              Naimportuje se {preview.entries.length} záznamů{preview.skipped ? `, ${preview.skipped} už v úkolníku je a přeskočí se` : ""}. Štítky z Togglu se přidají
              také.
            </p>
          </>
        )}
        {done && <p className="sheet-text">{done}</p>}

        <div className="sheet-actions">
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
            {done ? "Hotovo" : "Zrušit"}
          </button>
          {!done && (
            <button
              type="button"
              className="btn"
              disabled={!preview.entries.length || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const n = await onImport(preview.entries);
                  setDone(`Importováno ${n} záznamů.`);
                  setRows([]);
                } catch {
                  setError("Import se nepovedl. Zkus to znovu.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Importuji…" : `Importovat ${preview.entries.length}`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function weekdayShort(d: string) {
  return DAY_SHORT[weekday(d) - 1];
}
