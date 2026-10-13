"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, startOfWeek, todayISO } from "@/lib/dates";
import { suggestTags, type TagUsage } from "@/lib/tags";
import type { Task, TaskPatch } from "@/lib/types";
import { Tag, TagSuggest } from "./TagSuggest";

export function TagField({ value, onChange, usage }: { value: string[]; onChange: (v: string[]) => void; usage: TagUsage[] }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const items = useMemo(() => suggestTags(q, usage, 6, value), [q, usage, value]);

  const add = (name: string) => {
    const n = name.trim().replace(/^#/, "").toLowerCase();
    if (n && !value.some((v) => v.toLowerCase() === n)) onChange([...value, usage.find((u) => u.name.toLowerCase() === n)?.name ?? n]);
    setQ("");
    setIndex(0);
  };

  return (
    <div className="tagfield">
      <div className="tagfield-box">
        {value.map((t) => (
          <span key={t} className="tag tag-removable">
            <Tag name={t} />
            <button type="button" aria-label={`Odebrat štítek ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value.replace(/\s/g, ""));
            setIndex(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (q) add(q);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && items.length) {
              e.preventDefault();
              setIndex((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp" && items.length) {
              e.preventDefault();
              setIndex((i) => (i - 1 + items.length) % items.length);
            } else if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
              if (!q && e.key !== ",") return;
              e.preventDefault();
              add(items[index]?.name ?? q);
            } else if (e.key === "Backspace" && !q && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length ? "" : "Přidat štítek"}
          aria-label="Přidat štítek"
          role="combobox"
          aria-expanded={focused}
          aria-controls="edit-suggest"
        />
      </div>
      {focused && (items.length > 0 || q) && <TagSuggest id="edit-suggest" items={items} index={index} query={q} onPick={add} />}
    </div>
  );
}

export function EditSheet({
  task,
  usage,
  onSave,
  onDelete,
  onClose,
}: {
  task: Task;
  usage: TagUsage[];
  onSave: (patch: TaskPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [date, setDate] = useState(task.due_date ?? "");
  const [time, setTime] = useState(task.due_time?.slice(0, 5) ?? "");
  const [tags, setTags] = useState(task.tags);
  const [important, setImportant] = useState(task.important);
  const dialog = useRef<HTMLDialogElement>(null);
  const today = todayISO();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onSave({
      title: t,
      notes,
      due_date: date || null,
      due_time: date && time ? time : null,
      tags,
      important,
    });
  };

  const moves: [string, string | null][] = [
    ["Dnes", today],
    ["Zítra", addDays(today, 1)],
    ["Příští týden", addDays(startOfWeek(today), 7)],
    ["Bez termínu", null],
  ];

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Upravit úkol"
    >
      <form
        method="dialog"
        className="sheet-inner"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <textarea
          className="sheet-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          rows={2}
          aria-label="Název úkolu"
        />

        <div className="sheet-moves" role="group" aria-label="Přesunout">
          {moves.map(([label, d]) => (
            <button
              key={label}
              type="button"
              className={(date || null) === d ? "chip is-active" : "chip"}
              onClick={() => {
                setDate(d ?? "");
                if (!d) setTime("");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="sheet-row">
          <label>
            Termín
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Čas
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </label>
        </div>

        <div className="sheet-label">
          <span>Štítky</span>
          <TagField value={tags} onChange={setTags} usage={usage} />
        </div>

        <label className="sheet-label">
          Poznámka
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Kontakt, adresa, podrobnosti…" />
        </label>

        <label className="sheet-check">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Důležité
        </label>

        <div className="sheet-actions">
          <button
            type="button"
            className="btn-ghost danger"
            onClick={() => {
              if (confirm("Smazat úkol?")) onDelete();
            }}
          >
            Smazat
          </button>
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
            Zrušit
          </button>
          <button type="submit" className="btn" disabled={!title.trim()}>
            Uložit
          </button>
        </div>
      </form>
    </dialog>
  );
}
