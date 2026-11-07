// The Settings window: General, Extensions, AI, Clipboard, Advanced, About.
import { listen } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { score } from "../core/fuzzy";
import { checkKey } from "../core/openrouter";
import { MODEL_CHOICES, settingsStore, usageStore, type Settings as SettingsShape } from "../core/state";
import { useStore } from "../core/store";
import { applyTheme, resolveTheme, THEMES } from "../core/themes";
import { builtInCommands } from "../launcher/commands";
import { native } from "../native";

const PAGES = [
  { id: "general", title: "General", icon: "⚙️" },
  { id: "extensions", title: "Extensions", icon: "🧩" },
  { id: "ai", title: "AI", icon: "✨" },
  { id: "clipboard", title: "Clipboard", icon: "📋" },
  { id: "advanced", title: "Advanced", icon: "🛠️" },
  { id: "about", title: "About", icon: "ℹ️" },
] as const;
type PageId = (typeof PAGES)[number]["id"];

function update(patch: Partial<SettingsShape>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

function Row({ label, info, children }: { label: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">{label}</div>
      <div className="settings-control">
        {children}
        {info && <div className="settings-info">{info}</div>}
      </div>
    </div>
  );
}

// MARK: Hotkey recorder

const CODE_NAMES: Record<string, string> = { Space: "Space", Backquote: "Backquote", Period: "Period", Comma: "Comma", Slash: "Slash",
  Semicolon: "Semicolon", Quote: "Quote", BracketLeft: "BracketLeft", BracketRight: "BracketRight", Backslash: "Backslash",
  Minus: "Minus", Equal: "Equal", Enter: "Enter", Tab: "Tab" };

function accelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (CODE_NAMES[e.code]) key = CODE_NAMES[e.code];
  if (!key) return null;
  const isFunctionKey = /^F\d+$/.test(key);
  if (mods.length === 0 && !isFunctionKey) return null;
  return [...mods, key].join("+");
}

function HotkeyRecorder({ value, onChange }: { value: string; onChange: (v: string) => Promise<void> }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className={`hotkey ${recording ? "recording" : ""}`}
        onClick={() => { setRecording(true); setError(null); }}
        onBlur={() => setRecording(false)}
        onKeyDown={async (e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === "Escape") { setRecording(false); return; }
          const acc = accelerator(e);
          if (!acc) return;
          setRecording(false);
          try {
            await onChange(acc);
          } catch (err) {
            setError(String(err));
          }
        }}
      >
        {recording ? "Press a shortcut…" : value.split("+").map((k, i) => <kbd key={i}>{k}</kbd>)}
      </button>
      {error && <div className="settings-error">{error}</div>}
    </div>
  );
}

// MARK: Pages

function GeneralPage() {
  const settings = useStore(settingsStore);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);
  return (
    <>
      <Row label="Launch Işın at login">
        <label className="checkbox">
          <input type="checkbox" checked={!!autostart} disabled={autostart === null} onChange={async (e) => {
            if (e.target.checked) await enableAutostart(); else await disableAutostart();
            setAutostart(await autostartEnabled());
          }} />
          Start in the background when you sign in
        </label>
      </Row>
      <Row label="Işın Hotkey" info="Alt+Space by default. PowerToys Run uses the same one; turn one of them off.">
        <HotkeyRecorder value={settings.hotkey} onChange={async (acc) => {
          await native.setHotkey(acc);
          update({ hotkey: acc });
        }} />
      </Row>
      <Row label="Theme">
        <div className="theme-grid">
          {[{ id: "system", name: "System", isDark: false, background: "#888", accent: "#FF6363" }, ...THEMES].map((theme) => (
            <button key={theme.id} className={`theme-swatch ${settings.theme === theme.id ? "selected" : ""}`} onClick={() => update({ theme: theme.id })}>
              <span className="swatch" style={{ background: theme.id === "system" ? "linear-gradient(135deg, #1C1C1F 50%, #F7F7F8 50%)" : theme.background }}>
                <span className="swatch-accent" style={{ background: theme.accent }} />
              </span>
              {theme.name}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Pop to Root Search" info="Showing Işın after this long starts again from an empty search.">
        <select value={settings.popToRootAfter} onChange={(e) => update({ popToRootAfter: Number(e.target.value) })}>
          <option value={0}>Immediately</option>
          <option value={10}>After 10 seconds</option>
          <option value={30}>After 30 seconds</option>
          <option value={90}>After 90 seconds</option>
          <option value={300}>After 5 minutes</option>
          <option value={86400}>Never</option>
        </select>
      </Row>
      <Row label="Escape Key Behavior">
        <select value={settings.escapeBehavior} onChange={(e) => update({ escapeBehavior: e.target.value as SettingsShape["escapeBehavior"] })}>
          <option value="pop-back-or-close">Navigate back or close window</option>
          <option value="close-and-pop-to-root">Close window and pop to root</option>
        </select>
      </Row>
      <Row label="Root Search Sensitivity" info="High shows only close matches.">
        <select value={settings.sensitivity} onChange={(e) => update({ sensitivity: e.target.value as SettingsShape["sensitivity"] })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </Row>
      <Row label="Favorites">
        <label className="checkbox">
          <input type="checkbox" checked={settings.showFavorites} onChange={(e) => update({ showFavorites: e.target.checked })} />
          Show favorites in root search
        </label>
      </Row>
    </>
  );
}

function ExtensionsPage() {
  const settings = useStore(settingsStore);
  const [filter, setFilter] = useState("");
  const commands = useMemo(() => builtInCommands(), []);
  const groups = useMemo(() => {
    const visible = filter ? commands.filter((c) => score(filter, c.title) !== null || score(filter, c.subtitle) !== null) : commands;
    const map = new Map<string, typeof commands>();
    for (const c of visible) map.set(c.subtitle, [...(map.get(c.subtitle) ?? []), c]);
    return [...map.entries()];
  }, [commands, filter]);
  const disabled = new Set(settings.disabledCommands);
  return (
    <>
      <input className="settings-search" placeholder="Search commands…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <table className="ext-table">
        <thead><tr><th>Name</th><th>Alias</th><th>Enabled</th></tr></thead>
        <tbody>
          {groups.map(([group, list]) => (
            <Fragment key={group}>
              <tr className="ext-group"><td colSpan={3}>{group}</td></tr>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{typeof c.icon === "string" ? c.icon : "glyph" in c.icon ? c.icon.glyph : ""} {c.title}</td>
                  <td>
                    <input className="alias-input" placeholder="Add alias" value={settings.aliases[c.id] ?? ""} onChange={(e) => {
                      const aliases = { ...settings.aliases };
                      if (e.target.value.trim()) aliases[c.id] = e.target.value.trim(); else delete aliases[c.id];
                      update({ aliases });
                    }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={!disabled.has(c.id)} onChange={(e) => {
                      const next = new Set(disabled);
                      if (e.target.checked) next.delete(c.id); else next.add(c.id);
                      update({ disabledCommands: [...next] });
                    }} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AIPage() {
  const settings = useStore(settingsStore);
  const [status, setStatus] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const models = (value: string) => (MODEL_CHOICES.includes(value) ? MODEL_CHOICES : [value, ...MODEL_CHOICES]);
  const modelSelect = (key: "chatModel" | "quickAIModel" | "commandModel") => (
    <div className="model-row">
      <select value={settings[key]} onChange={(e) => update({ [key]: e.target.value })}>
        {models(settings[key]).map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input className="model-custom" placeholder="or any OpenRouter model id" onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLInputElement).value.includes("/")) {
          update({ [key]: (e.target as HTMLInputElement).value.trim() });
          (e.target as HTMLInputElement).value = "";
        }
      }} />
    </div>
  );
  return (
    <>
      <Row label="OpenRouter API Key" info={<>Stored only on this PC in Işın's data folder. Get one at <a href="#" onClick={(e) => { e.preventDefault(); void native.open("https://openrouter.ai/settings/keys"); }}>openrouter.ai/settings/keys</a>.</>}>
        <div className="key-row">
          <input type={show ? "text" : "password"} value={settings.openRouterKey} placeholder="sk-or-v1-…" spellCheck={false}
            onChange={(e) => { update({ openRouterKey: e.target.value.trim() }); setStatus(null); }} />
          <button className="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
          <button className="button" disabled={!settings.openRouterKey} onClick={async () => {
            setStatus("Checking…");
            try {
              const info = await checkKey(settings.openRouterKey);
              setStatus(`✓ Key works${info.usage !== undefined ? ` · $${info.usage.toFixed(2)} used` : ""}${info.limit ? ` of $${info.limit}` : ""}`);
            } catch (e) {
              setStatus(`✗ ${(e as Error).message}`);
            }
          }}>Check</button>
        </div>
        {status && <div className="settings-info">{status}</div>}
      </Row>
      <Row label="AI Chat Model">{modelSelect("chatModel")}</Row>
      <Row label="Quick AI Model" info="Used when you press Tab in root search.">{modelSelect("quickAIModel")}</Row>
      <Row label="AI Commands Model" info="Fix Spelling, Summarize, Translate…">{modelSelect("commandModel")}</Row>
      <Row label="Creativity" info="Temperature sent to the model.">
        <select value={settings.aiTemperature} onChange={(e) => update({ aiTemperature: Number(e.target.value) })}>
          <option value={0.2}>Low</option>
          <option value={0.7}>Medium</option>
          <option value={1.0}>High</option>
        </select>
      </Row>
    </>
  );
}

function ClipboardPage() {
  const settings = useStore(settingsStore);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void native.clipboardHistory().then((h) => setCount(h.length));
  }, []);
  return (
    <>
      <Row label="Recording" info="Copies that password managers mark as private are never recorded.">
        <label className="checkbox">
          <input type="checkbox" checked={!settings.clipboardPaused} onChange={async (e) => {
            update({ clipboardPaused: !e.target.checked });
            await native.clipboardSetPaused(!e.target.checked);
          }} />
          Keep a history of copied text (up to 1,000 entries)
        </label>
      </Row>
      <Row label="History" info={count === null ? "" : `${count} entries stored`}>
        <button className="button danger" onClick={async () => {
          if (!window.confirm("Delete all clipboard entries except pinned ones? This can't be undone.")) return;
          await native.clipboardClear();
          setCount((await native.clipboardHistory()).length);
        }}>Clear History…</button>
      </Row>
    </>
  );
}

function AdvancedPage() {
  const settings = useStore(settingsStore);
  const [dir, setDir] = useState("");
  useEffect(() => void native.dataDir().then(setDir), []);
  return (
    <>
      <Row label="Data Folder" info="Settings, snippets, quicklinks, chats and clipboard history are plain JSON files here.">
        <div className="key-row">
          <code className="path">{dir}</code>
          <button className="button" onClick={() => void native.open(dir)}>Open</button>
        </div>
      </Row>
      <Row label="Local Currency" info="Bare amounts like “100 usd” convert to this.">
        <input className="short" value={settings.localCurrency} maxLength={5} onChange={(e) => update({ localCurrency: e.target.value.toUpperCase() })} />
      </Row>
      <Row label="REM/EM to Pixel" info="Used by “2rem to px”.">
        <input className="short" type="number" value={settings.remToPx} onChange={(e) => update({ remToPx: Number(e.target.value) || 16 })} />
      </Row>
      <Row label="Usage Data" info="Favorites, suggestions and search history.">
        <button className="button" onClick={() => {
          if (window.confirm("Reset suggestions and search history? Favorites are kept.")) {
            usageStore.set((u) => ({ ...u, frecency: { items: {}, queries: {} }, history: [] }));
          }
        }}>Reset Suggestions…</button>
      </Row>
    </>
  );
}

function AboutPage() {
  return (
    <div className="about">
      <div className="about-logo">✦</div>
      <h1>Işın for Windows</h1>
      <p>Version 0.1.0</p>
      <p>A keyboard launcher in the spirit of Raycast. Windows port of <a href="#" onClick={(e) => { e.preventDefault(); void native.open("https://github.com/kadirnar/isin"); }}>kadirnar/isin</a>, built with Tauri.</p>
      <p><a href="#" onClick={(e) => { e.preventDefault(); void native.open("https://github.com/kadirnar/isin-windows"); }}>github.com/kadirnar/isin-windows</a></p>
    </div>
  );
}

export function SettingsWindow() {
  const settings = useStore(settingsStore);
  const initial = (window.location.hash.slice(1) as PageId) || "general";
  const [page, setPage] = useState<PageId>(PAGES.some((p) => p.id === initial) ? initial : "general");

  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme), true);
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    const off = listen<string>("settings-page", (e) => {
      if (PAGES.some((p) => p.id === e.payload)) setPage(e.payload as PageId);
    });
    return () => void off.then((f) => f());
  }, []);

  const current = PAGES.find((p) => p.id === page)!;
  return (
    <div className="settings">
      <nav className="settings-nav">
        {PAGES.map((p) => (
          <button key={p.id} className={`settings-nav-item ${p.id === page ? "selected" : ""}`} onClick={() => setPage(p.id)}>
            <span>{p.icon}</span> {p.title}
          </button>
        ))}
      </nav>
      <main className="settings-page">
        <h2>{current.title}</h2>
        {page === "general" && <GeneralPage />}
        {page === "extensions" && <ExtensionsPage />}
        {page === "ai" && <AIPage />}
        {page === "clipboard" && <ClipboardPage />}
        {page === "advanced" && <AdvancedPage />}
        {page === "about" && <AboutPage />}
      </main>
    </div>
  );
}
