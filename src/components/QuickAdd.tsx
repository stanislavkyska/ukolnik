"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { dateLabel, todayISO } from "@/lib/dates";
import { parseQuickAdd, type ParsedTask } from "@/lib/parse";
import { matchTags, suggestTags, tagTokenAt, wordAt, type TagUsage } from "@/lib/tags";
import { fmtDuration, parseDuration, parseTimes } from "@/lib/time";
import { Tag, TagSuggest } from "./TagSuggest";

function timerPreview(p: QuickEntry): string {
  const day = p.yesterday ? " včera" : "";
  const dur = p.durationMs ? fmtDuration(p.durationMs) : "";
  if (p.fromTime && p.toTime) return `Zapsat ${p.fromTime}–${p.toTime}${day}`;
  if (p.fromTime && dur) return `Zapsat od ${p.fromTime}, ${dur}${day}`;
  if (p.toTime && dur) return `Zapsat ${dur} do ${p.toTime}${day}`;
  if (dur) return `Zapsat ${dur}${day}`;
  if (p.fromTime) return `Stopky od ${p.fromTime}${day}`;
  return "Chybí začátek nebo délka";
}

export interface QuickAddHandle {
  focus(): void;
}

/** U stopek: délka v textu („2h“) = dopsat hotový záznam místo spuštění */
export type QuickEntry = ParsedTask & { durationMs?: number; yesterday?: boolean; fromTime?: string | null; toTime?: string | null };

interface Props {
  tagUsage: TagUsage[];
  onAdd: (p: QuickEntry) => Promise<void>;
  /** režim stopek: bez termínů, jiný popisek a tlačítko */
  timer?: boolean;
}

export const QuickAdd = forwardRef<QuickAddHandle, Props>(
  function QuickAdd({ tagUsage, onAdd, timer }, ref) {
    const [text, setText] = useState("");
    const [caret, setCaret] = useState(0);
    const [index, setIndex] = useState(0);
    const [closed, setClosed] = useState(false);
    const [busy, setBusy] = useState(false);
    /** uživatel v nabídce šipkou vybral položku (u slov bez # teprve pak Enter vybírá) */
    const [navigated, setNavigated] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

    const hashToken = useMemo(() => tagTokenAt(text, caret), [text, caret]);
    // u stopek našeptávat štítky i ze slov bez # („jaro“ → #mm-rd-jarosek)
    const softToken = useMemo(() => {
      if (!timer || hashToken) return null;
      const w = wordAt(text, caret);
      if (w.word.length < 3 || /\d/.test(w.word) || /^(od|do|včera|vcera)$/i.test(w.word)) return null;
      return { start: w.start, end: w.end, query: w.word };
    }, [timer, hashToken, text, caret]);
    const token = hashToken ?? softToken;
    const soft = !hashToken && !!softToken;
    const known = useMemo(() => tagUsage.map((t) => t.name), [tagUsage]);
    const parsed = useMemo((): QuickEntry | null => {
      if (!text.trim()) return null;
      const p = parseQuickAdd(text, { knownTags: known });
      if (!timer) return p;
      // u stopek se termín nehledá – „pátek“ v názvu zůstane
      const words = text.split(/\s+/).filter((w) => !w.startsWith("#")).join(" ").trim();
      const t = parseTimes(words);
      const d = parseDuration(t.rest);
      return {
        ...p,
        title: d.rest,
        dueDate: null,
        dueTime: null,
        deadline: null,
        important: false,
        durationMs: d.ms,
        yesterday: d.yesterday,
        fromTime: t.from,
        toTime: t.to,
      };
    }, [text, known, timer]);
    const items = useMemo(() => {
      if (!token) return [];
      const already = parsed?.tags.filter((t) => t.toLowerCase() !== token.query.toLowerCase()) ?? [];
      if (soft) return matchTags(token.query, tagUsage, 6, parsed?.tags ?? []);
      return suggestTags(token.query, tagUsage, 6, already);
    }, [token, soft, tagUsage, parsed]);
    const open = !!token && !closed && (soft ? items.length > 0 : items.length > 0 || token.query.length > 0);

    const pick = (name: string) => {
      if (!token) return;
      const before = text.slice(0, token.start);
      const after = text.slice(token.end).replace(/^\s*/, "");
      const next = `${before}#${name} ${after}`;
      const pos = before.length + name.length + 2;
      setText(next);
      setIndex(0);
      setNavigated(false);
      requestAnimationFrame(() => {
        input.current?.setSelectionRange(pos, pos);
        setCaret(pos);
      });
    };

    const submit = async () => {
      if (busy || (!parsed && !timer)) return;
      setBusy(true);
      try {
        await onAdd(parsed ?? { title: "", dueDate: null, dueTime: null, deadline: null, tags: [], important: false });
        setText("");
        setCaret(0);
      } catch {
        // chybu už ukázal rodič – text zůstane k opravě
      } finally {
        setBusy(false);
        input.current?.focus();
      }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (open && items.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (soft && !navigated) setIndex(0);
          else setIndex((i) => (i + 1) % items.length);
          setNavigated(true);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setIndex((i) => (i - 1 + items.length) % items.length);
          setNavigated(true);
          return;
        }
        // u slova bez # Enter odešle text, štítek vybere Tab, šipka + Enter nebo klik
        if (e.key === "Tab" || (e.key === "Enter" && (!soft || navigated))) {
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
        className={timer ? "quick quick-timer" : "quick"}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="quick-field">
          <span className="quick-plus" aria-hidden>
            {timer ? "▶" : "+"}
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sync(e.target);
              setClosed(false);
              setIndex(0);
              setNavigated(false);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => sync(e.currentTarget)}
            onClick={(e) => sync(e.currentTarget)}
            onBlur={() => setClosed(true)}
            onFocus={() => setClosed(false)}
            placeholder={timer ? "Na čem děláš? Nebo dopiš čas: výkresy 2h #projekce" : "Nový úkol… např. faktura Novák v pátek #really"}
            aria-label={timer ? "Spustit stopky" : "Nový úkol"}
            autoComplete="off"
            enterKeyHint="done"
            role="combobox"
            aria-expanded={open}
            aria-controls="quick-suggest"
            aria-activedescendant={open && items.length && (!soft || navigated) ? `quick-suggest-${index}` : undefined}
          />
          <button type="submit" className="quick-add" disabled={timer ? busy : !parsed || busy}>
            {timer ? (parsed?.durationMs || (parsed?.fromTime && parsed?.toTime) ? "Zapsat" : "Spustit") : "Přidat"}
          </button>
        </div>
        {open && <TagSuggest id="quick-suggest" items={items} index={soft && !navigated ? -1 : index} query={soft ? "" : token!.query} onPick={pick} />}
        {parsed && (parsed.dueDate || parsed.dueTime || parsed.deadline || parsed.tags.length > 0 || parsed.important || parsed.durationMs || parsed.fromTime || parsed.toTime) && (
          <div className="quick-preview" aria-live="polite">
            {timer && (parsed.fromTime || parsed.toTime || !!parsed.durationMs) && (
              <span className="pill pill-date">{timerPreview(parsed)}</span>
            )}
            {parsed.dueDate && <span className="pill pill-date">{dateLabel(parsed.dueDate, today, { long: true })}</span>}
            {parsed.dueTime && <span className="pill">{parsed.dueTime}</span>}
            {parsed.deadline && <span className="pill pill-dl">Deadline {dateLabel(parsed.deadline, today, { long: true }).toLowerCase()}</span>}
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
