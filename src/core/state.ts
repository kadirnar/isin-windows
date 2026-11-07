// App-wide persisted state: settings, usage, snippets, quicklinks, AI chats.
import { emptyFrecency, type FrecencyData } from "./frecency";
import { Store } from "./store";

export interface Settings {
  hotkey: string;
  theme: string; // theme id or "system"
  popToRootAfter: number; // seconds; 0 = immediately
  escapeBehavior: "pop-back-or-close" | "close-and-pop-to-root";
  sensitivity: "low" | "medium" | "high";
  showFavorites: boolean;
  openRouterKey: string;
  chatModel: string;
  quickAIModel: string;
  commandModel: string;
  aiTemperature: number;
  localCurrency: string;
  remToPx: number;
  clipboardPaused: boolean;
  disabledCommands: string[];
  aliases: Record<string, string>;
}

export const MODEL_CHOICES = [
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol",
  "openai/gpt-6-luna",
  "google/gemini-3.8-flash",
  "google/gemini-4-argon",
];

function defaultCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? "US";
    const map: Record<string, string> = {
      TR: "TRY", US: "USD", GB: "GBP", JP: "JPY", CH: "CHF", CA: "CAD", AU: "AUD", IN: "INR", CN: "CNY", KR: "KRW",
      BR: "BRL", MX: "MXN", RU: "RUB", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", AE: "AED", SA: "SAR",
    };
    return map[region] ?? (["DE", "FR", "IT", "ES", "NL", "AT", "BE", "FI", "IE", "PT", "GR"].includes(region) ? "EUR" : "USD");
  } catch {
    return "USD";
  }
}

export const settingsStore = new Store<Settings>("settings", {
  hotkey: "Alt+Space",
  theme: "system",
  popToRootAfter: 90,
  escapeBehavior: "pop-back-or-close",
  sensitivity: "high",
  showFavorites: true,
  openRouterKey: "",
  chatModel: MODEL_CHOICES[0],
  quickAIModel: MODEL_CHOICES[0],
  commandModel: MODEL_CHOICES[0],
  aiTemperature: 0.7,
  localCurrency: defaultCurrency(),
  remToPx: 16,
  clipboardPaused: false,
  disabledCommands: [],
  aliases: {},
});

export interface UsageState {
  frecency: FrecencyData;
  favorites: string[];
  history: string[];
}

export const usageStore = new Store<UsageState>("usage", { frecency: emptyFrecency(), favorites: [], history: [] });

export interface Snippet {
  id: string;
  name: string;
  text: string;
  keyword: string;
  created: number;
}

export const snippetStore = new Store<Snippet[]>("snippets", [], false);

export interface Quicklink {
  id: string;
  name: string;
  link: string;
  alias: string;
  /** Emoji or app id shown as the icon. */
  icon?: string;
}

const searchLinks: Quicklink[] = [
  { id: "ql-google", name: "Search Google", link: "https://www.google.com/search?q={query}", alias: "g", icon: "🔎" },
  { id: "ql-ddg", name: "Search DuckDuckGo", link: "https://duckduckgo.com/?q={query}", alias: "ddg", icon: "🦆" },
  { id: "ql-youtube", name: "Search YouTube", link: "https://www.youtube.com/results?search_query={query}", alias: "yt", icon: "▶️" },
  { id: "ql-github", name: "Search GitHub", link: "https://github.com/search?q={query}", alias: "gh", icon: "🐙" },
  { id: "ql-wikipedia", name: "Search Wikipedia", link: "https://en.wikipedia.org/w/index.php?search={query}", alias: "wiki", icon: "📚" },
  { id: "ql-translate", name: "Google Translate", link: "https://translate.google.com/?sl=auto&tl=tr&text={query}", alias: "tr", icon: "🌐" },
  { id: "ql-maps", name: "Search Google Maps", link: "https://www.google.com/maps/search/{query}", alias: "maps", icon: "🗺️" },
];

export const quicklinkStore = new Store<Quicklink[]>("quicklinks", searchLinks, false);

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  updated: number;
}

export const chatStore = new Store<Chat[]>("chats", [], false);

export const ratesStore = new Store<{ fetched: number; rates: Record<string, number> | null }>("rates", { fetched: 0, rates: null });

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
