import { describe, expect, it } from "vitest";
import { evaluate, numberWords } from "./calculator";
import { bestScore, normalize, score, words } from "./fuzzy";
import { emptyFrecency, queryBoost, record, top, usageBoost } from "./frecency";
import { expandPlaceholders } from "./placeholders";

describe("fuzzy", () => {
  it("normalizes Turkish letters and diacritics", () => {
    expect(normalize("İstanbul")).toBe("istanbul");
    expect(normalize("Işık Çağrı")).toBe("isik cagri");
  });

  it("splits camelCase and punctuation", () => {
    expect(words("toggleHiddenFiles")).toEqual(["toggle", "Hidden", "Files"]);
    expect(words("Search-Menu bar")).toEqual(["Search", "Menu", "bar"]);
  });

  it("ranks exact > prefix > word prefix > acronym > substring", () => {
    const exact = score("calculator", "Calculator")!;
    const prefix = score("calc", "Calculator")!;
    const word = score("hist", "Clipboard History")!;
    const acronym = score("ch", "Clipboard History")!;
    const sub = score("board", "Clipboard History")!;
    expect(exact).toBe(1);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(acronym);
    expect(acronym).toBeGreaterThan(sub);
  });

  it("matches tokens and scattered letters, rejects noise", () => {
    expect(score("tog hid", "Toggle Hidden Files")).not.toBeNull();
    expect(score("gst", "Get Started")).not.toBeNull();
    expect(score("xyz", "Clipboard History")).toBeNull();
    expect(score("isin", "Işın Settings")).toBeGreaterThan(0.8);
  });

  it("weights fields", () => {
    expect(bestScore("snip", [["Search Snippets", 1], ["snippets", 0.5]])).toBeCloseTo(score("snip", "Search Snippets")!);
  });
});

describe("frecency", () => {
  it("boosts used items and learns queries", () => {
    let data = emptyFrecency();
    data = record(data, "clipboard", "cl", 0);
    data = record(data, "clipboard", "cl", 0);
    data = record(data, "calc", "", 0);
    expect(usageBoost(data, "clipboard", 0)).toBeGreaterThan(usageBoost(data, "calc", 0));
    expect(queryBoost(data, "clipboard", "cl")).toBeCloseTo(2 / 3);
    expect(queryBoost(data, "clipboard", "c")).toBeGreaterThan(0);
    expect(top(data, 1, 0)).toEqual(["clipboard"]);
  });

  it("decays over time", () => {
    const data = record(emptyFrecency(), "a", "", 0);
    expect(usageBoost(data, "a", 7 * 86_400_000)).toBeLessThan(usageBoost(data, "a", 0));
  });
});

describe("calculator", () => {
  const ctx = { rates: { USD: 1, EUR: 0.5, TRY: 40 }, localCurrency: "TRY", now: new Date(2026, 10, 7, 12, 0) };
  const answer = (q: string) => evaluate(q, ctx)?.answer;

  it("does math", () => {
    expect(answer("2+2*3")).toBe("8");
    expect(answer("(1+2)^2")).toBe("9");
    expect(answer("2^10")).toBe("1,024");
    expect(answer("sqrt(16) + 5!")).toBe("124");
    expect(answer("10/4")).toBe("2.5");
    expect(answer("2pi")).toBe("6.2831853072");
    expect(evaluate("6*7", ctx)?.answerLabel).toBe("Forty-Two");
  });

  it("does percentages", () => {
    expect(answer("100 + 10%")).toBe("110");
    expect(answer("20% of 150")).toBe("30");
    expect(answer("30 is what % of 150")).toBe("20%");
    expect(answer("10 % 3")).toBe("1");
  });

  it("converts units", () => {
    expect(answer("10 km to mi")).toBe("6.2137 mi");
    expect(answer("100 c to f")).toBe("212°F");
    expect(answer("1 gb in mb")).toBe("1,000 MB");
    expect(answer("5 in in cm")).toBe("12.7 cm");
    expect(answer("10 km")).toBe("6.2137 mi");
    expect(answer("1 km + 500 m")).toBe("1.5 km");
    expect(answer("2 rem to px")).toBe("32 px");
  });

  it("converts currencies", () => {
    expect(answer("100 usd to try")).toBe("4,000.00 TRY");
    expect(answer("100 usd")).toBe("4,000.00 TRY");
    expect(answer("$10 to eur")).toBe("5.00 EUR");
    expect(answer("usd to eur")).toBe("0.50 EUR");
    expect(evaluate("100 usd to eur", { localCurrency: "TRY" })?.needsRates).toBe(true);
  });

  it("converts bases", () => {
    expect(answer("255 to hex")).toBe("FF");
    expect(answer("0xff")).toBe("255");
    expect(answer("10 to binary")).toBe("1010");
  });

  it("leaves searches alone", () => {
    for (const q of ["spotify", "42", "4k", "e", "10%", "chrome", "today"]) expect(evaluate(q, ctx)).toBeNull();
  });

  it("knows times and dates", () => {
    expect(evaluate("time in tokyo", ctx)?.kind).toBe("time");
    expect(evaluate("today + 1 week", ctx)?.answer).toContain("14 November 2026");
    expect(evaluate("bugün + 1 hafta", ctx)?.answer).toContain("14 November 2026");
    expect(evaluate("3 days ago", ctx)?.answer).toContain("4 November 2026");
  });

  it("spells numbers", () => {
    expect(numberWords(1_234_567)).toBe("One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven");
  });
});

describe("placeholders", () => {
  const now = new Date(2026, 10, 7, 9, 5, 3);
  it("expands dates, clipboard and modifiers", () => {
    const result = expandPlaceholders("Hi {clipboard | uppercase} on {date format=\"yyyy-MM-dd\"}{cursor}!", { clipboard: "kadir", now });
    expect(result.text).toBe("Hi KADIR on 2026-11-07!");
    expect(result.cursorBack).toBe(1);
  });

  it("supports offsets and arguments", () => {
    expect(expandPlaceholders('{date format="dd.MM.yyyy" offset="+1w"}', { now }).text).toBe("14.11.2026");
    expect(expandPlaceholders('{argument name="who" default="world"}', { now }).text).toBe("world");
    expect(expandPlaceholders("{query | percent-encode}", { now, query: "a b" }).text).toBe("a%20b");
  });
});
