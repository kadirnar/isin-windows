// Launcher themes, ported from Isin/Core/Theme.swift.
export interface Theme {
  id: string;
  name: string;
  isDark: boolean;
  background: string;
  /** 0…1: how much of the blurred desktop shows through. */
  translucency: number;
  text: string;
  secondaryText: string;
  accent: string;
  selection: string;
  separator: string;
}

export const THEMES: Theme[] = [
  { id: "isin-dark", name: "Işın Dark", isDark: true, background: "#1C1C1F", translucency: 0.18, text: "#F2F2F5",
    secondaryText: "#9A9AA3", accent: "#FF6363", selection: "#FFFFFF1A", separator: "#FFFFFF14" },
  { id: "isin-light", name: "Işın Light", isDark: false, background: "#F7F7F8", translucency: 0.2, text: "#1B1B1F",
    secondaryText: "#6E6E78", accent: "#FF6363", selection: "#0000000F", separator: "#0000001A" },
  { id: "midnight", name: "Midnight", isDark: true, background: "#0F1424", translucency: 0.12, text: "#E6EAF7",
    secondaryText: "#8590B0", accent: "#6C8CFF", selection: "#6C8CFF2E", separator: "#FFFFFF12" },
  { id: "forest", name: "Forest", isDark: true, background: "#121A16", translucency: 0.15, text: "#E3EFE7",
    secondaryText: "#86A092", accent: "#4CC38A", selection: "#4CC38A2B", separator: "#FFFFFF12" },
  { id: "sand", name: "Sand", isDark: false, background: "#F6F1E7", translucency: 0.15, text: "#2B2620",
    secondaryText: "#857A6A", accent: "#D9822B", selection: "#D9822B24", separator: "#0000001A" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** #RRGGBBAA → rgba() so the alpha survives in every engine. */
function css(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = hexToRgb(h);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

export function resolveTheme(id: string): Theme {
  if (id === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return THEMES[dark ? 0 : 1];
  }
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(theme: Theme, opaque = false) {
  const root = document.documentElement.style;
  const [r, g, b] = hexToRgb(theme.background);
  const alpha = opaque ? 1 : 1 - theme.translucency;
  root.setProperty("--bg", `rgba(${r}, ${g}, ${b}, ${alpha})`);
  root.setProperty("--bg-solid", theme.background);
  root.setProperty("--text", theme.text);
  root.setProperty("--text-2", theme.secondaryText);
  root.setProperty("--accent", theme.accent);
  root.setProperty("--selection", css(theme.selection));
  root.setProperty("--separator", css(theme.separator));
  root.setProperty("--panel", theme.isDark ? "rgba(40, 40, 46, 0.98)" : "rgba(255, 255, 255, 0.98)");
  root.setProperty("--field", theme.isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)");
  root.setProperty("--kbd", theme.isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.07)");
  root.colorScheme = theme.isDark ? "dark" : "light";
}
