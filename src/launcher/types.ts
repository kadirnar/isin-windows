import type { ReactNode } from "react";

/** An emoji / short text, an image URL (app icons), or a colored glyph tile. */
export type IconSpec = string | { src: string } | { glyph: string; tint: string };

export interface Action {
  id: string;
  title: string;
  icon?: IconSpec;
  /** "Enter", "Ctrl+Enter", "Ctrl+Shift+C", "Ctrl+Backspace"… */
  shortcut?: string;
  destructive?: boolean;
  /** Ask before running (title of the confirmation). */
  confirm?: { title: string; message?: string; button?: string };
  run: () => void | Promise<void>;
}

export interface Item {
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconSpec;
  /** Small tags on the right (alias, counts). */
  accessories?: string[];
  /** Right-most label: "Command", "Application", "Quicklink"… */
  type?: string;
  keywords?: string[];
  actions: Action[];
  /** Right-hand preview in detail lists. */
  detail?: ReactNode;
  /** Custom full-width row (the calculator card). */
  card?: ReactNode;
}

export interface Section {
  title?: string;
  items: Item[];
}

export interface Toast {
  style: "success" | "failure" | "loading";
  title: string;
  message?: string;
}

export interface Screen {
  key: string;
  title: string;
  icon?: IconSpec;
  render: () => ReactNode;
}

export interface Nav {
  push: (screen: Screen) => void;
  pop: () => void;
  popToRoot: () => void;
  hide: () => Promise<void>;
  toast: (toast: Toast | null, durationMs?: number) => void;
  confirm: (options: { title: string; message?: string; button?: string; destructive?: boolean }) => Promise<boolean>;
  depth: number;
  /** Close and hand focus back to the previous app (after paste/open). */
  closeMainWindow: () => Promise<void>;
}
