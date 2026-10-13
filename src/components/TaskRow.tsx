"use client";

import { dateLabel } from "@/lib/dates";
import { timeLabel } from "@/lib/plan";
import type { Task } from "@/lib/types";
import { Tag } from "./TagSuggest";

export function TaskRow({
  task,
  today,
  showDate,
  onToggle,
  onOpen,
  onTag,
  onTimer,
  timing,
}: {
  task: Task;
  today: string;
  showDate?: boolean;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
  onTag?: (tag: string) => void;
  /** spustit / zastavit stopky na tomto úkolu */
  onTimer?: (t: Task) => void;
  /** na tomto úkolu právě běží stopky */
  timing?: boolean;
}) {
  const overdue = !task.done && task.due_date && task.due_date < today;
  return (
    <li
      className={`row${task.done ? " is-done" : ""}${task.important ? " is-imp" : ""}${onTimer && !task.done ? " has-timer" : ""}`}
      draggable={!task.done}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <button
        type="button"
        className="check"
        onClick={() => onToggle(task)}
        aria-label={task.done ? `Vrátit: ${task.title}` : `Hotovo: ${task.title}`}
        aria-pressed={task.done}
      >
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M5 10.5l3.2 3.2L15 7" />
        </svg>
      </button>
      <button type="button" className="row-body" onClick={() => onOpen(task)}>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          {task.due_time && <span className="row-time">{timeLabel(task.due_time)}</span>}
          {showDate && task.due_date && (
            <span className={overdue ? "row-date is-late" : "row-date"}>{dateLabel(task.due_date, today)}</span>
          )}
          {task.notes && <span className="row-note">poznámka</span>}
        </span>
      </button>
      {onTimer && !task.done && (
        <button
          type="button"
          className={timing ? "row-timer is-on" : "row-timer"}
          onClick={() => onTimer(task)}
          aria-label={timing ? `Zastavit stopky: ${task.title}` : `Spustit stopky: ${task.title}`}
          title={timing ? "Zastavit stopky" : "Spustit stopky"}
        >
          {timing ? <span className="sq" aria-hidden /> : "▶"}
        </button>
      )}
      {task.tags.length > 0 && (
        <span className="row-tags">
          {task.tags.map((t) => (
            <Tag key={t} name={t} onClick={onTag ? () => onTag(t) : undefined} />
          ))}
        </span>
      )}
    </li>
  );
}
