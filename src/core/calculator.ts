// The inline calculator of root search (after IsinKit/Calculator): math, percentages, units, currencies,
// number bases, "time in <city>" and date arithmetic ("today + 1 week", "bugün + 1 hafta").
import { CURRENCY_CODES, DEFAULT_TARGETS, fromBase, toBase, UnitCatalog, unitName, type UnitDef } from "./units";

export type CalcKind = "math" | "unit" | "currency" | "time" | "date" | "percent" | "base";

export interface CalcResult {
  kind: CalcKind;
  question: string;
  questionLabel: string;
  answer: string;
  answerLabel: string;
  /** What "Copy Answer" puts on the clipboard (no thousands separators). */
  copyValue: string;
  /** Currency query typed before exchange rates were loaded. */
  needsRates?: boolean;
}

export interface CalcContext {
  now?: Date;
  /** Units of each currency per 1 USD; undefined until loaded. */
  rates?: Record<string, number>;
  localCurrency?: string;
  remToPx?: number;
  timeZone?: string;
}

// MARK: Formatting

const MINUS = "−";

export function formatNumber(value: number, style: "math" | "unit" | "currency" = "math"): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? MINUS + "∞" : "NaN";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return formatScientific(value);
  const digits = style === "currency" ? 2 : style === "unit" ? 4 : 10;
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: style === "currency" ? 2 : 0 }).format(value);
  return text.replace("-", MINUS);
}

export function plainNumber(value: number, style: "math" | "unit" | "currency" = "math"): string {
  const digits = style === "currency" ? 2 : style === "unit" ? 4 : 10;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e21 || abs < 1e-9)) return value.toExponential(8).replace(/\.?0+e/, "e");
  return String(Number(value.toFixed(digits)));
}

export function formatScientific(value: number): string {
  const [mantissa, exponent] = value.toExponential(6).split("e");
  const m = mantissa.replace(/\.?0+$/, "");
  return `${m} × 10^${Number(exponent)}`.replace("-", MINUS);
}

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES: Array<[number, string]> = [[1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];

/** "Forty-Two" for integers below a quadrillion; null for fractions. */
export function numberWords(value: number): string | null {
  if (!Number.isInteger(value) || Math.abs(value) >= 1e15) return null;
  if (value < 0) return "Minus " + numberWords(-value);
  const below1000 = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(ONES[Math.floor(n / 100)] + " Hundred");
      n %= 100;
    }
    if (n >= 20) {
      parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
    } else if (n > 0 || parts.length === 0) {
      parts.push(ONES[n]);
    }
    return parts.join(" ");
  };
  if (value < 1000) return below1000(value);
  const parts: string[] = [];
  let rest = value;
  for (const [scale, name] of SCALES) {
    if (rest >= scale) {
      parts.push(below1000(Math.floor(rest / scale)) + " " + name);
      rest %= scale;
    }
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(" ");
}

// MARK: Tokens

type Base = "decimal" | "hex" | "binary" | "octal";
const BASE_TITLES: Record<Base, string> = { decimal: "Decimal", hex: "Hexadecimal", binary: "Binary", octal: "Octal" };

type Token =
  | { kind: "number"; value: number; base: Base; text: string }
  | { kind: "op"; op: string; text: string }
  | { kind: "unit"; unit: UnitDef; text: string }
  | { kind: "func"; name: string; text: string }
  | { kind: "const"; name: string; value: number; text: string }
  | { kind: "lparen" | "rparen" | "comma"; text: string };

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), tan: (x) => Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: Math.PI * 2, "τ": Math.PI * 2 };
const WORD_OPS: Record<string, string> = { of: "of", off: "off", mod: "mod", times: "*", plus: "+", minus: "-", x: "*" };
const SYMBOL_OPS: Record<string, string> = {
  "+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", "^": "^", "%": "%", "!": "!",
};

class CalcError extends Error {}

function tokenize(input: string, catalog: UnitCatalog): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  while (i < s.length) {
    const rest = s.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    if (rest.startsWith("**")) {
      tokens.push({ kind: "op", op: "^", text: "^" });
      i += 2;
      continue;
    }
    const based = /^0([xbo])([0-9a-f]+)/i.exec(rest);
    if (based) {
      const radix = { x: 16, b: 2, o: 8 }[based[1].toLowerCase() as "x" | "b" | "o"];
      const value = parseInt(based[2], radix);
      if (Number.isNaN(value)) throw new CalcError("bad number");
      tokens.push({ kind: "number", value, base: radix === 16 ? "hex" : radix === 2 ? "binary" : "octal", text: based[0] });
      i += based[0].length;
      continue;
    }
    const num = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:_\d+)*(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (num) {
      const value = Number(num[0].replace(/[,_]/g, ""));
      if (Number.isNaN(value)) throw new CalcError("bad number");
      tokens.push({ kind: "number", value, base: "decimal", text: num[0] });
      i += num[0].length;
      continue;
    }
    const c = s[i];
    if (c === "(") { tokens.push({ kind: "lparen", text: c }); i++; continue; }
    if (c === ")") { tokens.push({ kind: "rparen", text: c }); i++; continue; }
    if (c === ",") { tokens.push({ kind: "comma", text: c }); i++; continue; }
    if (SYMBOL_OPS[c]) { tokens.push({ kind: "op", op: SYMBOL_OPS[c], text: c }); i++; continue; }
    const word = /^(?:[$€£¥₺℃℉′″'"]|[\p{L}°µ][\p{L}\p{N}°²³]*(?:\/[\p{L}]+)?)/u.exec(rest);
    if (word) {
      let text = word[0];
      let length = text.length;
      // Two-word units: "fl oz", "sq m", "nautical miles".
      const next = /^\s+([\p{L}²]+)/u.exec(s.slice(i + length));
      if (next && catalog.unit(`${text} ${next[1]}`) && !catalog.unit(text)) {
        text = `${text} ${next[1]}`;
        length += next[0].length;
      } else if (next && catalog.unit(`${text}${next[1]}`) && text.toLowerCase() === "fl") {
        text = `${text}${next[1]}`;
        length += next[0].length;
      }
      const lower = text.toLowerCase();
      if (WORD_OPS[lower] && !(lower === "x" && tokens.length === 0)) {
        tokens.push({ kind: "op", op: WORD_OPS[lower], text });
      } else if (FUNCTIONS[lower]) {
        tokens.push({ kind: "func", name: lower, text });
      } else if (CONSTANTS[lower] !== undefined && !catalog.unit(text)) {
        tokens.push({ kind: "const", name: lower, value: CONSTANTS[lower], text });
      } else if (lower === "e" || lower === "pi") {
        tokens.push({ kind: "const", name: lower, value: CONSTANTS[lower], text });
      } else {
        const unit = catalog.unit(text);
        if (!unit) throw new CalcError(`unknown word ${text}`);
        tokens.push({ kind: "unit", unit, text });
      }
      i += length;
      continue;
    }
    throw new CalcError(`unexpected ${c}`);
  }
  return tokens;
}

// MARK: Values

interface Value {
  v: number;
  unit?: UnitDef;
  percent?: boolean;
}

function inUnit(value: Value, unit: UnitDef): number {
  if (!value.unit) return value.v;
  if (value.unit.dimension !== unit.dimension) throw new CalcError("dimension mismatch");
  return fromBase(unit, toBase(value.unit, value.v));
}

function addSub(a: Value, b: Value, sign: 1 | -1): Value {
  if (b.percent && !a.percent) return { v: a.v * (1 + sign * b.v), unit: a.unit };
  if (a.unit?.dimension === "temperature" || b.unit?.dimension === "temperature") {
    if (a.unit && b.unit && a.unit.id !== b.unit.id) throw new CalcError("temperature arithmetic");
  }
  if (a.unit && b.unit) return { v: a.v + sign * inUnit(b, a.unit), unit: a.unit };
  return { v: a.v + sign * b.v, unit: a.unit ?? b.unit, percent: a.percent && b.percent };
}

function mul(a: Value, b: Value): Value {
  if (a.unit && b.unit) throw new CalcError("unit × unit");
  if (a.percent && b.percent) return { v: a.v * b.v, percent: true };
  return { v: a.v * b.v, unit: a.unit ?? b.unit };
}

function div(a: Value, b: Value): Value {
  if (a.unit && b.unit) {
    if (a.unit.dimension !== b.unit.dimension) throw new CalcError("unit / unit");
    return { v: toBase(a.unit, a.v) / toBase(b.unit, b.v) };
  }
  if (b.unit) throw new CalcError("number / unit");
  return { v: a.v / b.v, unit: a.unit, percent: a.percent && !b.percent ? a.percent : undefined };
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new CalcError("factorial");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Recursive-descent evaluator over the token list. */
class Parser {
  private i = 0;
  containsPercent = false;
  constructor(private tokens: Token[]) {}

  parse(): Value {
    if (this.tokens.length === 0) throw new CalcError("empty");
    const value = this.additive();
    if (this.i < this.tokens.length) throw new CalcError("trailing input");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private isOp(op: string): boolean {
    const t = this.peek();
    return t?.kind === "op" && t.op === op;
  }

  private additive(): Value {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.tokens[this.i++] as { op: string }).op;
      const right = this.multiplicative();
      left = addSub(left, right, op === "+" ? 1 : -1);
    }
    return left;
  }

  private startsOperand(t: Token | undefined): boolean {
    return !!t && (t.kind === "number" || t.kind === "lparen" || t.kind === "func" || t.kind === "const");
  }

  private multiplicative(): Value {
    let left = this.power();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && ["*", "/", "mod", "of", "off"].includes(t.op)) {
        this.i++;
        const right = this.power();
        if (t.op === "*") left = mul(left, right);
        else if (t.op === "/") left = div(left, right);
        else if (t.op === "mod") left = { v: left.v % inUnit(right, left.unit ?? right.unit!), unit: left.unit };
        else {
          this.containsPercent = true;
          const fraction = left.percent ? left.v : left.v / 100;
          left = t.op === "of" ? { v: right.v * fraction, unit: right.unit } : { v: right.v * (1 - fraction), unit: right.unit };
        }
      } else if (t?.kind === "lparen" || t?.kind === "func" || t?.kind === "const") {
        // Implicit multiplication: "2(3+4)", "2pi", "3 sqrt 4".
        left = mul(left, this.power());
      } else {
        return left;
      }
    }
  }

  private power(): Value {
    const base = this.unary();
    if (this.isOp("^")) {
      this.i++;
      const exponent = this.power();
      if (base.unit || exponent.unit) throw new CalcError("unit power");
      return { v: Math.pow(base.v, exponent.v) };
    }
    return base;
  }

  private unary(): Value {
    if (this.isOp("-")) {
      this.i++;
      const v = this.unary();
      return { ...v, v: -v.v };
    }
    if (this.isOp("+")) {
      this.i++;
      return this.unary();
    }
    return this.postfix();
  }

  private postfix(): Value {
    let value = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && t.op === "!") {
        this.i++;
        value = { v: factorial(value.v), unit: value.unit };
      } else if (t?.kind === "op" && t.op === "%") {
        // "10 % 3" with an operand after it is modulo; "10%" is a percentage.
        const after = this.tokens[this.i + 1];
        if (this.startsOperand(after) && !(after?.kind === "number" && this.tokens[this.i + 2]?.kind === "unit")) {
          this.i++;
          const right = this.power();
          value = { v: value.v % right.v, unit: value.unit };
          continue;
        }
        this.i++;
        this.containsPercent = true;
        value = { v: value.v / 100, percent: true };
      } else if (t?.kind === "unit" && !value.unit && !value.percent) {
        this.i++;
        value = { v: value.v, unit: t.unit };
      } else {
        return value;
      }
    }
  }

  private primary(): Value {
    const t = this.tokens[this.i++];
    if (!t) throw new CalcError("unexpected end");
    switch (t.kind) {
      case "number":
        return { v: t.value };
      case "const":
        return { v: t.value };
      case "unit": {
        // Prefix currency symbol: "$100", "€ 5".
        if (t.unit.dimension === "currency" && this.peek()?.kind === "number") {
          const n = this.tokens[this.i++] as { value: number };
          return { v: n.value, unit: t.unit };
        }
        throw new CalcError("unit without number");
      }
      case "lparen": {
        const v = this.additive();
        if (this.peek()?.kind !== "rparen") throw new CalcError("missing )");
        this.i++;
        return v;
      }
      case "func": {
        const fn = FUNCTIONS[t.name];
        const args: number[] = [];
        if (this.peek()?.kind === "lparen") {
          this.i++;
          if (this.peek()?.kind !== "rparen") {
            args.push(this.additive().v);
            while (this.peek()?.kind === "comma") {
              this.i++;
              args.push(this.additive().v);
            }
          }
          if (this.peek()?.kind !== "rparen") throw new CalcError("missing )");
          this.i++;
        } else {
          args.push(this.power().v);
        }
        return { v: fn(...args) };
      }
      default:
        throw new CalcError(`unexpected ${t.text}`);
    }
  }
}

function prettyTokens(tokens: Token[]): string {
  let out = "";
  tokens.forEach((t, index) => {
    let text = t.text;
    if (t.kind === "op") text = { "*": "×", "/": "÷", "-": MINUS, "^": "^", "%": "%", "!": "!" }[t.op] ?? t.op;
    if (t.kind === "unit") text = t.unit.symbol;
    const prev = tokens[index - 1];
    const tight =
      !prev ||
      prev.kind === "lparen" ||
      t.kind === "rparen" ||
      t.kind === "comma" ||
      (t.kind === "op" && (t.op === "%" || t.op === "!" || t.op === "^")) ||
      (prev.kind === "op" && prev.op === "^") ||
      (t.kind === "lparen" && prev.kind === "func") ||
      (t.kind === "unit" && (t.unit.symbol.startsWith("°") || t.unit.symbol === "′" || t.unit.symbol === "″")) ||
      (prev.kind === "op" && prev.op === "-" && (index === 1 || tokens[index - 2]?.kind === "op" || tokens[index - 2]?.kind === "lparen")) ||
      (prev.kind === "unit" && prev.unit.dimension === "currency" && t.kind === "number" && ["$", "€", "£", "₺", "¥"].includes(prev.text));
    out += (tight ? "" : " ") + text;
  });
  return out;
}

function joinUnit(number: string, unit: UnitDef): string {
  const tight = unit.symbol.startsWith("°") || unit.symbol === "′" || unit.symbol === "″";
  return tight ? number + unit.symbol : `${number} ${unit.symbol}`;
}

// MARK: Catalog cache

let cached: { key: string; catalog: UnitCatalog } | null = null;

function catalogFor(context: CalcContext): UnitCatalog {
  const rates = context.rates ?? Object.fromEntries(CURRENCY_CODES.map((c) => [c, 1]));
  const key = `${context.rates ? Object.keys(rates).length + ":" + (rates.EUR ?? 0) + ":" + (rates.TRY ?? 0) : "none"}|${context.remToPx ?? 16}`;
  if (cached?.key !== key) cached = { key, catalog: new UnitCatalog(rates, context.remToPx ?? 16) };
  return cached.catalog;
}

// MARK: Entry point

const CONVERSION_KEYWORDS = [" to ", " in ", " as ", " into ", " = ", " -> ", " → ", " => ", "->", "→", "=>"];

type Target =
  | { kind: "unit"; unit: UnitDef }
  | { kind: "base"; base: Base }
  | { kind: "scientific" }
  | { kind: "percent" };

function parseTarget(text: string, catalog: UnitCatalog): Target | null {
  const t = text.trim().toLowerCase();
  if (["hex", "hexadecimal", "base16", "base 16"].includes(t)) return { kind: "base", base: "hex" };
  if (["bin", "binary", "base2", "base 2"].includes(t)) return { kind: "base", base: "binary" };
  if (["oct", "octal", "base8", "base 8"].includes(t)) return { kind: "base", base: "octal" };
  if (["dec", "decimal", "base10", "base 10", "number"].includes(t)) return { kind: "base", base: "decimal" };
  if (["sci", "scientific", "scientific notation", "exponential"].includes(t)) return { kind: "scientific" };
  if (["%", "percent", "percentage"].includes(t)) return { kind: "percent" };
  const unit = catalog.unit(text);
  return unit ? { kind: "unit", unit } : null;
}

function formatInBase(value: number, base: Base): string | null {
  if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
  const radix = { decimal: 10, hex: 16, binary: 2, octal: 8 }[base];
  const digits = Math.abs(value).toString(radix).toUpperCase();
  const sign = value < 0 ? MINUS : "";
  if (base === "binary") return sign + digits.replace(/\B(?=(\d{4})+(?!\d))/g, " ");
  if (base === "decimal") return formatNumber(value);
  return sign + digits;
}

function simpleQuantity(tokens: Token[]): { amount: number; unit: UnitDef } | null {
  if (tokens.length === 2 && tokens[0].kind === "number" && tokens[1].kind === "unit") {
    return { amount: tokens[0].value, unit: tokens[1].unit };
  }
  if (tokens.length === 2 && tokens[0].kind === "unit" && tokens[1].kind === "number" && tokens[0].unit.dimension === "currency") {
    return { amount: tokens[1].value, unit: tokens[0].unit };
  }
  return null;
}

function unitResult(value: Value, target: UnitDef, tokens: Token[], context: CalcContext): CalcResult | null {
  if (!value.unit) return null;
  const converted = inUnit(value, target);
  if (!Number.isFinite(converted)) return null;
  const isCurrency = target.dimension === "currency";
  const style = isCurrency ? "currency" : "unit";
  const answer = isCurrency ? `${formatNumber(converted, "currency")} ${target.symbol}` : joinUnit(formatNumber(converted, style), target);
  const simple = simpleQuantity(tokens);
  let question = prettyTokens(tokens);
  let questionLabel = value.unit.plural;
  if (simple) {
    const amountText = formatNumber(simple.amount, simple.unit.dimension === "currency" ? "currency" : "math");
    question = simple.unit.dimension === "currency" ? `${amountText} ${simple.unit.symbol}` : joinUnit(amountText, simple.unit);
    questionLabel = unitName(simple.unit, simple.amount);
  }
  const needsRates = isCurrency && !context.rates;
  return {
    kind: isCurrency ? "currency" : "unit",
    question,
    questionLabel,
    answer: needsRates ? "…" : answer,
    answerLabel: unitName(target, converted),
    copyValue: isCurrency ? `${plainNumber(converted, "currency")} ${target.symbol}` : joinUnit(plainNumber(converted, "unit"), target),
    needsRates,
  };
}

function convert(head: string, target: Target, catalog: UnitCatalog, context: CalcContext): CalcResult | null {
  let tokens: Token[];
  const lone = catalog.unit(head.trim());
  if (lone) {
    tokens = [{ kind: "number", value: 1, base: "decimal", text: "1" }, { kind: "unit", unit: lone, text: lone.symbol }];
  } else {
    tokens = tokenize(head, catalog);
  }
  const parser = new Parser(tokens);
  const value = parser.parse();
  const pretty = prettyTokens(tokens);
  switch (target.kind) {
    case "unit":
      if (value.unit?.dimension !== target.unit.dimension) return null;
      return unitResult(value, target.unit, tokens, context);
    case "base": {
      if (value.unit || value.percent) return null;
      const answer = formatInBase(value.v, target.base);
      if (answer === null) return null;
      const sourceBase = tokens.find((t) => t.kind === "number" && t.base !== "decimal") as { base: Base } | undefined;
      return {
        kind: "base", question: pretty, questionLabel: BASE_TITLES[sourceBase?.base ?? "decimal"], answer,
        answerLabel: BASE_TITLES[target.base],
        copyValue: target.base === "decimal" ? plainNumber(value.v) : answer.replace(/ /g, "").replace(MINUS, "-"),
      };
    }
    case "scientific": {
      if (value.unit || value.v === 0) return null;
      const answer = formatScientific(value.v);
      return { kind: "math", question: pretty, questionLabel: "Expression", answer, answerLabel: "Scientific Notation",
        copyValue: value.v.toExponential().replace("+", "") };
    }
    case "percent": {
      if (value.unit) return null;
      const percent = value.percent ? value.v * 100 : value.v * 100;
      return { kind: "percent", question: pretty, questionLabel: "Expression", answer: formatNumber(percent) + "%",
        answerLabel: "Percent", copyValue: plainNumber(percent) + "%" };
    }
  }
}

function expression(query: string, context: CalcContext): CalcResult | null {
  const catalog = catalogFor(context);
  const lower = query.toLowerCase();

  // "<expr> to <unit>": the right-most keyword first ("5 in in cm").
  const candidates: Array<{ head: string; target: string; keyword: string }> = [];
  for (const keyword of CONVERSION_KEYWORDS) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(keyword, from);
      if (at < 0) break;
      candidates.push({ head: query.slice(0, at), target: query.slice(at + keyword.length), keyword: keyword.trim() });
      from = at + 1;
    }
  }
  candidates.sort((a, b) => b.head.length - a.head.length);
  for (const candidate of candidates) {
    if (!candidate.head.trim()) continue;
    const target = parseTarget(candidate.target, catalog);
    if (!target) continue;
    try {
      const result = convert(candidate.head, target, catalog, context);
      if (result) return result;
    } catch {
      // try the next split
    }
    // "5 in cm": the "in" was inches.
    if (candidate.keyword === "in" && target.kind === "unit") {
      try {
        const result = convert(candidate.head + " in", target, catalog, context);
        if (result) return result;
      } catch {
        // not that either
      }
    }
  }

  let tokens: Token[];
  let value: Value;
  let parser: Parser;
  try {
    tokens = tokenize(query, catalog);
    parser = new Parser(tokens);
    value = parser.parse();
  } catch {
    return null;
  }
  // Bare numbers, a lone "e", and "10%" alone are searches, not calculations.
  if (tokens.length === 1 && tokens[0].kind === "number" && tokens[0].base === "decimal") return null;
  if (tokens.length === 1 && tokens[0].kind === "const" && tokens[0].name === "e") return null;
  if (tokens.length === 2 && tokens[0].kind === "number" && tokens[1].kind === "op" && tokens[1].op === "%") return null;
  if (!Number.isFinite(value.v) && !tokens.some((t) => t.kind === "op" && t.op === "/")) return null;
  const pretty = prettyTokens(tokens);

  if (value.unit) {
    const simple = simpleQuantity(tokens);
    if (simple) {
      // "4k", "3d", "5g", "1m" are more often searches than quantities.
      if (/^[-−]?[0-9][0-9.,_]*[A-Za-zµ]$/.test(query)) return null;
      let target: UnitDef | undefined;
      if (value.unit.dimension === "currency") {
        const local = context.localCurrency ?? "USD";
        const code = value.unit.symbol === local ? (local === "USD" ? "EUR" : "USD") : local;
        target = catalog.unitById("cur:" + code);
      } else {
        const id = DEFAULT_TARGETS[value.unit.id];
        target = id ? catalog.unitById(id) : undefined;
      }
      if (!target) return null;
      return unitResult(value, target, tokens, context);
    }
    return unitResult(value, value.unit, tokens, context);
  }

  if (value.percent) {
    return { kind: "percent", question: pretty, questionLabel: "Expression", answer: formatNumber(value.v * 100) + "%",
      answerLabel: numberWords(value.v * 100) ? numberWords(value.v * 100) + " Percent" : "Percent",
      copyValue: plainNumber(value.v * 100) + "%" };
  }
  const bases = new Set(tokens.filter((t) => t.kind === "number").map((t) => (t as { base: Base }).base));
  bases.delete("decimal");
  if (bases.size === 1 && tokens.length === 1) {
    return { kind: "base", question: pretty, questionLabel: BASE_TITLES[[...bases][0]], answer: formatNumber(value.v),
      answerLabel: "Decimal", copyValue: plainNumber(value.v) };
  }
  return {
    kind: parser.containsPercent ? "percent" : "math",
    question: pretty,
    questionLabel: "Expression",
    answer: formatNumber(value.v),
    answerLabel: numberWords(value.v) ?? "Result",
    copyValue: plainNumber(value.v),
  };
}

// MARK: Percentage phrases

function percentPhrase(q: string, context: CalcContext): CalcResult | null {
  const of = /^(.+?)\s+(?:is what|as a|as)\s*(?:%|percent|percentage)\s+of\s+(.+)$/i.exec(q);
  if (of) {
    try {
      const catalog = catalogFor(context);
      const a = new Parser(tokenize(of[1], catalog)).parse();
      const b = new Parser(tokenize(of[2], catalog)).parse();
      if (a.unit?.dimension !== b.unit?.dimension || b.v === 0) return null;
      const percent = (a.unit && b.unit ? inUnit(a, b.unit) : a.v) / b.v * 100;
      return { kind: "percent", question: `${of[1]} of ${of[2]}`, questionLabel: "Percentage",
        answer: formatNumber(percent) + "%", answerLabel: "Percent", copyValue: plainNumber(percent) + "%" };
    } catch {
      return null;
    }
  }
  const whatIs = /^what(?:'s| is)\s+(.+?)\??$/i.exec(q);
  if (whatIs) return expression(whatIs[1], context);
  return null;
}

// MARK: Time zones

const CITY_ZONES: Record<string, string> = {
  istanbul: "Europe/Istanbul", ankara: "Europe/Istanbul", izmir: "Europe/Istanbul", turkey: "Europe/Istanbul", türkiye: "Europe/Istanbul",
  london: "Europe/London", uk: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", amsterdam: "Europe/Amsterdam",
  madrid: "Europe/Madrid", rome: "Europe/Rome", vienna: "Europe/Vienna", zurich: "Europe/Zurich", stockholm: "Europe/Stockholm",
  oslo: "Europe/Oslo", helsinki: "Europe/Helsinki", athens: "Europe/Athens", moscow: "Europe/Moscow", kyiv: "Europe/Kyiv",
  lisbon: "Europe/Lisbon", dublin: "Europe/Dublin", warsaw: "Europe/Warsaw", prague: "Europe/Prague", budapest: "Europe/Budapest",
  dubai: "Asia/Dubai", riyadh: "Asia/Riyadh", doha: "Asia/Qatar", tehran: "Asia/Tehran", baku: "Asia/Baku", tbilisi: "Asia/Tbilisi",
  delhi: "Asia/Kolkata", mumbai: "Asia/Kolkata", bangalore: "Asia/Kolkata", india: "Asia/Kolkata", karachi: "Asia/Karachi",
  bangkok: "Asia/Bangkok", singapore: "Asia/Singapore", "hong kong": "Asia/Hong_Kong", shanghai: "Asia/Shanghai",
  beijing: "Asia/Shanghai", china: "Asia/Shanghai", tokyo: "Asia/Tokyo", japan: "Asia/Tokyo", seoul: "Asia/Seoul",
  jakarta: "Asia/Jakarta", manila: "Asia/Manila", sydney: "Australia/Sydney", melbourne: "Australia/Melbourne",
  auckland: "Pacific/Auckland", cairo: "Africa/Cairo", lagos: "Africa/Lagos", nairobi: "Africa/Nairobi",
  johannesburg: "Africa/Johannesburg", "new york": "America/New_York", nyc: "America/New_York", boston: "America/New_York",
  washington: "America/New_York", miami: "America/New_York", toronto: "America/Toronto", chicago: "America/Chicago",
  dallas: "America/Chicago", houston: "America/Chicago", denver: "America/Denver", phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles", la: "America/Los_Angeles", "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles",
  seattle: "America/Los_Angeles", vancouver: "America/Vancouver", "mexico city": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo", "são paulo": "America/Sao_Paulo", "buenos aires": "America/Argentina/Buenos_Aires",
  honolulu: "Pacific/Honolulu", utc: "UTC", gmt: "UTC", est: "America/New_York", edt: "America/New_York",
  pst: "America/Los_Angeles", pdt: "America/Los_Angeles", cst: "America/Chicago", cet: "Europe/Paris", trt: "Europe/Istanbul",
  jst: "Asia/Tokyo", ist: "Asia/Kolkata",
};

function titleCase(s: string): string {
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function timeQuery(q: string, context: CalcContext): CalcResult | null {
  const match = /^(?:time in|time at|current time in|saat kaç\s+)\s*(.+)$/i.exec(q) ?? /^(.+?)\s+(?:time|saati)$/i.exec(q);
  if (!match) return null;
  const place = match[1].trim().toLowerCase();
  const zone = CITY_ZONES[place];
  if (!zone) return null;
  const now = context.now ?? new Date();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(now);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).format(now);
  const label = place.length <= 3 ? place.toUpperCase() : titleCase(place);
  return { kind: "time", question: `Time in ${label}`, questionLabel: zone.replace(/_/g, " "), answer: time, answerLabel: day, copyValue: time };
}

// MARK: Dates

const DATE_BASES: Record<string, number> = {
  today: 0, now: 0, bugün: 0, bugun: 0, şimdi: 0, simdi: 0, tomorrow: 1, yarın: 1, yarin: 1, yesterday: -1, dün: -1, dun: -1,
};
const DATE_UNITS: Record<string, "day" | "week" | "month" | "year" | "hour" | "minute"> = {
  d: "day", day: "day", days: "day", gün: "day", gun: "day",
  w: "week", week: "week", weeks: "week", hafta: "week",
  month: "month", months: "month", ay: "month",
  y: "year", year: "year", years: "year", yıl: "year", yil: "year", sene: "year",
  h: "hour", hour: "hour", hours: "hour", saat: "hour",
  min: "minute", minute: "minute", minutes: "minute", dakika: "minute",
};

function shiftDate(date: Date, amount: number, unit: string): Date {
  const d = new Date(date);
  switch (unit) {
    case "day": d.setDate(d.getDate() + amount); break;
    case "week": d.setDate(d.getDate() + amount * 7); break;
    case "month": d.setMonth(d.getMonth() + amount); break;
    case "year": d.setFullYear(d.getFullYear() + amount); break;
    case "hour": d.setHours(d.getHours() + amount); break;
    case "minute": d.setMinutes(d.getMinutes() + amount); break;
  }
  return d;
}

function dateQuery(q: string, context: CalcContext): CalcResult | null {
  const now = context.now ?? new Date();
  const lower = q.toLowerCase().trim();
  let date: Date | null = null;
  let withTime = false;
  const relative = /^(\p{L}+)(?:\s*([+-])\s*(\d+)\s*(\p{L}+))?$/u.exec(lower);
  const fromNow = /^(?:in\s+)?(\d+)\s*(\p{L}+)\s+(from now|later|sonra|ago|önce|once)$/u.exec(lower) ?? /^in\s+(\d+)\s*(\p{L}+)()$/u.exec(lower);
  if (relative && DATE_BASES[relative[1]] !== undefined) {
    if (!relative[2] && DATE_BASES[relative[1]] === 0) return null; // "today" alone is a search
    date = shiftDate(now, DATE_BASES[relative[1]], "day");
    if (relative[2]) {
      const unit = DATE_UNITS[relative[4]];
      if (!unit) return null;
      date = shiftDate(date, (relative[2] === "-" ? -1 : 1) * Number(relative[3]), unit);
      withTime = unit === "hour" || unit === "minute";
    }
  } else if (fromNow) {
    const unit = DATE_UNITS[fromNow[2]];
    if (!unit) return null;
    const sign = ["ago", "önce", "once"].includes(fromNow[3]) ? -1 : 1;
    date = shiftDate(now, sign * Number(fromNow[1]), unit);
    withTime = unit === "hour" || unit === "minute";
  }
  if (!date) return null;
  const answer = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  const relativeLabel = days === 0 ? "Today" : days > 0 ? `In ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} ago`;
  return { kind: "date", question: q.trim(), questionLabel: "Date", answer, answerLabel: relativeLabel,
    copyValue: withTime ? date.toISOString() : date.toISOString().slice(0, 10) };
}

/** The card for a root-search query, or null when the text isn't a calculation. */
export function evaluate(rawQuery: string, context: CalcContext = {}): CalcResult | null {
  const query = rawQuery.trim();
  if (!query || query.length > 300) return null;
  // Quick reject: plain words without digits or currency/units are searches ("spotify").
  const hasDigit = /\d/.test(query);
  if (!hasDigit && !/^(?:time|current time|saat)\b|\btime$|\bsaati$/i.test(query) && !/\b(to|in)\b/i.test(query) &&
      !/[+\-−]/.test(query) && !/^(?:pi|π|tau)\b/i.test(query)) {
    return null;
  }
  try {
    return timeQuery(query, context) ?? dateQuery(query, context) ?? percentPhrase(query, context) ?? expression(query, context);
  } catch {
    return null;
  }
}

/** Exchange rates as units per 1 USD, from Coinbase's public endpoint (as in the macOS app). */
export async function fetchRates(): Promise<Record<string, number>> {
  const response = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD");
  if (!response.ok) throw new Error(`rates: HTTP ${response.status}`);
  const json = (await response.json()) as { data: { rates: Record<string, string> } };
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(json.data.rates)) {
    const n = Number(value);
    if (n > 0 && /^[A-Z]{3,5}$/.test(code)) rates[code] = n;
  }
  rates.USD = 1;
  return rates;
}
