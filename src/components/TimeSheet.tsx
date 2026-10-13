"use client";

import { useEffect, useRef, useState } from "react";
import type { TagUsage } from "@/lib/tags";
import { durationMs, fmtDuration, localDate, localTime, localToISO, type TimeEntry, type TimeEntryPatch } from "@/lib/time";
import { addDays, todayISO } from "@/lib/dates";
import { TagField } from "./EditSheet";

/** Úprava nebo ruční přidání záznamu času. entry = null → nový záznam. */
export function TimeSheet({
  entry,
  usage,
  onSave,
  onDelete,
  onClose,
}: {
  entry: TimeEntry | null;
  usage: TagUsage[];
  onSave: (patch: Required<Pick<TimeEntryPatch, "title" | "tags" | "started_at" | "ended_at">>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const running = !!entry && !entry.ended_at;
  const now = new Date().toISOString();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [tags, setTags] = useState(entry?.tags ?? []);
  const [date, setDate] = useState(entry ? localDate(entry.started_at) : todayISO());
  const [from, setFrom] = useState(entry ? localTime(entry.started_at) : localTime(new Date(Date.now() - 3600000).toISOString()));
  const [to, setTo] = useState(entry?.ended_at ? localTime(entry.ended_at) : running ? "" : localTime(now));
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const startISO = date && from ? localToISO(date, from) : null;
  // konec před začátkem = přes půlnoc → následující den
  let endISO: string | null = null;
  if (date && to) {
    endISO = localToISO(date, to);
    if (startISO && endISO < startISO) endISO = localToISO(addDays(date, 1), to);
  }
  const valid = !!startISO && (running ? true : !!endISO) && (!endISO || endISO >= startISO!) && (!endISO || endISO <= new Date(Date.now() + 60000).toISOString());
  const preview = startISO ? fmtDuration(durationMs({ started_at: startISO, ended_at: endISO })) : "";

  const save = () => {
    if (!valid) return;
    onSave({ title: title.trim(), tags, started_at: startISO!, ended_at: endISO });
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label={entry ? "Upravit záznam času" : "Přidat záznam času"}
    >
      <form
        method="dialog"
        className="sheet-inner"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          className="sheet-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Na čem jsi dělal"
          aria-label="Činnost"
        />

        <div className="sheet-row sheet-row-3">
          <label>
            Den
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
          </label>
          <label>
            Od
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Do
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} placeholder={running ? "běží" : ""} />
          </label>
        </div>
        <p className="sheet-hint">
          {running && !to ? `Stopky běží · zatím ${preview}` : valid ? `Celkem ${preview}` : "Konec musí být po začátku a ne v budoucnu."}
        </p>

        <div className="sheet-label">
          <span>Štítky</span>
          <TagField value={tags} onChange={setTags} usage={usage} />
        </div>

        <div className="sheet-actions">
          {onDelete && (
            <button
              type="button"
              className="btn-ghost danger"
              onClick={() => {
                if (confirm("Smazat záznam?")) onDelete();
              }}
            >
              Smazat
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
            Zrušit
          </button>
          <button type="submit" className="btn" disabled={!valid}>
            Uložit
          </button>
        </div>
      </form>
    </dialog>
  );
}
