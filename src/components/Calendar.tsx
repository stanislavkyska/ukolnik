"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, todayISO } from "@/lib/dates";
import { eventTimeLabel, type CalEvent } from "@/lib/gcal";
import { normalize } from "@/lib/text";
import { Tag } from "./TagSuggest";

interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  shown: boolean;
  isTasks: boolean;
  primary: boolean;
}

export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  writeTasks?: boolean;
  lastSync?: string | null;
  calendars?: CalendarInfo[];
  reconnect?: boolean;
  error?: string;
}

const DAYS_AHEAD = 14;
const EVENTS_REFRESH_MS = 10 * 60 * 1000;

/** Stav kalendáře: připojení, události a synchronizace úkolů. */
export function useCalendar(enabled: boolean, onTasksChanged: () => void) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncing$ = useRef(false);
  const again = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const changedRef = useRef(onTasksChanged);
  changedRef.current = onTasksChanged;

  const loadStatus = useCallback(async () => {
    if (!enabled) return null;
    try {
      const res = await fetch("/api/calendar/status", { cache: "no-store" });
      const j = (await res.json()) as CalendarStatus;
      if (res.status === 409) {
        const s = { configured: true, connected: true, reconnect: true, error: j.error };
        setStatus(s);
        return s;
      }
      setStatus(j);
      return j;
    } catch {
      return null;
    }
  }, [enabled]);

  const loadEvents = useCallback(async () => {
    const today = todayISO();
    try {
      const res = await fetch(`/api/calendar/events?from=${today}&to=${addDays(today, DAYS_AHEAD)}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) {
        setEvents(j.events ?? []);
        setLastError(null);
      } else {
        setLastError(j.error ?? "Události se nepodařilo načíst.");
        if (j.reconnect) setStatus((s) => (s ? { ...s, reconnect: true } : s));
      }
    } catch {
      setLastError("Události se nepodařilo načíst.");
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing$.current) {
      again.current = true;
      return;
    }
    syncing$.current = true;
    setSyncing(true);
    try {
      for (let round = 0; round < 10; round++) {
        again.current = false;
        const res = await fetch("/api/calendar/sync", { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          setLastError(j.error ?? "Synchronizace se nepovedla.");
          if (j.reconnect) setStatus((s) => (s ? { ...s, reconnect: true } : s));
          break;
        }
        setLastError(null);
        if (j.changed) changedRef.current();
        if (!j.more && !again.current) break;
      }
      setStatus((s) => (s ? { ...s, lastSync: new Date().toISOString() } : s));
    } catch {
      setLastError("Synchronizace se nepovedla.");
    } finally {
      syncing$.current = false;
      setSyncing(false);
    }
  }, []);

  const connected = !!status?.connected && !status.reconnect;

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!connected) return;
    loadEvents();
    sync();
    const t = setInterval(loadEvents, EVENTS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadEvents();
        sync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, loadEvents, sync]);

  /** po změně úkolu – zapsat do kalendáře s malým zpožděním (více změn najednou) */
  const requestSync = useCallback(() => {
    if (!connected) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(sync, 2500);
  }, [connected, sync]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) for (const d of e.days) m.set(d, [...(m.get(d) ?? []), e]);
    for (const list of m.values()) list.sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.start < b.start ? -1 : 1));
    return m;
  }, [events]);

  const saveSettings = async (patch: { show_calendars?: string[]; write_tasks?: boolean }) => {
    await fetch("/api/calendar/settings", { method: "POST", body: JSON.stringify(patch), headers: { "Content-Type": "application/json" } });
    await loadStatus();
    await loadEvents();
    if (patch.write_tasks !== undefined) sync();
  };

  const disconnect = async () => {
    await fetch("/api/calendar/disconnect", { method: "POST" });
    setEvents([]);
    await loadStatus();
  };

  return { status, events, byDay, connected, syncing, lastError, sync, requestSync, saveSettings, disconnect, loadStatus };
}

export type CalendarState = ReturnType<typeof useCalendar>;

export function filterEvents(list: CalEvent[] | undefined, tag: string | null): CalEvent[] {
  if (!list) return [];
  if (!tag) return list;
  const t = normalize(tag);
  return list.filter((e) => e.tags.some((g) => normalize(g) === t || normalize(g).startsWith(t + "/")));
}

export function EventList({
  events,
  day,
  onTag,
  onLog,
  isLogged,
}: {
  events: CalEvent[];
  day: string;
  onTag?: (t: string) => void;
  /** zapsat událost jako odpracovaný čas */
  onLog?: (e: CalEvent) => void;
  isLogged?: (e: CalEvent) => boolean;
}) {
  if (!events.length) return null;
  const nowMs = Date.now();
  return (
    <ul className="evs">
      {events.map((e) => (
        <li key={`${e.calendarId}:${e.id}`} className="ev" style={{ ["--cal" as string]: e.color }}>
          <a className="ev-body" href={e.link ?? undefined} target="_blank" rel="noreferrer" title={`${e.calendar} – otevřít v Google Kalendáři`}>
            <span className="ev-time">{eventTimeLabel(e, day)}</span>
            <span className="ev-title">{e.title}</span>
            <span className="ev-cal">
              {e.calendar}
              {e.location ? ` · ${e.location}` : ""}
            </span>
          </a>
          {onLog && !e.allDay && Date.parse(e.start) <= nowMs && (
            isLogged?.(e) ? (
              <span className="ev-logged" title="Už zapsáno v čase">✓ zapsáno</span>
            ) : (
              <button type="button" className="ev-log" onClick={() => onLog(e)} title="Zapsat jako odpracovaný čas">
                ⏱ Zapsat
              </button>
            )
          )}
          {e.tags.length > 0 && (
            <span className="row-tags ev-tags">
              {e.tags.map((t) => (
                <Tag key={t} name={t} onClick={onTag ? () => onTag(t) : undefined} />
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CalendarSheet({ cal, onClose }: { cal: CalendarState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const s = cal.status;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    cal.loadStatus();
  }, []);

  const toggleCal = async (id: string) => {
    if (!s?.calendars) return;
    const shown = s.calendars.filter((c) => !c.isTasks && (c.id === id ? !c.shown : c.shown)).map((c) => c.id);
    setBusy(true);
    await cal.saveSettings({ show_calendars: shown });
    setBusy(false);
  };

  const others = s?.calendars?.filter((c) => !c.isTasks) ?? [];
  const tasksCal = s?.calendars?.find((c) => c.isTasks);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Google Kalendář"
    >
      <div className="sheet-inner">
        <h2 className="sheet-h">Google Kalendář</h2>

        {!s && <p className="sheet-hint">Načítám…</p>}

        {s && !s.configured && (
          <p className="sheet-text">
            Napojení ještě není nastavené na serveru. Ve Vercelu chybí proměnné <code>GOOGLE_CLIENT_ID</code> a <code>GOOGLE_CLIENT_SECRET</code> – postup je v README.
          </p>
        )}

        {s?.configured && !s.connected && (
          <>
            <p className="sheet-text">
              Po připojení uvidíš v pohledech Dnes a Plán události ze svých kalendářů (i rodinného) a úkoly s datem se zapíšou do nového kalendáře „Úkoly“.
              Když událost v kalendáři přesuneš, přesune se i úkol.
            </p>
            <a className="btn" href="/api/google/connect">
              Připojit Google Kalendář
            </a>
          </>
        )}

        {s?.reconnect && (
          <>
            <p className="sheet-text warn">{s.error ?? "Přístup ke kalendáři vypršel."}</p>
            <a className="btn" href="/api/google/connect">
              Připojit znovu
            </a>
          </>
        )}

        {s?.connected && !s.reconnect && (
          <>
            <p className="sheet-text">
              Připojeno jako <b>{s.email ?? "Google účet"}</b>.
            </p>

            <fieldset className="cal-list" disabled={busy}>
              <legend>Zobrazovat v úkolníku</legend>
              {others.map((c) => (
                <label key={c.id} className="cal-item">
                  <input type="checkbox" checked={c.shown} onChange={() => toggleCal(c.id)} />
                  <span className="cal-dot" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </label>
              ))}
            </fieldset>

            <label className="cal-item cal-write">
              <input
                type="checkbox"
                checked={!!s.writeTasks}
                onChange={async (e) => {
                  setBusy(true);
                  await cal.saveSettings({ write_tasks: e.target.checked });
                  setBusy(false);
                }}
                disabled={busy}
              />
              <span className="cal-dot" style={{ background: tasksCal?.color ?? "var(--marker)" }} aria-hidden />
              <span>
                Zapisovat úkoly s datem do kalendáře „Úkoly“
                <small>Přesun nebo smazání události se promítne do úkolu. Událost přidaná přímo do „Úkoly“ se stane úkolem.</small>
              </span>
            </label>

            <p className="sheet-hint">
              {cal.syncing
                ? "Synchronizuji…"
                : cal.lastError
                  ? cal.lastError
                  : s.lastSync
                    ? `Naposledy synchronizováno ${new Date(s.lastSync).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}.`
                    : "Zatím nesynchronizováno."}
            </p>

            <div className="sheet-actions">
              <button
                type="button"
                className="btn-ghost danger"
                onClick={async () => {
                  if (!confirm("Odpojit Google Kalendář? Kalendář „Úkoly“ v Googlu zůstane, jen se přestane synchronizovat.")) return;
                  await cal.disconnect();
                }}
              >
                Odpojit
              </button>
              <span className="spacer" />
              <button type="button" className="btn-ghost" onClick={() => cal.sync()} disabled={cal.syncing}>
                Synchronizovat teď
              </button>
            </div>
          </>
        )}

        <div className="sheet-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Hotovo
          </button>
        </div>
      </div>
    </dialog>
  );
}
