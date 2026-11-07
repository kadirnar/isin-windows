// Port of IsinKit/Frecency.swift: usage history that boosts frequently *and* recently used items, plus
// per-query learning (typing "cl" and picking Clipboard History makes it win for "cl" next time).
import { normalize } from "./fuzzy";

export interface FrecencyEntry {
  count: number;
  lastUsed: number; // ms since epoch
}

export interface FrecencyData {
  items: Record<string, FrecencyEntry>;
  queries: Record<string, Record<string, number>>;
}

export const HALF_LIFE_DAYS = 7;
const DAY = 86_400_000;

export const emptyFrecency = (): FrecencyData => ({ items: {}, queries: {} });

export function decayed(entry: FrecencyEntry, now = Date.now()): number {
  const days = Math.max(0, (now - entry.lastUsed) / DAY);
  return entry.count * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export function record(data: FrecencyData, id: string, query: string, now = Date.now()): FrecencyData {
  const previous = data.items[id];
  const items = { ...data.items, [id]: { count: (previous ? decayed(previous, now) : 0) + 1, lastUsed: now } };
  const queries = { ...data.queries };
  const key = normalize(query).trim();
  if (key) {
    queries[key] = { ...(queries[key] ?? {}), [id]: (queries[key]?.[id] ?? 0) + 1 };
    const keys = Object.keys(queries);
    if (keys.length > 2000) delete queries[keys[0]];
  }
  return { items, queries };
}

/** 0...1 boost from overall use. */
export function usageBoost(data: FrecencyData, id: string, now = Date.now()): number {
  const entry = data.items[id];
  if (!entry) return 0;
  const value = decayed(entry, now);
  return value / (value + 3);
}

/** 0...1 boost from having picked this item for this (or a longer) query before. */
export function queryBoost(data: FrecencyData, id: string, query: string): number {
  const key = normalize(query).trim();
  if (!key) return 0;
  let picks = data.queries[key]?.[id] ?? 0;
  if (picks === 0) {
    // A shorter prefix of a learned query still counts, at half weight.
    for (const [learned, counts] of Object.entries(data.queries)) {
      if (learned.startsWith(key)) picks = Math.max(picks, (counts[id] ?? 0) / 2);
    }
  }
  return picks / (picks + 1);
}

/** Most used ids, best first. */
export function top(data: FrecencyData, limit: number, now = Date.now()): string[] {
  return Object.entries(data.items)
    .map(([id, entry]) => [id, decayed(entry, now)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
