// Browser preview without Tauri (npm run dev → http://localhost:1420/?window=launcher|settings).
// Fakes the Rust commands with in-memory data so the UI can be developed and screenshotted in any browser.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

export function installMocks() {
  const params = new URLSearchParams(location.search);
  mockWindows(params.get("window") ?? "launcher");
  const stores = new Map<string, string>();
  const now = Date.now();
  const clipboard = [
    { id: "1", text: "https://github.com/kadirnar/isin-windows", firstCopied: now - 60_000, lastCopied: now - 60_000, count: 1, pinned: false },
    { id: "2", text: "npm run tauri dev", firstCopied: now - 3_600_000, lastCopied: now - 600_000, count: 3, pinned: true },
    { id: "3", text: "Merhaba dünya!\nIşın Windows'ta çalışıyor.", firstCopied: now - 86_400_000, lastCopied: now - 7_200_000, count: 1, pinned: false },
  ];
  const app = (name: string, glyph: string) => ({ id: `app:${name.toLowerCase()}`, name, target: name, path: "", kind: "shortcut", icon: null, glyph });
  const apps = [app("Visual Studio Code", "🧑‍💻"), app("Google Chrome", "🌐"), app("Spotify", "🎵"), app("Not Defteri", "📝"),
    app("Terminal", "⌨️"), app("Steam", "🎮"), app("Blender 5.2", "🧊"), app("Calculator", "🧮")];

  mockIPC((cmd, args) => {
    const a = args as Record<string, unknown>;
    switch (cmd) {
      case "read_store": return stores.get(a.name as string) ?? null;
      case "write_store": stores.set(a.name as string, a.content as string); return null;
      case "data_dir_path": return "C:\\Users\\you\\AppData\\Roaming\\Isin";
      case "list_apps": return apps;
      case "clipboard_history": return clipboard;
      case "current_hotkey": return "Alt+Space";
      case "read_clipboard_text": return clipboard[0].text;
      case "get_selected_text": return null;
      case "run_system": return null;
      default:
        console.info("[mock]", cmd, args);
        return null;
    }
  }, { shouldMockEvents: true });
}
