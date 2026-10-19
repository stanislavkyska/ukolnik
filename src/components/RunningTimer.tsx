"use client";

import { useEffect, useState } from "react";
import { durationMs, fmtClock, type TimeEntry } from "@/lib/time";
import { Tag } from "./TagSuggest";

const LONG_MS = 10 * 3600000;

/** Lišta s běžícími stopkami – viditelná ve všech pohledech. */
export function RunningTimer({ entry, onStop, onOpen }: { entry: TimeEntry; onStop: () => void; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = fmtClock(durationMs(entry, now));
  useEffect(() => {
    const prev = document.title;
    document.title = `${clock} · ${entry.title || "Stopky"}`;
    return () => {
      document.title = prev;
    };
  }, [clock, entry.title]);

  return (
    <div className="running" role="status">
      <span className="running-dot" aria-hidden />
      <button type="button" className="running-body" onClick={onOpen}>
        <span className="running-title">{entry.title || "Bez názvu"}</span>
        {entry.tags.length > 0 && (
          <span className="running-tags">
            {entry.tags.map((t) => (
              <Tag key={t} name={t} />
            ))}
          </span>
        )}
      </button>
      <span className="running-clock">
        {clock}
        {durationMs(entry, now) > LONG_MS && <small className="running-warn">Běží přes {LONG_MS / 3600000} h – nezapomněl jsi stopky?</small>}
      </span>
      <button type="button" className="running-stop" onClick={onStop} aria-label="Zastavit stopky">
        <span aria-hidden />
        Stop
      </button>
    </div>
  );
}
