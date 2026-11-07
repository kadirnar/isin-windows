// Imported first by main.tsx: outside Tauri (plain `npm run dev` in a browser) the Rust commands are mocked
// before any store module runs. Kept synchronous so module evaluation order is guaranteed.
import { installMocks } from "./mock";

const internals = (window as { __TAURI_INTERNALS__?: { metadata?: unknown } }).__TAURI_INTERNALS__;
if (import.meta.env.DEV && !internals?.metadata) installMocks();
