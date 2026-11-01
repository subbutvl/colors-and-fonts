import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import { getRawSettings, setRawSetting } from "./settings";

/**
 * Global shortcuts. Rust owns registration (src-tauri/src/shortcuts.rs);
 * the user's choices are stored here as `shortcut.<action>` settings rows and
 * re-applied by the main window on startup.
 *
 * Accelerators look like `Ctrl+Alt+KeyC`: modifiers, then a KeyboardEvent.code.
 */
export type ShortcutAction = "pick_color" | "identify_font" | "toggle_toolbar";

export interface ShortcutStatus {
  action: ShortcutAction;
  accelerator: string;
  default_accelerator: string;
  registered: boolean;
  error: string | null;
  /** Set when the user's saved shortcut could not be re-applied at startup (the default is in use). */
  saved_failed?: { accelerator: string; error: string };
}

export const SHORTCUT_NAMES: Record<ShortcutAction, string> = {
  pick_color: "Pick color",
  identify_font: "Identify font",
  toggle_toolbar: "Show or hide the toolbar",
};

const KEY_PREFIX = "shortcut.";

/** `Ctrl+Alt+KeyC` -> `Ctrl + Alt + C` */
export function prettyShortcut(accelerator: string): string {
  return accelerator
    .split("+")
    .map((t) => t.replace(/^(Key|Digit)/, ""))
    .join(" + ");
}

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
]);

/**
 * Accelerator for a key press while recording, or null if only modifiers are
 * held so far. Needs at least one modifier (checked again in Rust).
 */
export function acceleratorFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(e.code);
  return parts.join("+");
}

/** Saved shortcuts that could not be re-applied this session, by action. */
const skipped: Partial<Record<ShortcutAction, { accelerator: string; error: string }>> = {};
let applying: Promise<void> | null = null;

/**
 * Re-register the user's saved shortcuts (Rust starts with the defaults).
 * Runs once per window; later calls return the same promise, so anything that
 * reads the status can wait for it.
 */
export function applySavedShortcuts(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  if (!applying) {
    applying = (async () => {
      const saved = await getRawSettings(KEY_PREFIX);
      for (const [key, accelerator] of Object.entries(saved)) {
        const action = key.slice(KEY_PREFIX.length) as ShortcutAction;
        if (!(action in SHORTCUT_NAMES)) continue;
        try {
          await invoke("set_shortcut", { action, accelerator });
          delete skipped[action];
        } catch (e) {
          // The default stays active; the saved choice is kept so it is retried next launch.
          skipped[action] = { accelerator, error: String(e) };
        }
      }
    })().catch((e) => console.warn("Could not read saved shortcuts:", e));
  }
  return applying;
}

/** Current bindings, after saved shortcuts have been applied. */
export async function getShortcutStatus(): Promise<ShortcutStatus[] | null> {
  if (!isTauri()) return null;
  await applySavedShortcuts();
  const statuses = await invoke<ShortcutStatus[]>("shortcut_status");
  return statuses.map((st) => (skipped[st.action] ? { ...st, saved_failed: skipped[st.action] } : st));
}

/** Rebind and remember. Throws a readable message if the keys can't be used. */
export async function setShortcut(action: ShortcutAction, accelerator: string): Promise<ShortcutStatus> {
  const status = await invoke<ShortcutStatus>("set_shortcut", { action, accelerator });
  await setRawSetting(KEY_PREFIX + action, status.accelerator === status.default_accelerator ? null : accelerator);
  delete skipped[action];
  return status;
}
