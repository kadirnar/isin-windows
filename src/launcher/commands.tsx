// Built-in commands of root search: the Windows counterparts of Işın's extensions.
import { AI_COMMANDS } from "../core/openrouter";
import { native } from "../native";
import { AnswerScreen, ChatScreen, runAICommand } from "./screens/AI";
import { ClipboardScreen } from "./screens/Clipboard";
import { QuicklinkForm, QuicklinksScreen, SnippetForm, SnippetsScreen } from "./screens/Snippets";
import type { Action, IconSpec, Nav } from "./types";

export interface Command {
  id: string;
  title: string;
  subtitle: string; // extension name
  icon: IconSpec;
  keywords?: string[];
  /** What Enter does. */
  run: (nav: Nav) => void | Promise<void>;
  /** Confirmation before running (destructive system commands). */
  confirm?: { title: string; message?: string; button: string };
  /** Extra actions after the primary one. */
  extra?: (nav: Nav) => Action[];
}

const tile = (glyph: string, tint: string): IconSpec => ({ glyph, tint });

function screen(nav: Nav, key: string, title: string, icon: IconSpec, render: () => React.ReactNode) {
  nav.push({ key, title, icon, render });
}

async function system(nav: Nav, id: string, hide = true) {
  const message = await native.runSystem(id);
  if (message) nav.toast({ style: "success", title: message }, 2000);
  if (hide) await nav.closeMainWindow();
}

const settingsPage = (id: string, title: string, uri: string, icon: string, keywords: string[] = []): Command => ({
  id: "settings-" + id,
  title,
  subtitle: "Windows Settings",
  icon,
  keywords: ["settings", "ayarlar", ...keywords],
  run: async (nav) => {
    await native.open(uri);
    await nav.closeMainWindow();
  },
});

const layout = (id: string, title: string, glyph: string, keywords: string[] = []): Command => ({
  id: "wm-" + id,
  title,
  subtitle: "Window Management",
  icon: tile(glyph, "#5E5CE6"),
  keywords: ["window", "pencere", ...keywords],
  run: async (nav) => {
    await native.windowLayout(id);
    await nav.closeMainWindow();
  },
});

export function builtInCommands(): Command[] {
  return [
    // Işın
    { id: "isin-settings", title: "Işın Settings", subtitle: "Işın", icon: tile("⚙", "#FF6363"), keywords: ["preferences", "ayarlar", "isin"],
      run: () => native.openSettings() },
    { id: "isin-quit", title: "Quit Işın", subtitle: "Işın", icon: tile("⏻", "#FF6363"), keywords: ["exit", "çık"],
      run: () => native.quit() },
    { id: "isin-reload-apps", title: "Reload Applications", subtitle: "Işın", icon: tile("↻", "#FF6363"), keywords: ["refresh", "index"],
      run: async (nav) => {
        await native.listApps();
        nav.toast({ style: "success", title: "Reloading applications…" }, 2000);
      } },
    { id: "isin-data-folder", title: "Open Işın Data Folder", subtitle: "Işın", icon: tile("📁", "#FF6363"),
      run: async (nav) => {
        await native.open(await native.dataDir());
        await nav.closeMainWindow();
      } },

    // Clipboard, snippets, quicklinks
    { id: "clipboard-history", title: "Clipboard History", subtitle: "Clipboard History", icon: tile("📋", "#FF9F0A"),
      keywords: ["pano", "copy", "paste", "kopyala"], run: (nav) => screen(nav, "clipboard", "Clipboard History", "📋", () => <ClipboardScreen />) },
    { id: "clipboard-windows", title: "Windows Clipboard Panel", subtitle: "Clipboard History", icon: tile("⊞", "#FF9F0A"),
      keywords: ["win+v"], run: (nav) => system(nav, "clipboard-panel", false) },
    { id: "snippets-search", title: "Search Snippets", subtitle: "Snippets", icon: tile("✂", "#30D158"), keywords: ["text", "metin"],
      run: (nav) => screen(nav, "snippets", "Search Snippets", "✂️", () => <SnippetsScreen />) },
    { id: "snippets-create", title: "Create Snippet", subtitle: "Snippets", icon: tile("✂", "#30D158"),
      run: (nav) => screen(nav, "new-snippet", "Create Snippet", "✂️", () => <SnippetForm />) },
    { id: "quicklinks-search", title: "Search Quicklinks", subtitle: "Quicklinks", icon: tile("🔗", "#0A84FF"), keywords: ["bookmark", "link"],
      run: (nav) => screen(nav, "quicklinks", "Search Quicklinks", "🔗", () => <QuicklinksScreen />) },
    { id: "quicklinks-create", title: "Create Quicklink", subtitle: "Quicklinks", icon: tile("🔗", "#0A84FF"),
      run: (nav) => screen(nav, "new-ql", "Create Quicklink", "🔗", () => <QuicklinkForm />) },

    // AI
    { id: "ai-chat", title: "AI Chat", subtitle: "AI", icon: tile("💬", "#BF5AF2"), keywords: ["gpt", "claude", "openrouter", "sohbet"],
      run: (nav) => screen(nav, "chat", "AI Chat", "💬", () => <ChatScreen />) },
    { id: "ai-quick", title: "Quick AI", subtitle: "AI", icon: tile("✨", "#BF5AF2"), keywords: ["ask", "sor"],
      run: (nav) => screen(nav, "quick-ai", "Quick AI", "✨", () => <AnswerScreen title="Quick AI" icon="✨" prompt="" display="" />) },
    ...AI_COMMANDS.map((command): Command => ({
      id: "ai-cmd-" + command.id,
      title: command.title,
      subtitle: "AI Commands",
      icon: command.icon,
      keywords: ["ai", "yapay zeka"],
      run: (nav) => runAICommand(command, nav),
    })),

    // System
    { id: "sys-lock", title: "Lock Screen", subtitle: "System", icon: tile("🔒", "#8E8E93"), keywords: ["kilitle"], run: (nav) => system(nav, "lock") },
    { id: "sys-sleep", title: "Sleep", subtitle: "System", icon: tile("☾", "#8E8E93"), keywords: ["uyku", "suspend"], run: (nav) => system(nav, "sleep") },
    { id: "sys-hibernate", title: "Hibernate", subtitle: "System", icon: tile("❄", "#8E8E93"), keywords: ["hazırda beklet"], run: (nav) => system(nav, "hibernate"),
      confirm: { title: "Hibernate now?", button: "Hibernate" } },
    { id: "sys-restart", title: "Restart", subtitle: "System", icon: tile("↻", "#8E8E93"), keywords: ["reboot", "yeniden başlat"],
      run: (nav) => system(nav, "restart"), confirm: { title: "Restart now?", message: "Unsaved work in open apps may be lost.", button: "Restart" } },
    { id: "sys-shutdown", title: "Shut Down", subtitle: "System", icon: tile("⏻", "#8E8E93"), keywords: ["power off", "kapat"],
      run: (nav) => system(nav, "shutdown"), confirm: { title: "Shut down now?", message: "Unsaved work in open apps may be lost.", button: "Shut Down" } },
    { id: "sys-sign-out", title: "Sign Out", subtitle: "System", icon: tile("⇥", "#8E8E93"), keywords: ["log out", "oturumu kapat"],
      run: (nav) => system(nav, "sign-out"), confirm: { title: "Sign out now?", message: "Open apps will be closed.", button: "Sign Out" } },
    { id: "sys-empty-bin", title: "Empty Recycle Bin", subtitle: "System", icon: tile("🗑", "#8E8E93"), keywords: ["trash", "geri dönüşüm"],
      run: (nav) => system(nav, "empty-recycle-bin", false),
      confirm: { title: "Empty the Recycle Bin?", message: "Files in it are deleted permanently.", button: "Empty" } },
    { id: "sys-dark-mode", title: "Toggle System Appearance", subtitle: "System", icon: tile("◐", "#8E8E93"), keywords: ["dark mode", "light mode", "karanlık"],
      run: (nav) => system(nav, "toggle-dark-mode", false) },
    { id: "sys-mute", title: "Toggle Mute", subtitle: "System", icon: tile("🔇", "#8E8E93"), keywords: ["sound", "volume", "ses"], run: (nav) => system(nav, "volume-mute", false) },
    { id: "sys-volume-up", title: "Volume Up", subtitle: "System", icon: tile("🔊", "#8E8E93"), keywords: ["sound", "ses"], run: (nav) => system(nav, "volume-up", false) },
    { id: "sys-volume-down", title: "Volume Down", subtitle: "System", icon: tile("🔉", "#8E8E93"), keywords: ["sound", "ses"], run: (nav) => system(nav, "volume-down", false) },
    { id: "sys-play-pause", title: "Play / Pause Media", subtitle: "System", icon: tile("⏯", "#8E8E93"), keywords: ["music", "müzik"], run: (nav) => system(nav, "media-play-pause", false) },
    { id: "sys-next-track", title: "Next Track", subtitle: "System", icon: tile("⏭", "#8E8E93"), keywords: ["music"], run: (nav) => system(nav, "media-next", false) },
    { id: "sys-previous-track", title: "Previous Track", subtitle: "System", icon: tile("⏮", "#8E8E93"), keywords: ["music"], run: (nav) => system(nav, "media-previous", false) },
    { id: "sys-show-desktop", title: "Show Desktop", subtitle: "System", icon: tile("🖥", "#8E8E93"), keywords: ["masaüstü"], run: (nav) => system(nav, "show-desktop", false) },
    { id: "sys-emoji", title: "Emoji & Symbols", subtitle: "System", icon: tile("😀", "#FFD60A"), keywords: ["emoji", "symbol", "sembol"], run: (nav) => system(nav, "emoji-panel", false) },
    { id: "sys-snip", title: "Take Screenshot (Snip)", subtitle: "System", icon: tile("✂", "#8E8E93"), keywords: ["screenshot", "ekran görüntüsü"],
      run: (nav) => system(nav, "screen-snip") },
    { id: "sys-task-manager", title: "Task Manager", subtitle: "System", icon: tile("📈", "#8E8E93"), keywords: ["processes", "görev yöneticisi"], run: (nav) => system(nav, "task-manager") },
    { id: "sys-explorer", title: "File Explorer", subtitle: "System", icon: tile("📁", "#8E8E93"), keywords: ["files", "dosya gezgini"], run: (nav) => system(nav, "file-explorer") },
    { id: "sys-control-panel", title: "Control Panel", subtitle: "System", icon: tile("🛠", "#8E8E93"), keywords: ["denetim masası"], run: (nav) => system(nav, "control-panel") },

    // Windows Settings pages
    settingsPage("home", "Windows Settings", "ms-settings:", "⚙️"),
    settingsPage("wifi", "Wi-Fi Settings", "ms-settings:network-wifi", "📶", ["network", "ağ", "internet"]),
    settingsPage("bluetooth", "Bluetooth Settings", "ms-settings:bluetooth", "🔵", ["devices", "cihazlar"]),
    settingsPage("display", "Display Settings", "ms-settings:display", "🖥️", ["screen", "resolution", "ekran"]),
    settingsPage("sound", "Sound Settings", "ms-settings:sound", "🔈", ["audio", "ses"]),
    settingsPage("apps", "Installed Apps", "ms-settings:appsfeatures", "🧩", ["uninstall", "kaldır", "programs"]),
    settingsPage("default-apps", "Default Apps", "ms-settings:defaultapps", "📌", ["varsayılan"]),
    settingsPage("update", "Windows Update", "ms-settings:windowsupdate", "⬆️", ["güncelleme"]),
    settingsPage("notifications", "Notification Settings", "ms-settings:notifications", "🔔", ["bildirim"]),
    settingsPage("power", "Power & Battery", "ms-settings:powersleep", "🔋", ["pil", "güç"]),
    settingsPage("storage", "Storage Settings", "ms-settings:storagesense", "💾", ["disk", "depolama"]),
    settingsPage("personalization", "Personalization", "ms-settings:personalization", "🎨", ["wallpaper", "theme", "kişiselleştirme"]),
    settingsPage("privacy", "Privacy & Security", "ms-settings:privacy", "🛡️", ["gizlilik", "permissions"]),
    settingsPage("mouse", "Mouse Settings", "ms-settings:mousetouchpad", "🖱️", ["fare", "touchpad"]),
    settingsPage("keyboard", "Keyboard & Language", "ms-settings:regionlanguage", "⌨️", ["klavye", "dil"]),
    settingsPage("vpn", "VPN Settings", "ms-settings:network-vpn", "🔐"),

    // Window management
    layout("left-half", "Left Half", "◧", ["sol"]),
    layout("right-half", "Right Half", "◨", ["sağ"]),
    layout("top-half", "Top Half", "⬒", ["üst"]),
    layout("bottom-half", "Bottom Half", "⬓", ["alt"]),
    layout("center-half", "Center Half", "▣"),
    layout("top-left", "Top Left Quarter", "◰"),
    layout("top-right", "Top Right Quarter", "◳"),
    layout("bottom-left", "Bottom Left Quarter", "◱"),
    layout("bottom-right", "Bottom Right Quarter", "◲"),
    layout("first-third", "First Third", "▏"),
    layout("center-third", "Center Third", "▕"),
    layout("last-third", "Last Third", "▕"),
    layout("first-two-thirds", "First Two Thirds", "◧"),
    layout("last-two-thirds", "Last Two Thirds", "◨"),
    layout("first-fourth", "First Fourth", "▏"),
    layout("second-fourth", "Second Fourth", "▎"),
    layout("third-fourth", "Third Fourth", "▍"),
    layout("last-fourth", "Last Fourth", "▕"),
    layout("maximize", "Maximize", "⬜", ["büyüt", "full"]),
    layout("almost-maximize", "Almost Maximize", "▢"),
    layout("reasonable-size", "Reasonable Size", "▫"),
    layout("center", "Center", "⊡", ["ortala"]),
    layout("restore", "Restore", "↺"),
    layout("minimize", "Minimize", "▁", ["küçült"]),
    layout("next-display", "Next Display", "⇥", ["monitor", "ekran"]),
    layout("previous-display", "Previous Display", "⇤", ["monitor", "ekran"]),
  ];
}
