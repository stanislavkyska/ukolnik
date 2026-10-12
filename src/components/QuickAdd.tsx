"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { dateLabel, todayISO } from "@/lib/dates";
import { parseQuickAdd, type ParsedTask } from "@/lib/parse";
import { suggestTags, tagTokenAt, type TagUsage } from "@/lib/tags";
import { Tag, TagSuggest } from "./TagSuggest";

export interface QuickAddHandle {
  focus(): void;
}

export const QuickAdd = forwardRef<QuickAddHandle, { tagUsage: TagUsage[]; onAdd: (p: ParsedTask) => Promise<void> }>(
  function QuickAdd({ tagUsage, onAdd }, ref) {
    const [text, setText] = useState("");
    const [caret, setCaret] = useState(0);
    const [index, setIndex] = useState(0);
    const [closed, setClosed] = useState(false);
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

    const token = useMemo(() => tagTokenAt(text, caret), [text, caret]);
    const known = useMemo(() => tagUsage.map((t) => t.name), [tagUsage]);
    const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, { knownTags: known }) : null), [text, known]);
    const items = useMemo(() => {
      if (!token) return [];
      const already = parsed?.tags.filter((t) => t.toLowerCase() !== token.query.toLowerCase()) ?? [];
      return suggestTags(token.query, tagUsage, 6, already);
    }, [token, tagUsage, parsed]);
    const open = !!token && !closed && (items.length > 0 || token.query.length > 0);

    const pick = (name: string) => {
      if (!token) return;
      const before = text.slice(0, token.start);
      const after = text.slice(token.end).replace(/^\s*/, "");
      const next = `${before}#${name} ${after}`;
      const pos = before.length + name.length + 2;
      setText(next);
      setIndex(0);
      requestAnimationFrame(() => {
        input.current?.setSelectionRange(pos, pos);
        setCaret(pos);
      });
    };

    const submit = async () => {
      if (!parsed || busy) return;
      setBusy(true);
      try {
        await onAdd(parsed);
        setText("");
        setCaret(0);
      } finally {
        setBusy(false);
        input.current?.focus();
      }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (open && items.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setIndex((i) => (i + 1) % items.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setIndex((i) => (i - 1 + items.length) % items.length);
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          pick(items[Math.min(index, items.length - 1)].name);
          return;
        }
      }
      if (e.key === "Escape") {
        if (open) setClosed(true);
        else input.current?.blur();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };

    const sync = (el: HTMLInputElement) => {
      setCaret(el.selectionStart ?? el.value.length);
    };

    const today = todayISO();

    return (
      <form
        className="quick"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="quick-field">
          <span className="quick-plus" aria-hidden>
            +
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sync(e.target);
              setClosed(false);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => sync(e.currentTarget)}
            onClick={(e) => sync(e.currentTarget)}
            onBlur={() => setClosed(true)}
            onFocus={() => setClosed(false)}
            placeholder="Nový úkol… např. faktura Novák v pátek #really"
            aria-label="Nový úkol"
            autoComplete="off"
            enterKeyHint="done"
            role="combobox"
            aria-expanded={open}
            aria-controls="quick-suggest"
            aria-activedescendant={open && items.length ? `quick-suggest-${index}` : undefined}
          />
          <button type="submit" className="quick-add" disabled={!parsed || busy}>
            Přidat
          </button>
        </div>
        {open && <TagSuggest id="quick-suggest" items={items} index={index} query={token!.query} onPick={pick} />}
        {parsed && (parsed.dueDate || parsed.dueTime || parsed.tags.length > 0 || parsed.important) && (
          <div className="quick-preview" aria-live="polite">
            {parsed.dueDate && <span className="pill pill-date">{dateLabel(parsed.dueDate, today, { long: true })}</span>}
            {parsed.dueTime && <span className="pill">{parsed.dueTime}</span>}
            {parsed.important && <span className="pill pill-imp">Důležité</span>}
            {parsed.tags.map((t) => (
              <Tag key={t} name={t} />
            ))}
          </div>
        )}
      </form>
    );
  },
);
