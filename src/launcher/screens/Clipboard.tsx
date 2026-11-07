// Clipboard History: text entries with preview, paste/copy, pin, delete (Rust records them in the background).
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { native, type ClipEntry } from "../../native";
import type { Item, Section } from "../types";
import { ListScreen, Metadata, useNav } from "../ui";

function relative(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleString();
}

function kindIcon(text: string): string {
  if (/^https?:\/\/\S+$/.test(text.trim())) return "🔗";
  if (/^#?[0-9a-f]{6}$/i.test(text.trim())) return "🎨";
  if (/^[A-Za-z]:\\|^\\\\/.test(text.trim())) return "📁";
  return "📄";
}

export function ClipboardScreen() {
  const nav = useNav();
  const [entries, setEntries] = useState<ClipEntry[] | null>(null);

  const reload = useCallback(async () => setEntries(await native.clipboardHistory()), []);
  useEffect(() => {
    void reload();
    const off = listen("clipboard-changed", () => void reload());
    return () => void off.then((f) => f());
  }, [reload]);

  const sections = useCallback((): Section[] => {
    const list = entries ?? [];
    const toItem = (entry: ClipEntry): Item => {
      const firstLine = entry.text.trim().split(/\r?\n/)[0].slice(0, 120);
      const words = entry.text.trim().split(/\s+/).filter(Boolean).length;
      return {
        id: entry.id,
        title: firstLine || "(whitespace)",
        icon: kindIcon(entry.text),
        keywords: [entry.text.slice(0, 2000)],
        accessories: entry.pinned ? ["📌"] : undefined,
        detail: (
          <div className="detail">
            <pre className="detail-text">{entry.text.length > 20000 ? entry.text.slice(0, 20000) + "\n…" : entry.text}</pre>
            <Metadata
              rows={[
                ["Content type", "Text"],
                ["Characters", entry.text.length.toLocaleString()],
                ["Words", words.toLocaleString()],
                ["Times copied", String(entry.count)],
                ["Last copied", relative(entry.lastCopied)],
                ["First copied", relative(entry.firstCopied)],
              ]}
            />
          </div>
        ),
        actions: [
          { id: "paste", title: "Paste to Active App", icon: "📋", shortcut: "Enter", run: () => native.paste(entry.text) },
          {
            id: "copy", title: "Copy to Clipboard", icon: "📄", shortcut: "Ctrl+Enter",
            run: async () => {
              await native.copy(entry.text);
              await nav.closeMainWindow();
            },
          },
          {
            id: "pin", title: entry.pinned ? "Unpin Entry" : "Pin Entry", icon: "📌", shortcut: "Ctrl+Shift+P",
            run: async () => {
              await native.clipboardPin(entry.id, !entry.pinned);
              await reload();
            },
          },
          {
            id: "delete", title: "Delete Entry", icon: "🗑️", shortcut: "Ctrl+Backspace", destructive: true,
            run: async () => {
              await native.clipboardDelete(entry.id);
              await reload();
            },
          },
          {
            id: "clear", title: "Delete All Entries", icon: "🧹", shortcut: "Ctrl+Shift+Backspace", destructive: true,
            confirm: { title: "Delete all clipboard entries?", message: "Pinned entries are kept. This can't be undone.", button: "Delete All" },
            run: async () => {
              await native.clipboardClear();
              await reload();
            },
          },
        ],
      };
    };
    const pinned = list.filter((e) => e.pinned).map(toItem);
    const rest = list.filter((e) => !e.pinned).map(toItem);
    return [
      { title: pinned.length ? "Pinned" : undefined, items: pinned },
      { title: pinned.length ? "Recent" : undefined, items: rest },
    ];
  }, [entries, nav, reload]);

  return (
    <ListScreen
      title="Clipboard History"
      icon="📋"
      placeholder="Type to filter entries…"
      sections={sections}
      filter
      detail
      isLoading={entries === null}
      empty={<div className="empty">Copy some text and it shows up here.</div>}
    />
  );
}
