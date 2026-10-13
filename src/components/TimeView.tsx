"use client";

import { useEffect, useMemo, useState } from "react";
import { dateLabel } from "@/lib/dates";
import { normalize } from "@/lib/text";
import { tagHue } from "@/lib/tags";
import {
  durationMs,
  fmtDuration,
  groupByDay,
  inRange,
  localTime,
  rangeDates,
  toCSV,
  totalsByTag,
  type RangeKey,
  type TimeEntry,
} from "@/lib/time";
import { Tag } from "./TagSuggest";

const RANGES: [RangeKey, string][] = [
  ["today", "Dnes"],
  ["week", "Týden"],
  ["month", "Měsíc"],
];

export function TimeView({
  entries,
  today,
  onOpen,
  onRestart,
  onAdd,
  onStop,
}: {
  entries: TimeEntry[];
  today: string;
  onOpen: (e: TimeEntry) => void;
  onRestart: (e: TimeEntry) => void;
  onAdd: () => void;
  onStop: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("week");
  const [tag, setTag] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasRunning = entries.some((e) => !e.ended_at);

  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [hasRunning]);

  const { from, to } = rangeDates(range, today);
  const inPeriod = useMemo(() => entries.filter((e) => inRange(e, from, to)), [entries, from, to]);
  const summary = useMemo(() => totalsByTag(inPeriod, now), [inPeriod, now]);
  const shown = useMemo(() => {
    if (tag === null) return inPeriod;
    if (tag === "") return inPeriod.filter((e) => !e.tags.length);
    const t = normalize(tag);
    return inPeriod.filter((e) => e.tags.some((g) => normalize(g) === t || normalize(g).startsWith(t + "/")));
  }, [inPeriod, tag]);
  const days = groupByDay(shown);
  const max = Math.max(1, ...summary.tags.map((t) => t.ms));

  const exportCSV = () => {
    const blob = new Blob([toCSV(shown)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cas_${from}_${to}${tag ? "_" + tag.replace(/\//g, "-") : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const bar = (t: { tag: string; ms: number }, child = false) => (
    <li key={t.tag || "-"} className={child ? "tt-row is-child" : "tt-row"}>
      <button type="button" className={tag === t.tag ? "tt-btn is-active" : "tt-btn"} onClick={() => setTag((x) => (x === t.tag ? null : t.tag))} aria-pressed={tag === t.tag}>
        <span className="tt-name">{t.tag ? (child ? t.tag.split("/").slice(1).join("/") : t.tag) : "bez štítku"}</span>
        <span className="tt-bar" aria-hidden>
          <span style={{ width: `${(t.ms / max) * 100}%`, ["--h" as string]: t.tag ? tagHue(t.tag.split("/")[0]) : 0 }} className={t.tag ? "" : "is-none"} />
        </span>
        <span className="tt-val">{fmtDuration(t.ms)}</span>
      </button>
    </li>
  );

  return (
    <div className="timeview">
      <div className="tv-head">
        <div className="seg" role="group" aria-label="Období">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" className={range === k ? "is-active" : undefined} aria-pressed={range === k} onClick={() => setRange(k)}>
              {label}
            </button>
          ))}
        </div>
        <p className="tv-total">
          <span className="tv-total-num">{fmtDuration(summary.total)}</span>
          <span className="tv-total-label">{range === "today" ? "dnes" : range === "week" ? "tento týden" : "tento měsíc"}</span>
        </p>
      </div>

      {summary.tags.length > 0 ? (
        <ul className="tt">
          {summary.tags.flatMap((t) => [bar(t), ...t.children.map((c) => bar(c, true))])}
        </ul>
      ) : (
        <p className="empty">Za tohle období žádný změřený čas. Spusť stopky v poli dole, nebo u úkolu tlačítkem ▶.</p>
      )}

      <div className="tv-actions">
        <button type="button" className="btn-ghost small" onClick={onAdd}>
          Přidat záznam ručně
        </button>
        {shown.some((e) => e.ended_at) && (
          <button type="button" className="btn-ghost small" onClick={exportCSV}>
            Stáhnout CSV{tag !== null ? ` (${tag || "bez štítku"})` : ""}
          </button>
        )}
        {tag !== null && (
          <button type="button" className="filters-clear" onClick={() => setTag(null)}>
            Zrušit filtr
          </button>
        )}
      </div>

      {days.map((d) => (
        <section key={d.date} className="group">
          <div className="group-head">
            <h2>{dateLabel(d.date, today, { long: true })}</h2>
            <span className="group-sum">{fmtDuration(d.entries.reduce((s, e) => s + durationMs(e, now), 0))}</span>
          </div>
          <ul>
            {d.entries.map((e) => (
              <li key={e.id} className={e.ended_at ? "trow" : "trow is-running"}>
                <button type="button" className="trow-body" onClick={() => onOpen(e)}>
                  <span className="trow-time">
                    {localTime(e.started_at)}–{e.ended_at ? localTime(e.ended_at) : "teď"}
                  </span>
                  <span className="trow-title">{e.title || <i>Bez názvu</i>}</span>
                  <span className="trow-dur">{fmtDuration(durationMs(e, now))}</span>
                </button>
                {e.tags.length > 0 && (
                  <span className="row-tags trow-tags">
                    {e.tags.map((t) => (
                      <Tag key={t} name={t} />
                    ))}
                  </span>
                )}
                {e.ended_at ? (
                  <button type="button" className="trow-again" onClick={() => onRestart(e)} aria-label={`Pokračovat: ${e.title || "bez názvu"}`} title="Pokračovat">
                    ▶
                  </button>
                ) : (
                  <button type="button" className="trow-again is-on" onClick={onStop} aria-label="Zastavit stopky" title="Zastavit">
                    <span className="sq" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
