// Typed wrappers over the Rust commands in src-tauri/src.
import { invoke } from "@tauri-apps/api/core";

export interface AppEntry {
  id: string;
  name: string;
  target: string;
  path: string;
  kind: "shortcut" | "store";
  icon?: string | null;
}

export interface ClipEntry {
  id: string;
  text: string;
  firstCopied: number;
  lastCopied: number;
  count: number;
  pinned: boolean;
}

export const native = {
  readStore: (name: string) => invoke<string | null>("read_store", { name }),
  writeStore: (name: string, content: string) => invoke<void>("write_store", { name, content }),
  dataDir: () => invoke<string>("data_dir_path"),

  listApps: () => invoke<AppEntry[]>("list_apps"),

  hideLauncher: () => invoke<void>("hide_launcher"),
  showLauncher: () => invoke<void>("show_launcher"),
  openSettings: (page?: string) => invoke<void>("open_settings", { page }),
  quit: () => invoke<void>("quit_app"),
  setHotkey: (accelerator: string) => invoke<void>("set_hotkey", { accelerator }),
  currentHotkey: () => invoke<string>("current_hotkey"),

  clipboardHistory: () => invoke<ClipEntry[]>("clipboard_history"),
  clipboardDelete: (id: string) => invoke<void>("clipboard_delete", { id }),
  clipboardClear: () => invoke<void>("clipboard_clear"),
  clipboardPin: (id: string, pinned: boolean) => invoke<void>("clipboard_pin", { id, pinned }),
  clipboardSetPaused: (paused: boolean) => invoke<void>("clipboard_set_paused", { paused }),
  copy: (text: string) => invoke<void>("copy_text", { text }),
  readClipboard: () => invoke<string | null>("read_clipboard_text"),
  paste: (text: string, cursorBack = 0) => invoke<void>("paste_text", { text, cursorBack }),
  selectedText: () => invoke<string | null>("get_selected_text"),

  runSystem: (id: string) => invoke<string | null>("run_system", { id }),
  open: (target: string, admin = false) => invoke<void>("shell_open", { target, admin }),
  showInExplorer: (path: string) => invoke<void>("show_in_explorer", { path }),
  windowLayout: (layout: string) => invoke<void>("window_layout", { layout }),
  runCommandLine: (command: string) => invoke<void>("run_command_line", { command }),
};
