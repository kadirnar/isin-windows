// The launcher window: a navigation stack over root search, toasts, confirmations, theme and show/hide behavior.
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyTheme, resolveTheme } from "../core/themes";
import { native } from "../native";
import { RootSearch } from "./RootSearch";
import { settingsStore, useStoreValue } from "./stores";
import type { Nav, Screen, Toast } from "./types";
import { ConfirmDialog, NavContext, ToastContext } from "./ui";

interface PendingConfirm {
  title: string;
  message?: string;
  button?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

export function Launcher() {
  const settings = useStoreValue(settingsStore);
  const [stack, setStack] = useState<Screen[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const hiddenAt = useRef<number | null>(null);
  const rootInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme));
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    void settingsStore.ready.then(() => native.clipboardSetPaused(settingsStore.get().clipboardPaused));
  }, [settings.clipboardPaused]);

  const popToRoot = useCallback(() => {
    setStack([]);
    setQuery("");
  }, []);

  const focusInput = () => {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".screen:last-of-type .search-input, .screen:last-of-type textarea, .screen:last-of-type input");
      if (!input || document.activeElement === input) return;
      input.focus();
      if (input.classList.contains("search-input")) input.select();
    }, 10);
  };

  const hide = useCallback(async () => {
    hiddenAt.current = Date.now();
    await native.hideLauncher();
  }, []);

  const nav: Nav = useMemo(() => ({
    depth: stack.length + 1,
    push: (screen) => setStack((s) => [...s, screen]),
    pop: () => setStack((s) => s.slice(0, -1)),
    popToRoot,
    hide,
    closeMainWindow: async () => {
      await hide();
      popToRoot();
    },
    toast: (next, duration) => {
      window.clearTimeout(toastTimer.current);
      setToast(next);
      if (next && duration) toastTimer.current = window.setTimeout(() => setToast(null), duration);
    },
    confirm: (options) => new Promise<boolean>((resolve) => setConfirm({ ...options, resolve })),
  }), [stack.length, popToRoot, hide]);

  // Show / hide from the hotkey.
  useEffect(() => {
    const offs = [
      listen("launcher-shown", () => {
        const timeout = settingsStore.get().popToRootAfter;
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current > timeout * 1000) popToRoot();
        hiddenAt.current = null;
        focusInput();
      }),
      listen("launcher-hidden", () => {
        hiddenAt.current = Date.now();
        setConfirm((c) => {
          c?.resolve(false);
          return null;
        });
      }),
    ];
    return () => offs.forEach((o) => void o.then((f) => f()));
  }, [popToRoot]);

  useEffect(focusInput, [stack.length]);

  // Escape: back, then close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        if (settingsStore.get().escapeBehavior === "close-and-pop-to-root") {
          void nav.closeMainWindow();
        } else if (e.ctrlKey) {
          popToRoot();
        } else if (stack.length > 0) {
          nav.pop();
        } else {
          void hide();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, stack.length, popToRoot, hide]);

  const top = stack[stack.length - 1];

  return (
    <NavContext.Provider value={nav}>
      <ToastContext.Provider value={toast}>
        <div className="launcher">
          {top ? (
            <div className="screen-host" key={top.key}>{top.render()}</div>
          ) : (
            <div className="screen-host" key="root">
              <RootSearch query={query} onQueryChange={setQuery} inputRef={rootInput} />
            </div>
          )}
          {confirm && (
            <ConfirmDialog
              {...confirm}
              onResult={(ok) => {
                confirm.resolve(ok);
                setConfirm(null);
                focusInput();
              }}
            />
          )}
        </div>
      </ToastContext.Provider>
    </NavContext.Provider>
  );
}
