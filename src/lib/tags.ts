// Našeptávání štítků: bez ohledu na diakritiku, velikost písmen a drobný překlep.

import { normalize } from "./text.ts";

export interface TagUsage {
  name: string;
  count: number;
}

export function suggestTags(query: string, usage: TagUsage[], limit = 6, exclude: string[] = []): TagUsage[] {
  const q = normalize(query.replace(/^#/, ""));
  const skip = new Set(exclude.map(normalize));
  const scored: { tag: TagUsage; score: number }[] = [];

  for (const tag of usage) {
    const n = normalize(tag.name);
    if (skip.has(n)) continue;
    let score = 0;
    if (!q) score = 1;
    else if (n === q) score = 0; // už napsané celé – nenabízet
    else if (n.startsWith(q)) score = 5;
    else if (n.split(/[-_/]/).some((p) => p.startsWith(q))) score = 4;
    else if (n.includes(q)) score = 3;
    else if (q.length >= 3 && levenshtein(n.slice(0, q.length), q) <= 1) score = 2;
    else if (q.length >= 2 && isSubsequence(q, n)) score = 1;
    if (score > 0) scored.push({ tag, score });
  }

  scored.sort((a, b) => b.score - a.score || b.tag.count - a.tag.count || a.tag.name.localeCompare(b.tag.name, "cs"));
  return scored.slice(0, limit).map((s) => s.tag);
}

export function countTags(lists: string[][]): TagUsage[] {
  const map = new Map<string, TagUsage>();
  for (const tags of lists) {
    for (const name of tags) {
      const key = normalize(name);
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { name, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "cs"));
}

/**
 * Přísnější hledání pro slova bez # (pole stopek): jen štítky, které dané
 * písmena opravdu obsahují – „jaro“ → „mm-rd-jarosek“. Bez překlepových shod,
 * aby se nabídka nepletla do běžného textu.
 */
export function matchTags(query: string, usage: TagUsage[], limit = 6, exclude: string[] = []): TagUsage[] {
  const q = normalize(query);
  if (q.length < 3) return [];
  const skip = new Set(exclude.map(normalize));
  return usage
    .map((tag) => {
      const n = normalize(tag.name);
      if (skip.has(n)) return null;
      const score = n.startsWith(q) ? 3 : n.split(/[-_/]/).some((p) => p.startsWith(q)) ? 2 : n.includes(q) ? 1 : 0;
      return score ? { tag, score } : null;
    })
    .filter((x): x is { tag: TagUsage; score: number } => !!x)
    .sort((a, b) => b.score - a.score || b.tag.count - a.tag.count || a.tag.name.localeCompare(b.tag.name, "cs"))
    .slice(0, limit)
    .map((x) => x.tag);
}

/** Slovo pod kurzorem bez ohledu na # (pro našeptávání ve stopkách) */
export function wordAt(text: string, caret: number): { start: number; end: number; word: string } {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { start, end, word: text.slice(start, end) };
}

/** Slovo pod kurzorem, pokud začíná # – pro otevření nabídky v poli. */
export function tagTokenAt(text: string, caret: number): { start: number; end: number; query: string } | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word.startsWith("#")) return null;
  return { start, end, query: word.slice(1) };
}

function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const TAG_HUES = [200, 28, 150, 330, 262, 95, 12, 180, 48, 300];
/** Stálá barva štítku odvozená z názvu */
export function tagHue(name: string): number {
  let h = 0;
  for (const ch of normalize(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_HUES[h % TAG_HUES.length];
}
