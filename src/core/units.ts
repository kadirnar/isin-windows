// Unit catalog for the inline calculator (a compact take on IsinKit/Calculator/Units.swift).

export type Dimension =
  | "length" | "mass" | "volume" | "temperature" | "time" | "data" | "area" | "speed" | "currency" | "css" | "angle";

export interface UnitDef {
  id: string;
  symbol: string;
  singular: string;
  plural: string;
  dimension: Dimension;
  /** Base units per one of this unit (ignored when toBase/fromBase are set). */
  factor: number;
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
  aliases: string[];
}

function u(
  id: string, dimension: Dimension, factor: number, symbol: string, singular: string, plural: string, aliases: string[] = [],
): UnitDef {
  return { id, dimension, factor, symbol, singular, plural, aliases };
}

const STATIC_UNITS: UnitDef[] = [
  // length (base: metre)
  u("mm", "length", 0.001, "mm", "Millimeter", "Millimeters", ["millimeter", "millimeters", "millimetre", "millimetres", "milimetre"]),
  u("cm", "length", 0.01, "cm", "Centimeter", "Centimeters", ["centimeter", "centimeters", "centimetre", "centimetres", "santim", "santimetre"]),
  u("m", "length", 1, "m", "Meter", "Meters", ["meter", "meters", "metre", "metres"]),
  u("km", "length", 1000, "km", "Kilometer", "Kilometers", ["kilometer", "kilometers", "kilometre", "kilometres", "kms"]),
  u("in", "length", 0.0254, "in", "Inch", "Inches", ["inch", "inches", "″", "\""]),
  u("ft", "length", 0.3048, "ft", "Foot", "Feet", ["foot", "feet", "′", "'"]),
  u("yd", "length", 0.9144, "yd", "Yard", "Yards", ["yard", "yards"]),
  u("mi", "length", 1609.344, "mi", "Mile", "Miles", ["mile", "miles", "mil"]),
  u("nmi", "length", 1852, "nmi", "Nautical Mile", "Nautical Miles", ["nauticalmile", "nauticalmiles"]),
  // mass (base: kilogram)
  u("mg", "mass", 1e-6, "mg", "Milligram", "Milligrams", ["milligram", "milligrams"]),
  u("g", "mass", 0.001, "g", "Gram", "Grams", ["gram", "grams", "gr"]),
  u("kg", "mass", 1, "kg", "Kilogram", "Kilograms", ["kilogram", "kilograms", "kilo", "kilos"]),
  u("t", "mass", 1000, "t", "Tonne", "Tonnes", ["tonne", "tonnes", "ton", "tons", "ton"]),
  u("oz", "mass", 0.028349523125, "oz", "Ounce", "Ounces", ["ounce", "ounces"]),
  u("lb", "mass", 0.45359237, "lb", "Pound", "Pounds", ["lbs", "pound", "pounds"]),
  u("st", "mass", 6.35029318, "st", "Stone", "Stones", ["stone", "stones"]),
  // volume (base: litre)
  u("ml", "volume", 0.001, "ml", "Milliliter", "Milliliters", ["milliliter", "milliliters", "millilitre", "millilitres", "mL"]),
  u("l", "volume", 1, "L", "Liter", "Liters", ["liter", "liters", "litre", "litres", "lt", "litre"]),
  u("gal", "volume", 3.785411784, "gal", "Gallon", "Gallons", ["gallon", "gallons"]),
  u("qt", "volume", 0.946352946, "qt", "Quart", "Quarts", ["quart", "quarts"]),
  u("pt", "volume", 0.473176473, "pt", "Pint", "Pints", ["pint", "pints"]),
  u("cup", "volume", 0.2365882365, "cup", "Cup", "Cups", ["cups"]),
  u("floz", "volume", 0.0295735295625, "fl oz", "Fluid Ounce", "Fluid Ounces", ["fl.oz", "fluidounce", "fluidounces"]),
  u("tbsp", "volume", 0.01478676478125, "tbsp", "Tablespoon", "Tablespoons", ["tablespoon", "tablespoons"]),
  u("tsp", "volume", 0.00492892159375, "tsp", "Teaspoon", "Teaspoons", ["teaspoon", "teaspoons"]),
  // time (base: second)
  u("ms", "time", 0.001, "ms", "Millisecond", "Milliseconds", ["millisecond", "milliseconds"]),
  u("s", "time", 1, "s", "Second", "Seconds", ["sec", "secs", "second", "seconds", "saniye"]),
  u("min", "time", 60, "min", "Minute", "Minutes", ["mins", "minute", "minutes", "dakika", "dk"]),
  u("h", "time", 3600, "h", "Hour", "Hours", ["hr", "hrs", "hour", "hours", "saat", "sa"]),
  u("day", "time", 86400, "days", "Day", "Days", ["d", "days", "gün", "gun"]),
  u("week", "time", 604800, "weeks", "Week", "Weeks", ["wk", "wks", "weeks", "hafta"]),
  u("month", "time", 2629746, "months", "Month", "Months", ["mo", "months", "ay"]),
  u("year", "time", 31556952, "years", "Year", "Years", ["yr", "yrs", "years", "yıl", "yil", "sene"]),
  // data (base: byte)
  u("bit", "data", 0.125, "bit", "Bit", "Bits", ["bits"]),
  u("b", "data", 1, "B", "Byte", "Bytes", ["byte", "bytes"]),
  u("kb", "data", 1e3, "KB", "Kilobyte", "Kilobytes", ["kilobyte", "kilobytes"]),
  u("mb", "data", 1e6, "MB", "Megabyte", "Megabytes", ["megabyte", "megabytes"]),
  u("gb", "data", 1e9, "GB", "Gigabyte", "Gigabytes", ["gigabyte", "gigabytes"]),
  u("tb", "data", 1e12, "TB", "Terabyte", "Terabytes", ["terabyte", "terabytes"]),
  u("kib", "data", 1024, "KiB", "Kibibyte", "Kibibytes", ["kibibyte", "kibibytes"]),
  u("mib", "data", 1024 ** 2, "MiB", "Mebibyte", "Mebibytes", ["mebibyte", "mebibytes"]),
  u("gib", "data", 1024 ** 3, "GiB", "Gibibyte", "Gibibytes", ["gibibyte", "gibibytes"]),
  u("tib", "data", 1024 ** 4, "TiB", "Tebibyte", "Tebibytes", ["tebibyte", "tebibytes"]),
  // area (base: square metre)
  u("m2", "area", 1, "m²", "Square Meter", "Square Meters", ["m²", "sqm", "sq m"]),
  u("km2", "area", 1e6, "km²", "Square Kilometer", "Square Kilometers", ["km²", "sqkm"]),
  u("ft2", "area", 0.09290304, "ft²", "Square Foot", "Square Feet", ["ft²", "sqft"]),
  u("ha", "area", 1e4, "ha", "Hectare", "Hectares", ["hectare", "hectares", "hektar"]),
  u("acre", "area", 4046.8564224, "ac", "Acre", "Acres", ["acres", "ac"]),
  u("donum", "area", 1000, "dönüm", "Dönüm", "Dönüm", ["dönüm", "donum", "dekar"]),
  // speed (base: metre per second)
  u("mps", "speed", 1, "m/s", "Meter per Second", "Meters per Second", ["m/s"]),
  u("kmh", "speed", 1 / 3.6, "km/h", "Kilometer per Hour", "Kilometers per Hour", ["km/h", "kph", "kmph"]),
  u("mph", "speed", 0.44704, "mph", "Mile per Hour", "Miles per Hour", ["mi/h"]),
  u("knot", "speed", 0.514444, "kn", "Knot", "Knots", ["knots", "kn", "kt"]),
  // angle (base: degree)
  u("deg", "angle", 1, "°", "Degree", "Degrees", ["degree", "degrees", "°"]),
  u("rad", "angle", 180 / Math.PI, "rad", "Radian", "Radians", ["radian", "radians"]),
];

const TEMPERATURES: UnitDef[] = [
  { ...u("c", "temperature", 1, "°C", "Degree Celsius", "Degrees Celsius", ["°c", "celsius", "santigrat", "℃"]),
    toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
  { ...u("f", "temperature", 1, "°F", "Degree Fahrenheit", "Degrees Fahrenheit", ["°f", "fahrenheit", "℉"]),
    toBase: (v) => (v - 32) * (5 / 9) + 273.15, fromBase: (v) => (v - 273.15) * (9 / 5) + 32 },
  { ...u("k", "temperature", 1, "K", "Kelvin", "Kelvin", ["kelvin"]), toBase: (v) => v, fromBase: (v) => v },
];

export const CURRENCY_CODES = [
  "USD", "EUR", "TRY", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "HKD", "SGD", "SEK", "NOK", "DKK", "PLN",
  "CZK", "HUF", "RON", "BGN", "RUB", "UAH", "INR", "KRW", "BRL", "MXN", "ARS", "ZAR", "AED", "SAR", "QAR", "KWD",
  "ILS", "EGP", "THB", "IDR", "MYR", "PHP", "VND", "PKR", "AZN", "GEL", "KZT", "BTC", "ETH", "SOL", "USDT",
];

const CURRENCY_WORDS: Record<string, string> = {
  "$": "USD", dollar: "USD", dollars: "USD", dolar: "USD",
  "€": "EUR", euro: "EUR", euros: "EUR", avro: "EUR",
  "£": "GBP", sterlin: "GBP",
  "₺": "TRY", tl: "TRY", lira: "TRY",
  "¥": "JPY", yen: "JPY",
  bitcoin: "BTC",
};

/** Physical units first: a few ISO codes collide with unit names ("cup"). */
export const DEFAULT_TARGETS: Record<string, string> = {
  km: "mi", mi: "km", m: "ft", ft: "m", cm: "in", in: "cm", mm: "in", yd: "m",
  kg: "lb", lb: "kg", g: "oz", oz: "g", st: "kg", t: "lb",
  c: "f", f: "c", k: "c",
  l: "gal", gal: "l", ml: "floz", floz: "ml", cup: "ml", pt: "l", qt: "l", tbsp: "ml", tsp: "ml",
  kmh: "mph", mph: "kmh", mps: "kmh", knot: "kmh",
  kb: "b", mb: "kb", gb: "mb", tb: "gb", kib: "b", mib: "kib", gib: "mib", tib: "gib", bit: "b", b: "bit",
  ms: "s", s: "ms", min: "s", h: "min", day: "h", week: "day", month: "day", year: "day",
  m2: "ft2", ft2: "m2", km2: "m2", ha: "acre", acre: "ha", donum: "m2",
  deg: "rad", rad: "deg",
  px: "rem", rem: "px", em: "px", pt_css: "px",
};

let currencyNames: Intl.DisplayNames | null = null;
function currencyName(code: string): string {
  try {
    currencyNames ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return currencyNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export class UnitCatalog {
  readonly units: UnitDef[];
  private byName = new Map<string, UnitDef>();
  private byId = new Map<string, UnitDef>();

  constructor(rates: Record<string, number>, remToPx: number) {
    const css: UnitDef[] = [
      u("px", "css", 1, "px", "Pixel", "Pixels", ["pixel", "pixels"]),
      u("rem", "css", remToPx, "rem", "REM", "REM", []),
      u("em", "css", remToPx, "em", "EM", "EM", []),
      u("pt_css", "css", 4 / 3, "pt", "Point", "Points", ["point", "points"]),
    ];
    const currencies: UnitDef[] = Object.entries(rates)
      .filter(([, rate]) => rate > 0)
      .map(([code, rate]) => {
        const name = currencyName(code);
        return u("cur:" + code, "currency", 1 / rate, code, name, name, [code.toLowerCase()]);
      });
    this.units = [...STATIC_UNITS, ...TEMPERATURES, ...css, ...currencies];
    for (const unit of this.units) {
      this.byId.set(unit.id, unit);
      for (const name of [unit.id, unit.symbol, ...unit.aliases]) {
        const key = name.toLowerCase();
        // First definition wins ("cup" the volume beats CUP the Cuban peso; "pt" pint beats point).
        if (!this.byName.has(key)) this.byName.set(key, unit);
      }
    }
    // Case-sensitive overrides: "M" stays metres, "B" bytes; currency words and symbols.
    for (const [word, code] of Object.entries(CURRENCY_WORDS)) {
      const unit = this.byId.get("cur:" + code);
      if (unit && !this.byName.has(word)) this.byName.set(word, unit);
    }
  }

  unit(named: string): UnitDef | undefined {
    const key = named.trim().replace(/\s+/g, " ").toLowerCase();
    return this.byName.get(key) ?? this.byName.get(key.replace(/ /g, ""));
  }

  unitById(id: string): UnitDef | undefined {
    return this.byId.get(id);
  }
}

export function toBase(unit: UnitDef, value: number): number {
  return unit.toBase ? unit.toBase(value) : value * unit.factor;
}

export function fromBase(unit: UnitDef, value: number): number {
  return unit.fromBase ? unit.fromBase(value) : value / unit.factor;
}

export function unitName(unit: UnitDef, amount: number): string {
  return Math.abs(amount) === 1 ? unit.singular : unit.plural;
}
