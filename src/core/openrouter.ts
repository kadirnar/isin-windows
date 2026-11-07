// OpenRouter chat completions with streaming (after IsinKit/OpenRouter). The key never leaves this machine except
// to openrouter.ai; it is stored in %APPDATA%\Isin\settings.json or read from the OPENROUTER_API_KEY build env.
import type { ChatMessage } from "./state";

const BASE = "https://openrouter.ai/api/v1";

export class OpenRouterError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function describe(status: number, message: string): string {
  switch (status) {
    case 401: return `OpenRouter rejected the API key (401). ${message}`;
    case 402: return "OpenRouter credits are exhausted (402). Top up at openrouter.ai/settings/credits.";
    case 429: return "Rate limited by OpenRouter (429). Try again in a moment.";
    default: return `OpenRouter error ${status}: ${message}`;
  }
}

export function resolveKey(settingsKey: string): string {
  return settingsKey.trim() || (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() || "";
}

export interface StreamOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onText: (delta: string, full: string) => void;
}

/** Streams a completion, calling `onText` for every delta. Resolves with the full text. */
export async function streamChat(options: StreamOptions): Promise<string> {
  if (!options.apiKey) throw new OpenRouterError("No OpenRouter API key. Add one in Settings → AI.");
  let response: Response;
  try {
    response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/kadirnar/isin-windows",
        "X-Title": "Isin",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        temperature: options.temperature,
      }),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new OpenRouterError(`Network error: ${(error as Error).message}`);
  }
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    let message = body.slice(0, 400);
    try {
      message = JSON.parse(body).error?.message ?? message;
    } catch {
      // keep raw text
    }
    throw new OpenRouterError(describe(response.status, message), response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue; // SSE comments (": OPENROUTER PROCESSING") and blank lines
      const data = line.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const chunk = JSON.parse(data);
        if (chunk.error) throw new OpenRouterError(`Model provider error: ${chunk.error.message ?? "unknown"}`);
        const delta: string = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          options.onText(delta, full);
        }
      } catch (error) {
        if (error instanceof OpenRouterError) throw error;
      }
    }
  }
  if (!full) throw new OpenRouterError("The model returned an empty response.");
  return full;
}

export async function checkKey(apiKey: string): Promise<{ label?: string; usage?: number; limit?: number | null }> {
  const response = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new OpenRouterError(describe(response.status, await response.text()), response.status);
  const json = await response.json();
  return json.data ?? {};
}

/** Built-in AI commands (a subset of Işın's 19 presets). `{selection}` is the selected text or clipboard. */
export const AI_COMMANDS: Array<{ id: string; title: string; icon: string; prompt: string }> = [
  { id: "fix-spelling", title: "Fix Spelling and Grammar", icon: "✍️",
    prompt: "Fix the spelling and grammar of the text below. Keep the language, tone and formatting. Reply with the corrected text only.\n\n{selection}" },
  { id: "improve-writing", title: "Improve Writing", icon: "✨",
    prompt: "Improve the writing of the text below: clearer, more fluent, same language and meaning. Reply with the improved text only.\n\n{selection}" },
  { id: "summarize", title: "Summarize", icon: "📝",
    prompt: "Summarize the text below in its own language as a few short bullet points.\n\n{selection}" },
  { id: "explain", title: "Explain This in Simple Terms", icon: "💡",
    prompt: "Explain the following in simple terms, in the language it is written in.\n\n{selection}" },
  { id: "make-shorter", title: "Make Shorter", icon: "✂️",
    prompt: "Make the text below shorter while keeping its meaning and language. Reply with the text only.\n\n{selection}" },
  { id: "make-longer", title: "Make Longer", icon: "➕",
    prompt: "Expand the text below with more detail, same language and tone. Reply with the text only.\n\n{selection}" },
  { id: "tone-professional", title: "Change Tone to Professional", icon: "👔",
    prompt: "Rewrite the text below in a professional tone, same language. Reply with the text only.\n\n{selection}" },
  { id: "tone-friendly", title: "Change Tone to Friendly", icon: "😊",
    prompt: "Rewrite the text below in a friendly tone, same language. Reply with the text only.\n\n{selection}" },
  { id: "translate-en", title: "Translate to English", icon: "🇬🇧",
    prompt: "Translate the text below to English. Reply with the translation only.\n\n{selection}" },
  { id: "translate-tr", title: "Translate to Turkish", icon: "🇹🇷",
    prompt: "Translate the text below to Turkish. Reply with the translation only.\n\n{selection}" },
  { id: "find-bugs", title: "Find Bugs in Code", icon: "🐞",
    prompt: "Find bugs in the code below. List each problem with a short fix.\n\n```\n{selection}\n```" },
  { id: "explain-code", title: "Explain Code Step by Step", icon: "🧑‍💻",
    prompt: "Explain the code below step by step.\n\n```\n{selection}\n```" },
];

export const QUICK_AI_SYSTEM =
  "You are Işın's Quick AI on Windows. Answer concisely in the language of the question. Use Markdown when it helps.";
