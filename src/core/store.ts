// A tiny persisted store per JSON file, shared by React components through useSyncExternalStore.
// Writes are debounced; other windows are told through a Tauri event so the launcher and Settings stay in sync.
import { emit, listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { native } from "../native";

export class Store<T> {
  private value: T;
  private listeners = new Set<() => void>();
  private timer: number | undefined;
  readonly ready: Promise<void>;

  constructor(readonly name: string, private readonly defaults: T, private readonly merge = true) {
    this.value = defaults;
    this.ready = this.load();
    void listen<string>("store-changed", async (event) => {
      if (event.payload === this.name) await this.load();
    });
  }

  private async load() {
    try {
      const text = await native.readStore(this.name);
      if (text) {
        const parsed = JSON.parse(text) as T;
        this.value = this.merge && isPlainObject(parsed) && isPlainObject(this.defaults)
          ? ({ ...this.defaults, ...parsed } as T)
          : parsed;
        this.notify();
      }
    } catch (error) {
      console.error(`store ${this.name}:`, error);
    }
  }

  get = () => this.value;

  set(update: T | ((previous: T) => T)) {
    this.value = typeof update === "function" ? (update as (p: T) => T)(this.value) : update;
    this.notify();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), 250);
  }

  async flush() {
    window.clearTimeout(this.timer);
    await native.writeStore(this.name, JSON.stringify(this.value, null, 1));
    await emit("store-changed", this.name);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
