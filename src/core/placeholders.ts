// Dynamic placeholders for snippets and quicklinks (after IsinKit/Productivity/Placeholders.swift):
//   {clipboard} {selection} {date} {time} {datetime} {day} {uuid} {cursor}
//   {query} {argument name="x" default="y"} {date format="yyyy-MM-dd" offset="+1d"} {clipboard | uppercase | trim}

export interface PlaceholderContext {
  clipboard?: string;
  selection?: string;
  query?: string;
  arguments?: Record<string, string>;
  now?: Date;
  /** Quicklinks percent-encode {query}/{argument} values unless `| raw`. */
  encodeArguments?: boolean;
}

export interface Expanded {
  text: string;
  /** How many ← presses move the caret from the end to `{cursor}` (0 when there is none). */
  cursorBack: number;
}

const TOKEN = /\{([a-z-]+)((?:\s+[a-z]+="[^"]*")*)((?:\s*\|\s*[a-z-]+)*)\s*\}/gi;
const CURSOR_MARK = "\u0000CURSOR\u0000";

function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of text.matchAll(/([a-z]+)="([^"]*)"/gi)) attributes[match[1].toLowerCase()] = match[2];
  return attributes;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Unicode-style date patterns (the subset people use): yyyy yy MMMM MMM MM M dd d EEEE EEE HH H hh h mm ss a. */
export function formatDate(date: Date, pattern: string): string {
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|a|'[^']*'/g, (token) => {
    switch (token) {
      case "yyyy": return String(date.getFullYear());
      case "yy": return pad(date.getFullYear() % 100);
      case "MMMM": return MONTHS[date.getMonth()];
      case "MMM": return MONTHS[date.getMonth()].slice(0, 3);
      case "MM": return pad(date.getMonth() + 1);
      case "M": return String(date.getMonth() + 1);
      case "dd": return pad(date.getDate());
      case "d": return String(date.getDate());
      case "EEEE": return DAYS[date.getDay()];
      case "EEE": return DAYS[date.getDay()].slice(0, 3);
      case "HH": return pad(date.getHours());
      case "H": return String(date.getHours());
      case "hh": return pad(date.getHours() % 12 || 12);
      case "h": return String(date.getHours() % 12 || 12);
      case "mm": return pad(date.getMinutes());
      case "ss": return pad(date.getSeconds());
      case "a": return date.getHours() < 12 ? "AM" : "PM";
      default: return token.slice(1, -1);
    }
  });
}

/** "+1d", "-2w", "+3M", "+1y", "+5m" (minutes), "+2h". */
export function applyOffset(date: Date, offset: string): Date {
  const d = new Date(date);
  for (const match of offset.matchAll(/([+-]?)\s*(\d+)\s*([mhdwMyYsSDWH])/g)) {
    const amount = Number(match[2]) * (match[1] === "-" ? -1 : 1);
    switch (match[3]) {
      case "s": case "S": d.setSeconds(d.getSeconds() + amount); break;
      case "m": d.setMinutes(d.getMinutes() + amount); break;
      case "h": case "H": d.setHours(d.getHours() + amount); break;
      case "d": case "D": d.setDate(d.getDate() + amount); break;
      case "w": case "W": d.setDate(d.getDate() + amount * 7); break;
      case "M": d.setMonth(d.getMonth() + amount); break;
      case "y": case "Y": d.setFullYear(d.getFullYear() + amount); break;
    }
  }
  return d;
}

/** Names of `{argument name="…"}` placeholders, in order, for asking the user before expanding. */
export function argumentNames(template: string): Array<{ name: string; default?: string }> {
  const names: Array<{ name: string; default?: string }> = [];
  for (const match of template.matchAll(TOKEN)) {
    if (match[1].toLowerCase() !== "argument") continue;
    const attributes = parseAttributes(match[2]);
    const name = attributes.name ?? "argument";
    if (!names.some((n) => n.name === name)) names.push({ name, default: attributes.default });
  }
  return names;
}

export function hasPlaceholder(template: string, name: string): boolean {
  return [...template.matchAll(TOKEN)].some((m) => m[1].toLowerCase() === name);
}

export function expandPlaceholders(template: string, context: PlaceholderContext): Expanded {
  const now = context.now ?? new Date();
  let sawCursor = false;
  const text = template.replace(TOKEN, (whole, rawName: string, rawAttributes: string, rawModifiers: string) => {
    const name = rawName.toLowerCase();
    const attributes = parseAttributes(rawAttributes);
    const modifiers = rawModifiers.split("|").map((m) => m.trim().toLowerCase()).filter(Boolean);
    let value: string;
    let encode = false;
    switch (name) {
      case "clipboard": value = context.clipboard ?? ""; break;
      case "selection": value = context.selection ?? ""; break;
      case "date":
      case "time":
      case "datetime":
      case "day": {
        const date = attributes.offset ? applyOffset(now, attributes.offset) : now;
        const fallback = { date: "d MMM yyyy", time: "HH:mm", datetime: "d MMM yyyy HH:mm", day: "EEEE" }[name]!;
        value = formatDate(date, attributes.format ?? fallback);
        break;
      }
      case "uuid": value = crypto.randomUUID(); break;
      case "cursor":
        if (sawCursor) return "";
        sawCursor = true;
        return CURSOR_MARK;
      case "query":
        value = context.query ?? context.arguments?.query ?? "";
        encode = !!context.encodeArguments;
        break;
      case "argument": {
        const key = attributes.name ?? "argument";
        value = context.arguments?.[key] ?? (key === "query" ? context.query : undefined) ?? attributes.default ?? "";
        encode = !!context.encodeArguments;
        break;
      }
      default:
        return whole;
    }
    for (const modifier of modifiers) {
      switch (modifier) {
        case "uppercase": value = value.toUpperCase(); break;
        case "lowercase": value = value.toLowerCase(); break;
        case "trim": value = value.trim(); break;
        case "percent-encode": value = encodeURIComponent(value); encode = false; break;
        case "json-stringify": value = JSON.stringify(value); break;
        case "raw": encode = false; break;
      }
    }
    return encode ? encodeURIComponent(value) : value;
  });
  const index = text.indexOf(CURSOR_MARK);
  if (index < 0) return { text, cursorBack: 0 };
  const result = text.replace(CURSOR_MARK, "");
  return { text: result, cursorBack: [...result.slice(index)].length };
}
