// Port of IsinKit/FuzzyMatcher.swift. Ranks launcher items the way a launcher user expects:
// exact > prefix > word prefix > every token a word prefix > acronym > substring > scattered subsequence.
// Case, diacritics and the Turkish dotted/dotless i are ignored.

const MARKS = /\p{M}/gu;

/** Lowercased, diacritic-free form used for every comparison ("İstanbul" → "istanbul", "ışık" → "isik"). */
export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(MARKS, "").replace(/ı/g, "i");
}

const isAlnum = (c: string) => /[\p{L}\p{N}]/u.test(c);
const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();

/** Splits on spaces, punctuation and camelCase boundaries: "toggleHiddenFiles" → ["toggle", "hidden", "files"]. */
export function words(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let previous = "";
  for (const c of text) {
    const separator = !isAlnum(c);
    const camel = isUpper(c) && isLower(previous);
    if (separator || camel) {
      if (current) result.push(current);
      current = separator ? "" : c;
    } else {
      current += c;
    }
    previous = c;
  }
  if (current) result.push(current);
  return result;
}

interface Prepared {
  normalized: string;
  length: number;
  words: string[];
  acronym: string;
}

interface Query {
  normalized: string;
  length: number;
  tokens: string[];
  compact: string;
}

const textCache = new Map<string, Prepared>();
const queryCache = new Map<string, Query>();

function prepare(text: string): Prepared {
  const cached = textCache.get(text);
  if (cached) return cached;
  const normalized = normalize(text);
  const ws = words(text).map(normalize);
  const prepared = { normalized, length: [...normalized].length, words: ws, acronym: ws.map((w) => w[0]).join("") };
  if (text.length <= 2048) {
    if (textCache.size > 40_000) textCache.clear();
    textCache.set(text, prepared);
  }
  return prepared;
}

function prepareQuery(query: string): Query {
  const cached = queryCache.get(query);
  if (cached) return cached;
  const normalized = normalize(query).trim();
  const prepared = {
    normalized,
    length: [...normalized].length,
    tokens: normalized.split(" ").filter(Boolean),
    compact: normalized.replace(/ /g, ""),
  };
  if (queryCache.size > 256) queryCache.clear();
  queryCache.set(query, prepared);
  return prepared;
}

/** Score in 0...1 (higher is better), or null when `query` does not match `text` at all. */
export function score(query: string, text: string): number | null {
  const q = prepareQuery(query);
  if (!q.normalized) return 0.5;
  return scorePrepared(q, prepare(text));
}

function scorePrepared(query: Query, text: Prepared): number | null {
  const q = query.normalized;
  const t = text.normalized;
  if (!t) return null;
  if (t === q) return 1;
  const lengthPenalty = Math.min(0.05, (text.length - query.length) * 0.002);
  if (t.startsWith(q)) return 0.92 - lengthPenalty;
  if (text.words.some((w) => w.startsWith(q))) return 0.82 - lengthPenalty;
  // Every query token starts some word: "tog hid" → "Toggle Hidden Files".
  if (query.tokens.length > 1 && query.tokens.every((token) => text.words.some((w) => w.startsWith(token)))) {
    return 0.78 - lengthPenalty;
  }
  const compact = query.compact;
  if (text.acronym.length > 1 && text.acronym.startsWith(compact)) return 0.74;
  if (t.includes(q)) return 0.6 - lengthPenalty;

  // Scattered subsequence, rewarded for density and word-start hits.
  const needle = [...compact];
  if (needle.length < 2) return null;
  let qi = 0;
  let firstHit = -1;
  let lastHit = 0;
  let wordStartHits = 0;
  let startsAtWord = false;
  let previous = " ";
  let offset = 0;
  for (const c of t) {
    if (qi === needle.length) break;
    if (c === needle[qi]) {
      const atWordStart = !isAlnum(previous);
      if (firstHit < 0) {
        firstHit = offset;
        startsAtWord = atWordStart;
      }
      lastHit = offset;
      if (atWordStart) wordStartHits++;
      qi++;
    }
    previous = c;
    offset++;
  }
  if (qi !== needle.length || firstHit < 0) return null;
  // Scattered letters only count when they start at a word and most land on word starts or runs.
  if (!(startsAtWord && (lastHit - firstHit + 1 <= needle.length * 4 || wordStartHits >= needle.length - 1))) return null;
  const span = lastHit - firstHit + 1;
  const density = needle.length / span;
  return Math.min(0.2 + 0.25 * density + 0.05 * Math.min(wordStartHits, 3), 0.55);
}

/** Best weighted score over several fields (title weight 1, subtitle/keywords lower). */
export function bestScore(query: string, fields: Array<[string | undefined, number]>): number | null {
  let best: number | null = null;
  for (const [text, weight] of fields) {
    if (!text) continue;
    const s = score(query, text);
    if (s !== null && (best === null || s * weight > best)) best = s * weight;
  }
  return best;
}
