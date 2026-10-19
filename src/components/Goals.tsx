"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_WORKDAYS, goalLabel, goalProgress, hm, hoursText, type GoalPeriod, type NewTimeGoal, type TimeGoal } from "@/lib/goals";
import { tagHue, type TagUsage } from "@/lib/tags";
import type { TimeEntry } from "@/lib/time";

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function plural(n: number): string {
  return n === 1 ? "den" : n < 5 ? "dny" : "dní";
}

/** Průběh cílů hodin – v pohledu Dnes i v záložce Čas */
export function GoalsBar({ goals, entries, today, onManage }: { goals: TimeGoal[]; entries: TimeEntry[]; today: string; onManage?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const running = entries.some((e) => !e.ended_at);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [running]);

  if (!goals.length) return null;

  return (
    <section className="goals" aria-label="Cíle hodin">
      {goals.map((g) => {
        const p = goalProgress(g, entries, today, now);
        const pct = Math.min(100, (p.done / p.target) * 100);
        const planPct = g.period === "day" ? null : Math.min(100, (p.planToday / p.target) * 100);
        const reached = p.remaining === 0;
        let sub: string;
        if (p.dayOff) sub = p.done ? `Volný den, odpracováno ${hm(p.done)}` : "Dnes volno";
        else if (reached) sub = `Splněno${p.over >= 60000 ? `, navíc ${hm(p.over)}` : ""}`;
        else if (g.period === "day") sub = `Zbývá ${hm(p.remaining)}${p.finishAt ? ` · se stopkami hotovo v ${p.finishAt}` : ""}`;
        else {
          const pace = p.daysLeft > 0 ? ` · ${hm(p.perDay)} denně (${p.daysLeft} ${plural(p.daysLeft)})` : "";
          sub = `Zbývá ${hm(p.remaining)}${pace}`;
        }
        const tone = reached ? "done" : !p.dayOff && g.period !== "day" && p.balance < -3600000 ? "behind" : "on";
        return (
          <div key={g.id} className={`goal tone-${tone}${p.running ? " is-running" : ""}`} style={g.tag ? { ["--h" as string]: tagHue(g.tag.split("/")[0]) } : undefined}>
            <div className="goal-top">
              <span className="goal-name">{goalLabel(g)}</span>
              <span className="goal-nums">
                <b>{hm(p.done)}</b> / {hoursText(g.hours)}
              </span>
            </div>
            <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.hours} aria-valuenow={Math.round((p.done / 3600000) * 10) / 10} aria-label={goalLabel(g)}>
              <span style={{ width: `${pct}%` }} />
              {planPct !== null && planPct < 100 && <i style={{ left: `${planPct}%` }} title={`Plán do dneška: ${hm(p.planToday)}`} />}
            </div>
            <div className="goal-sub">
              <span>{sub}</span>
              {!p.dayOff && !reached && g.period !== "day" && Math.abs(p.balance) >= 60000 && (
                <span className={p.balance < 0 ? "goal-bal is-minus" : "goal-bal"}>
                  {p.balance < 0 ? `skluz ${hm(p.balance)}` : `náskok ${hm(p.balance)}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {onManage && (
        <button type="button" className="goals-edit" onClick={onManage}>
          Upravit cíle
        </button>
      )}
    </section>
  );
}

export function GoalsSheet({
  goals,
  usage,
  onCreate,
  onRemove,
  onClose,
}: {
  goals: TimeGoal[];
  usage: TagUsage[];
  onCreate: (g: NewTimeGoal) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tag, setTag] = useState(() => usage.find((u) => u.name.toLowerCase().startsWith("projekce"))?.name.split("/")[0] ?? "");
  const [period, setPeriod] = useState<GoalPeriod>("day");
  const [hours, setHours] = useState("8");
  const [workdays, setWorkdays] = useState<number[]>(DEFAULT_WORKDAYS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // nabídka štítků: nadřazené i podštítky, bez duplicit
  const tagOptions = [...new Set(usage.flatMap((u) => (u.name.includes("/") ? [u.name.split("/")[0], u.name] : [u.name])))];
  const h = Number(hours.replace(",", "."));
  const valid = h > 0 && h <= 744 && workdays.length > 0;

  const add = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onCreate({ tag: tag.trim().replace(/^#/, "").toLowerCase() || null, period, hours: h, workdays: [...workdays].sort() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label="Cíle hodin"
    >
      <div className="sheet-inner">
        <h2 className="sheet-h">Cíle hodin</h2>

        {goals.length > 0 && (
          <ul className="goal-list">
            {goals.map((g) => (
              <li key={g.id}>
                <span>
                  <b>{g.tag ?? "Celkem"}</b> · {hoursText(g.hours)} {g.period === "day" ? "denně" : g.period === "week" ? "týdně" : "měsíčně"}
                  <small>{g.workdays.length === 7 ? "každý den" : g.workdays.map((d) => DAYS[d - 1]).join(" ")}</small>
                </span>
                <button type="button" className="btn-ghost small danger" onClick={() => onRemove(g.id)} aria-label={`Smazat cíl ${g.tag ?? "celkem"}`}>
                  Smazat
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="goal-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="sheet-label">
            Co počítat
            <input list="goal-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Prázdné = všechen čas" />
            <datalist id="goal-tags">
              {tagOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <p className="sheet-hint">Štítek „projekce“ započítá i podštítky jako projekce/rd-senov.</p>

          <div className="sheet-row">
            <div className="sheet-label">
              <span>Období</span>
              <div className="seg" role="group" aria-label="Období">
                {(
                  [
                    ["day", "Den"],
                    ["week", "Týden"],
                    ["month", "Měsíc"],
                  ] as [GoalPeriod, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" className={period === k ? "is-active" : undefined} aria-pressed={period === k} onClick={() => setPeriod(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="sheet-label">
              Hodin
              <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          </div>

          <div className="sheet-label">
            <span>Pracovní dny {period !== "day" && <small>(rozpočítá se na ně tempo)</small>}</span>
            <div className="daypick" role="group" aria-label="Pracovní dny">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = workdays.includes(n);
                return (
                  <button key={d} type="button" className={on ? "chip is-active" : "chip"} aria-pressed={on} onClick={() => setWorkdays((w) => (on ? w.filter((x) => x !== n) : [...w, n]))}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sheet-actions">
            <span className="spacer" />
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
              Hotovo
            </button>
            <button type="submit" className="btn" disabled={!valid || busy}>
              Přidat cíl
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
