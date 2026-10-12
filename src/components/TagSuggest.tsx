"use client";

import type { TagUsage } from "@/lib/tags";
import { tagHue } from "@/lib/tags";

export function TagDot({ name }: { name: string }) {
  return <span className="tag-dot" style={{ ["--h" as string]: tagHue(name) }} aria-hidden />;
}

export function Tag({ name, onClick, active }: { name: string; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <TagDot name={name} />
      {name}
    </>
  );
  return onClick ? (
    <button type="button" className={`tag${active ? " is-active" : ""}`} onClick={onClick} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <span className="tag">{body}</span>
  );
}

/** Nabídka štítků pod polem. Ovládá se šipkami z rodiče (index). */
export function TagSuggest({
  items,
  index,
  query,
  onPick,
  id,
}: {
  items: TagUsage[];
  index: number;
  query: string;
  onPick: (name: string) => void;
  id: string;
}) {
  if (!items.length && !query) return null;
  return (
    <ul className="suggest" role="listbox" id={id}>
      {items.map((t, i) => (
        <li
          key={t.name}
          role="option"
          id={`${id}-${i}`}
          aria-selected={i === index}
          className={i === index ? "is-on" : undefined}
          // mousedown, ať pole neztratí fokus dřív, než se klik zpracuje
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(t.name);
          }}
        >
          <TagDot name={t.name} />
          <span className="suggest-name">{t.name}</span>
          <span className="suggest-count">{t.count}×</span>
        </li>
      ))}
      {query && !items.some((t) => t.name.toLowerCase() === query.toLowerCase()) && (
        <li className="suggest-new" aria-hidden>
          Nový štítek <b>#{query.toLowerCase()}</b> – stačí psát dál
        </li>
      )}
    </ul>
  );
}
