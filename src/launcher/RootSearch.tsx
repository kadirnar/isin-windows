// Root search: favorites, suggestions, commands, applications, quicklinks, snippets by keyword, the inline
// calculator and fallback commands. Ranking = fuzzy score + frecency + per-query learning (as in RootSearch.swift).
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { evaluate, fetchRates, type CalcResult } from "../core/calculator";
import { record, queryBoost, top, usageBoost } from "../core/frecency";
import { bestScore, normalize } from "../core/fuzzy";
import { native, type AppEntry } from "../native";
import { builtInCommands, type Command } from "./commands";
import { AnswerScreen } from "./screens/AI";
import { openQuicklink, pasteSnippet, quicklinkNeedsQuery } from "./screens/Snippets";
import {
  quicklinkStore, ratesStore, settingsStore, snippetStore, usageStore, useStoreValue,
} from "./stores";
import type { Action, Item, Nav, Section } from "./types";
import { ListScreen, useNav } from "./ui";

const SENSITIVITY = { low: 0, medium: 0.28, high: 0.36 } as const;

function useApps(): AppEntry[] {
  const [apps, setApps] = useState<AppEntry[]>([]);
  useEffect(() => {
    const load = () => native.listApps().then(setApps).catch(console.error);
    void load();
    const offs = [listen("apps-updated", load), listen("launcher-shown", load)];
    return () => offs.forEach((o) => void o.then((f) => f()));
  }, []);
  return apps;
}

function useRates() {
  const state = useStoreValue(ratesStore);
  const refresh = useCallback(async () => {
    try {
      const rates = await fetchRates();
      ratesStore.set({ fetched: Date.now(), rates });
    } catch (e) {
      console.warn(e);
    }
  }, []);
  useEffect(() => {
    void ratesStore.ready.then(() => {
      if (Date.now() - ratesStore.get().fetched > 3_600_000) void refresh();
    });
  }, [refresh]);
  return { rates: state.rates ?? undefined, refresh };
}

function CalculatorCard({ result }: { result: CalcResult }) {
  return (
    <div className="calc">
      <div className="calc-side">
        <div className="calc-value">{result.question}</div>
        <div className="calc-label">{result.questionLabel}</div>
      </div>
      <div className="calc-arrow">→</div>
      <div className="calc-side">
        <div className="calc-value">{result.answer}</div>
        <div className="calc-label">{result.answerLabel}</div>
      </div>
    </div>
  );
}

interface Candidate {
  item: Item;
  /** Fields to score: [text, weight]. */
  fields: Array<[string | undefined, number]>;
  alias?: string;
  section: "command" | "app" | "quicklink";
}

function recordUse(id: string, query: string) {
  usageStore.set((u) => ({ ...u, frecency: record(u.frecency, id, query) }));
}

function toggleFavorite(id: string) {
  usageStore.set((u) => ({ ...u, favorites: u.favorites.includes(id) ? u.favorites.filter((f) => f !== id) : [...u.favorites, id] }));
}

function withUsage(item: Item, query: string): Item {
  return {
    ...item,
    actions: item.actions.map((a, i) =>
      i === 0 ? { ...a, run: async () => { recordUse(item.id, query); await a.run(); } } : a,
    ),
  };
}

function commonActions(id: string, favorites: string[], nav: Nav): Action[] {
  const isFavorite = favorites.includes(id);
  return [
    { id: "favorite", title: isFavorite ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", shortcut: "Ctrl+Shift+F",
      run: () => {
        toggleFavorite(id);
        nav.toast({ style: "success", title: isFavorite ? "Removed from favorites" : "Added to favorites" }, 1500);
      } },
    { id: "alias", title: "Configure Alias…", icon: "🏷️", shortcut: "Ctrl+Shift+,", run: () => native.openSettings("extensions") },
  ];
}

export function RootSearch({ query, onQueryChange, inputRef }: {
  query: string; onQueryChange: (q: string) => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const nav = useNav();
  const settings = useStoreValue(settingsStore);
  const usage = useStoreValue(usageStore);
  const quicklinks = useStoreValue(quicklinkStore);
  const snippets = useStoreValue(snippetStore);
  const apps = useApps();
  const { rates, refresh: refreshRates } = useRates();
  const commands = useMemo(() => builtInCommands(), []);

  const commandItem = useCallback((command: Command): Item => ({
    id: command.id,
    title: command.title,
    subtitle: command.subtitle,
    icon: command.icon,
    keywords: command.keywords,
    type: "Command",
    accessories: settings.aliases[command.id] ? [settings.aliases[command.id]] : undefined,
    actions: [
      { id: "run", title: "Open Command", icon: "↗️", shortcut: "Enter", confirm: command.confirm, destructive: !!command.confirm, run: () => command.run(nav) },
      ...(command.extra?.(nav) ?? []),
      ...commonActions(command.id, usage.favorites, nav),
    ],
  }), [nav, settings.aliases, usage.favorites]);

  const appItem = useCallback((app: AppEntry): Item => ({
    id: app.id,
    title: app.name,
    subtitle: app.kind === "store" ? "Microsoft Store" : undefined,
    icon: app.icon ? { src: app.icon } : "🗔",
    type: "Application",
    accessories: settings.aliases[app.id] ? [settings.aliases[app.id]] : undefined,
    actions: [
      { id: "open", title: "Open Application", icon: "↗️", shortcut: "Enter", run: async () => {
        await native.open(app.target);
        await nav.closeMainWindow();
      } },
      { id: "admin", title: "Run as Administrator", icon: "🛡️", shortcut: "Ctrl+Shift+Enter", run: async () => {
        await native.open(app.target, true);
        await nav.closeMainWindow();
      } },
      ...(app.kind === "shortcut" ? [{ id: "reveal", title: "Show in File Explorer", icon: "📁", shortcut: "Ctrl+Enter", run: async () => {
        await native.showInExplorer(app.target);
        await nav.closeMainWindow();
      } }] : []),
      { id: "copy-path", title: "Copy Path", icon: "📄", shortcut: "Ctrl+Shift+C", run: async () => {
        await native.copy(app.target);
        nav.toast({ style: "success", title: "Copied path" }, 1500);
      } },
      ...commonActions(app.id, usage.favorites, nav),
    ],
  }), [nav, settings.aliases, usage.favorites]);

  const quicklinkItem = useCallback((link: (typeof quicklinks)[number], argument?: string): Item => ({
    id: "ql:" + link.id + (argument !== undefined ? ":arg" : ""),
    title: argument !== undefined ? `${link.name}: ${argument}` : link.name,
    subtitle: argument !== undefined ? undefined : link.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48),
    icon: link.icon ?? "🔗",
    type: "Quicklink",
    accessories: link.alias ? [link.alias] : undefined,
    actions: [
      { id: "open", title: "Open Quicklink", icon: "↗️", shortcut: "Enter", run: () => openQuicklink(link, nav, argument) },
      ...commonActions("ql:" + link.id, usage.favorites, nav),
    ],
  }), [nav, usage.favorites]);

  const candidates = useMemo((): Candidate[] => {
    const disabled = new Set(settings.disabledCommands);
    const list: Candidate[] = [];
    for (const command of commands) {
      if (disabled.has(command.id)) continue;
      list.push({ item: commandItem(command), section: "command", alias: settings.aliases[command.id],
        fields: [[command.title, 1], [command.subtitle, 0.6], ...(command.keywords ?? []).map((k) => [k, 0.8] as [string, number])] });
    }
    for (const app of apps) {
      list.push({ item: appItem(app), section: "app", alias: settings.aliases[app.id], fields: [[app.name, 1]] });
    }
    for (const link of quicklinks) {
      list.push({ item: quicklinkItem(link), section: "quicklink", alias: link.alias, fields: [[link.name, 1]] });
    }
    return list;
  }, [commands, apps, quicklinks, settings.disabledCommands, settings.aliases, commandItem, appItem, quicklinkItem]);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.item.id, c.item])), [candidates]);

  const sections = useCallback((rawQuery: string): Section[] => {
    const q = rawQuery.trim();
    if (!q) {
      const result: Section[] = [];
      const favorites = settings.showFavorites ? usage.favorites.map((id) => byId.get(id)).filter((x): x is Item => !!x) : [];
      if (favorites.length) result.push({ title: "Favorites", items: favorites.map((i) => withUsage(i, "")) });
      const shown = new Set(favorites.map((f) => f.id));
      const suggested = top(usage.frecency, 12).map((id) => byId.get(id)).filter((x): x is Item => !!x && !shown.has(x.id)).slice(0, 6);
      const fallback = ["clipboard-history", "ai-chat", "snippets-search", "isin-settings"].map((id) => byId.get(id)).filter((x): x is Item => !!x);
      const suggestions = suggested.length ? suggested : fallback;
      result.push({ title: "Suggestions", items: suggestions.map((i) => withUsage(i, "")) });
      suggestions.forEach((s) => shown.add(s.id));
      result.push({ title: "Commands", items: candidates.filter((c) => c.section === "command" && !shown.has(c.item.id)).slice(0, 30).map((c) => withUsage(c.item, "")) });
      return result;
    }

    const result: Section[] = [];
    // Inline calculator.
    const calc = evaluate(q, { rates, localCurrency: settings.localCurrency, remToPx: settings.remToPx });
    if (calc?.needsRates) void refreshRates();
    if (calc) {
      result.push({
        title: "Calculator",
        items: [{
          id: "calculator",
          title: calc.answer,
          card: <CalculatorCard result={calc} />,
          actions: [
            { id: "copy", title: "Copy Answer", icon: "📄", shortcut: "Enter", run: async () => {
              await native.copy(calc.copyValue);
              await nav.closeMainWindow();
            } },
            { id: "paste", title: "Paste Answer", icon: "📋", shortcut: "Ctrl+Enter", run: () => native.paste(calc.copyValue) },
            { id: "copy-question", title: "Copy Question", icon: "❓", shortcut: "Ctrl+Shift+C", run: () => native.copy(calc.question) },
          ],
        }],
      });
    }

    // "alias argument": quicklink with a query ("g cats"), or a command alias.
    const [first, ...restWords] = q.split(/\s+/);
    const rest = restWords.join(" ");
    const top_: Item[] = [];
    for (const link of quicklinks) {
      if (link.alias && normalize(link.alias) === normalize(first) && rest && quicklinkNeedsQuery(link)) {
        top_.push(withUsage(quicklinkItem(link, rest), q));
      }
    }
    // Snippet keywords.
    for (const snippet of snippets) {
      if (snippet.keyword && normalize(snippet.keyword) === normalize(q)) {
        top_.push({
          id: "snippet:" + snippet.id, title: snippet.name, subtitle: snippet.text.replace(/\s+/g, " ").slice(0, 60), icon: "✂️", type: "Snippet",
          accessories: [snippet.keyword],
          actions: [{ id: "paste", title: "Paste Snippet", icon: "📋", shortcut: "Enter", run: () => pasteSnippet(snippet, nav) }],
        });
      }
    }

    const threshold = SENSITIVITY[settings.sensitivity] ?? 0.36;
    const scored: Array<{ item: Item; score: number }> = [];
    for (const candidate of candidates) {
      let s = bestScore(q, candidate.fields);
      if (candidate.alias && normalize(candidate.alias) === normalize(q)) s = 1.2;
      else if (candidate.alias && s === null && normalize(candidate.alias).startsWith(normalize(q))) s = 0.7;
      if (s === null || s < threshold) continue;
      const boost = 0.12 * usageBoost(usage.frecency, candidate.item.id) + 0.25 * queryBoost(usage.frecency, candidate.item.id, q);
      scored.push({ item: candidate.item, score: s + boost + (candidate.section === "app" ? 0.01 : 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    const results = [...top_, ...scored.slice(0, 60).map((s) => withUsage(s.item, q))];
    if (results.length) result.push({ title: "Results", items: results });

    // Fallback commands.
    const fallbacks: Item[] = [
      {
        id: "fallback-ai", title: `Ask AI “${q}”`, icon: { glyph: "✨", tint: "#BF5AF2" }, type: "Tab",
        actions: [{ id: "ask", title: "Ask AI", icon: "✨", shortcut: "Enter", run: () => askAI(nav, q) }],
      },
      {
        id: "fallback-google", title: `Search Google for “${q}”`, icon: "🔎", type: "Fallback",
        actions: [{ id: "open", title: "Search Google", icon: "🔎", shortcut: "Enter", run: async () => {
          await native.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
          await nav.closeMainWindow();
        } }],
      },
      {
        id: "fallback-files", title: `Search Files for “${q}”`, icon: "📁", type: "Fallback",
        actions: [{ id: "open", title: "Search in File Explorer", icon: "📁", shortcut: "Enter", run: async () => {
          await native.open(`search-ms:query=${encodeURIComponent(q)}&crumb=location:${encodeURIComponent("%USERPROFILE%")}`);
          await nav.closeMainWindow();
        } }],
      },
    ];
    if (q.startsWith(">")) {
      fallbacks.unshift({
        id: "fallback-run", title: `Run “${q.slice(1).trim()}” in Terminal`, icon: "⌨️", type: "Fallback",
        actions: [{ id: "run", title: "Run Command", icon: "⌨️", shortcut: "Enter", run: async () => {
          await native.runCommandLine(q.slice(1).trim());
          await nav.closeMainWindow();
        } }],
      });
    }
    result.push({ title: `Use “${q}” with…`, items: fallbacks });
    return result;
  }, [candidates, byId, usage, settings, quicklinks, snippets, rates, refreshRates, nav, quicklinkItem]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, q: string) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (q.trim()) askAI(nav, q.trim());
      return true;
    }
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      void native.openSettings();
      return true;
    }
    if (e.key === "ArrowUp" && !q && usage.history.length) {
      e.preventDefault();
      onQueryChange(usage.history[0]);
      return true;
    }
    return false;
  };

  return (
    <ListScreen
      title="Işın"
      icon={{ glyph: "✦", tint: "#FF6363" }}
      placeholder="Search for apps and commands…"
      sections={sections}
      query={query}
      onQueryChange={onQueryChange}
      onKey={onKey}
      inputRef={inputRef}
      accessory={query.trim() ? <span className="hint">Ask AI <kbd>Tab</kbd></span> : undefined}
    />
  );
}

export function askAI(nav: Nav, question: string) {
  usageStore.set((u) => ({ ...u, history: [question, ...u.history.filter((h) => h !== question)].slice(0, 50) }));
  nav.push({
    key: "quick-ai-" + Date.now(),
    title: "Quick AI",
    icon: "✨",
    render: () => <AnswerScreen title="Quick AI" icon="✨" prompt={question} />,
  });
}
