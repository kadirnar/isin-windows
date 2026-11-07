// Launcher building blocks: search bar, sectioned list (with optional detail pane), action panel, footer.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { score } from "../core/fuzzy";
import { settingsStore } from "../core/state";
import type { Action, IconSpec, Item, Nav, Section, Toast } from "./types";

export const NavContext = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavContext);

export const ToastContext = createContext<Toast | null>(null);

// MARK: Small pieces

export function Icon({ spec, size = 20 }: { spec?: IconSpec; size?: number }) {
  if (!spec) return <span className="icon" style={{ width: size, height: size }} />;
  if (typeof spec === "string") {
    return (
      <span className="icon emoji" style={{ width: size, height: size, fontSize: size * 0.8 }}>
        {spec}
      </span>
    );
  }
  if ("src" in spec) return <img className="icon" src={spec.src} width={size} height={size} alt="" draggable={false} />;
  return (
    <span className="icon tile" style={{ width: size, height: size, background: spec.tint, fontSize: size * 0.62 }}>
      {spec.glyph}
    </span>
  );
}

const KEY_LABELS: Record<string, string> = {
  Enter: "↵", Backspace: "⌫", Delete: "Del", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Tab: "⇥", Shift: "⇧", Ctrl: "Ctrl", Alt: "Alt",
};

export function Kbd({ shortcut }: { shortcut: string }) {
  return (
    <span className="kbd-group">
      {shortcut.split("+").map((key, i) => (
        <kbd key={i}>{KEY_LABELS[key] ?? key}</kbd>
      ))}
    </span>
  );
}

/** Does a keyboard event match "Ctrl+Shift+C"-style text? */
export function matches(event: KeyboardEvent | React.KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const want = new Set(parts.slice(0, -1));
  if (event.ctrlKey !== want.has("Ctrl") || event.shiftKey !== want.has("Shift") || event.altKey !== want.has("Alt")) return false;
  if (key.length === 1) return event.key.toUpperCase() === key.toUpperCase() || event.code === `Key${key.toUpperCase()}` || event.code === `Digit${key}`;
  if (key === ",") return event.key === ",";
  return event.key === key;
}

// MARK: Action panel

export function ActionPanel({ title, actions, onRun, onClose }: {
  title?: string; actions: Action[]; onRun: (a: Action) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const visible = useMemo(
    () => (query ? actions.filter((a) => score(query, a.title) !== null) : actions),
    [actions, query],
  );
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setIndex(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      if (visible[index]) onRun(visible[index]);
    } else if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else {
      const hit = actions.find((a) => a.shortcut && a.shortcut !== "Enter" && matches(e, a.shortcut));
      if (hit) {
        e.preventDefault();
        onRun(hit);
      }
    }
  };

  return (
    <div className="action-panel-backdrop" onMouseDown={onClose}>
      <div className="action-panel" onMouseDown={(e) => e.stopPropagation()}>
        {title && <div className="action-panel-title">{title}</div>}
        <div className="action-panel-list">
          {visible.map((action, i) => (
            <div
              key={action.id}
              className={`action-row ${i === index ? "selected" : ""} ${action.destructive ? "destructive" : ""}`}
              onMouseMove={() => setIndex(i)}
              onClick={() => onRun(action)}
            >
              <Icon spec={action.icon} size={16} />
              <span className="action-title">{action.title}</span>
              {action.shortcut && <Kbd shortcut={i === 0 && !query ? "Enter" : action.shortcut} />}
            </div>
          ))}
          {visible.length === 0 && <div className="action-empty">No matching actions</div>}
        </div>
        <input
          ref={input}
          className="action-search"
          placeholder="Search for actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// MARK: Footer

export function Footer({ title, icon, primary, hasActions, onActions }: {
  title: string; icon?: IconSpec; primary?: string; hasActions: boolean; onActions: () => void;
}) {
  const toast = useContext(ToastContext);
  return (
    <div className="footer">
      <div className="footer-left">
        {toast ? (
          <span className={`toast ${toast.style}`}>
            <span className="toast-dot" />
            <span className="toast-title">{toast.title}</span>
            {toast.message && <span className="toast-message">{toast.message}</span>}
          </span>
        ) : (
          <>
            <Icon spec={icon} size={16} />
            <span className="footer-title">{title}</span>
          </>
        )}
      </div>
      <div className="footer-right">
        {primary && (
          <span className="footer-action">
            {primary} <Kbd shortcut="Enter" />
          </span>
        )}
        {hasActions && (
          <>
            <span className="footer-separator" />
            <span className="footer-action" onClick={onActions}>
              Actions <Kbd shortcut="Ctrl+K" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// MARK: Search bar

export function SearchBar({ value, onChange, placeholder, onKeyDown, inputRef, accessory, canGoBack, onBack, autoFocus = true }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  accessory?: ReactNode;
  canGoBack: boolean;
  onBack: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="search-bar" data-tauri-drag-region>
      {canGoBack && (
        <button className="back-button" onClick={onBack} tabIndex={-1} aria-label="Back">
          ←
        </button>
      )}
      <input
        ref={inputRef}
        className="search-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
      />
      {accessory}
    </div>
  );
}

// MARK: List screen

export interface ListScreenProps {
  title: string;
  icon?: IconSpec;
  placeholder?: string;
  /** Sections for the current search text. When `filter` is true the list filters items itself. */
  sections: (query: string) => Section[];
  filter?: boolean;
  isLoading?: boolean;
  detail?: boolean;
  empty?: ReactNode;
  accessory?: ReactNode;
  /** Initial search text (root search remembers it). */
  query?: string;
  onQueryChange?: (q: string) => void;
  /** Extra key handling before the list's own (return true when handled). */
  onKey?: (e: React.KeyboardEvent<HTMLInputElement>, query: string, selected: Item | undefined) => boolean;
  /** Actions shown in the panel when the list is empty. */
  emptyActions?: Action[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Called when the selection changes (detail screens load previews lazily). */
  onSelect?: (item: Item | undefined) => void;
}

export function filterSections(sections: Section[], query: string): Section[] {
  if (!query.trim()) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items
        .map((item) => {
          const fields: Array<[string | undefined, number]> = [[item.title, 1], [item.subtitle, 0.7], ...(item.keywords ?? []).map((k) => [k, 0.8] as [string, number])];
          let best: number | null = null;
          for (const [text, weight] of fields) {
            if (!text) continue;
            const s2 = score(query, text);
            if (s2 !== null && (best === null || s2 * weight > best)) best = s2 * weight;
          }
          return { item, s: best };
        })
        .filter((x) => x.s !== null)
        .sort((a, b) => b.s! - a.s!)
        .map((x) => x.item),
    }))
    .filter((s) => s.items.length > 0);
}

export function ListScreen(props: ListScreenProps) {
  const nav = useNav();
  const [query, setQuery] = useState(props.query ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = props.inputRef ?? ownRef;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.query !== undefined && props.query !== query) setQuery(props.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.query]);

  const sections = useMemo(() => {
    const raw = props.sections(query);
    return props.filter ? filterSections(raw, query) : raw;
  }, [props.sections, props.filter, query]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Keep the selection on the same item when the list refreshes; otherwise select the first row.
  const selectedIndex = Math.max(0, flat.findIndex((i) => i.id === selectedId));
  const selected = flat[selectedIndex];
  useEffect(() => {
    if (!flat.some((i) => i.id === selectedId)) setSelectedId(flat[0]?.id ?? null);
  }, [flat, selectedId]);
  useEffect(() => {
    setSelectedId(flat[0]?.id ?? null);
    listRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => props.onSelect?.(selected), [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const row = listRef.current?.querySelector(".row.selected") as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const actions = selected?.actions ?? props.emptyActions ?? [];

  const run = async (action: Action) => {
    setPanelOpen(false);
    if (action.confirm) {
      const ok = await nav.confirm({ ...action.confirm, destructive: action.destructive });
      if (!ok) return;
    }
    try {
      await action.run();
    } catch (error) {
      nav.toast({ style: "failure", title: String((error as Error)?.message ?? error) }, 4000);
    }
  };

  const changeQuery = (q: string) => {
    setQuery(q);
    props.onQueryChange?.(q);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKey?.(e, query, selected)) return;
    if (e.key === "Escape" && query && !e.ctrlKey && settingsStore.get().escapeBehavior !== "close-and-pop-to-root") {
      e.preventDefault();
      changeQuery("");
      return;
    }
    const move = (delta: number) => {
      e.preventDefault();
      if (flat.length === 0) return;
      const next = Math.min(flat.length - 1, Math.max(0, selectedIndex + delta));
      setSelectedId(flat[next].id);
    };
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) return move(1);
    if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) return move(-1);
    if (e.key === "PageDown") return move(8);
    if (e.key === "PageUp") return move(-8);
    if (e.ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (actions.length) setPanelOpen(true);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (actions[0]) void run(actions[0]);
      return;
    }
    if (e.key === "Enter" && e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (actions[1]) void run(actions[1]);
      return;
    }
    const hit = actions.find((a) => a.shortcut && a.shortcut !== "Enter" && a.shortcut !== "Ctrl+Enter" && matches(e, a.shortcut));
    if (hit) {
      e.preventDefault();
      void run(hit);
    }
  };

  const list = (
    <div className="list" ref={listRef}>
      {props.isLoading && <div className="loading-bar" />}
      {sections.map((section, si) => (
        <div key={(section.title ?? "") + si} className="section">
          {section.title && <div className="section-title">{section.title}</div>}
          {section.items.map((item) => {
            const isSelected = item.id === selected?.id;
            if (item.card) {
              return (
                <div key={item.id} className={`row card-row ${isSelected ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => item.actions[0] && void run(item.actions[0])}>
                  {item.card}
                </div>
              );
            }
            return (
              <div
                key={item.id}
                className={`row ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => item.actions[0] && void run(item.actions[0])}
              >
                <Icon spec={item.icon} />
                <span className="row-title">{item.title}</span>
                {item.subtitle && item.subtitle !== item.title && <span className="row-subtitle">{item.subtitle}</span>}
                <span className="row-spacer" />
                {item.accessories?.map((a, i) => (
                  <span key={i} className="accessory">{a}</span>
                ))}
                {item.type && !props.detail && <span className="row-type">{item.type}</span>}
              </div>
            );
          })}
        </div>
      ))}
      {flat.length === 0 && !props.isLoading && (props.empty ?? <div className="empty">No Results</div>)}
    </div>
  );

  return (
    <div className="screen">
      <SearchBar
        value={query}
        onChange={changeQuery}
        placeholder={props.placeholder ?? "Search…"}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
        accessory={props.accessory}
        canGoBack={nav.depth > 1}
        onBack={nav.pop}
      />
      <div className="content">
        {props.detail ? (
          <div className="split">
            <div className="split-list">{list}</div>
            <div className="split-detail">{selected?.detail}</div>
          </div>
        ) : (
          list
        )}
      </div>
      <Footer
        title={props.title}
        icon={props.icon}
        primary={actions[0]?.title}
        hasActions={actions.length > 0}
        onActions={() => setPanelOpen(true)}
      />
      {panelOpen && (
        <ActionPanel
          title={selected?.title}
          actions={actions}
          onRun={(a) => void run(a)}
          onClose={() => {
            setPanelOpen(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

// MARK: Detail metadata

export function Metadata({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="metadata">
      {rows.map(([label, value]) => (
        <div key={label} className="metadata-row">
          <span className="metadata-label">{label}</span>
          <span className="metadata-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

// MARK: Confirm dialog

export function ConfirmDialog({ title, message, button, destructive, onResult }: {
  title: string; message?: string; button?: string; destructive?: boolean; onResult: (ok: boolean) => void;
}) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), []);
  return (
    <div className="dialog-backdrop" onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onResult(false); }
    }}>
      <div className="dialog">
        <div className="dialog-title">{title}</div>
        {message && <div className="dialog-message">{message}</div>}
        <div className="dialog-buttons">
          <button className="button" onClick={() => onResult(false)}>Cancel</button>
          <button ref={ok} className={`button ${destructive ? "danger" : "primary"}`} onClick={() => onResult(true)}>
            {button ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// MARK: Forms

export interface FieldSpec {
  id: string;
  label: string;
  kind?: "text" | "textarea";
  placeholder?: string;
  info?: string;
  required?: boolean;
}

export function FormScreen({ title, icon, fields, initial, submitTitle, onSubmit }: {
  title: string;
  icon?: IconSpec;
  fields: FieldSpec[];
  initial?: Record<string, string>;
  submitTitle: string;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}) {
  const nav = useNav();
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = async () => {
    const missing = fields.find((f) => f.required && !values[f.id]?.trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    try {
      await onSubmit(values);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      nav.pop();
    }
  };

  return (
    <div className="screen" onKeyDown={onKeyDown}>
      <div className="search-bar form-header" data-tauri-drag-region>
        <button className="back-button" onClick={nav.pop} tabIndex={-1}>←</button>
        <span className="form-title">{title}</span>
      </div>
      <div className="content form">
        {fields.map((field, i) => (
          <label key={field.id} className="form-row">
            <span className="form-label">{field.label}</span>
            <span className="form-control">
              {field.kind === "textarea" ? (
                <textarea
                  ref={i === 0 ? first : undefined}
                  value={values[field.id] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  rows={7}
                  spellCheck={false}
                />
              ) : (
                <input
                  ref={i === 0 ? first : undefined}
                  value={values[field.id] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.ctrlKey && i === fields.length - 1) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  spellCheck={false}
                />
              )}
              {field.info && <span className="form-info">{field.info}</span>}
            </span>
          </label>
        ))}
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="footer">
        <div className="footer-left">
          <Icon spec={icon} size={16} />
          <span className="footer-title">{title}</span>
        </div>
        <div className="footer-right">
          <span className="footer-action" onClick={() => void submit()}>
            {submitTitle} <Kbd shortcut="Ctrl+Enter" />
          </span>
        </div>
      </div>
    </div>
  );
}
