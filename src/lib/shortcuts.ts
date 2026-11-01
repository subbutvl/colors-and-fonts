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

export async function getShortcutStatus(): Promise<ShortcutStatus[] | null> {
  if (!isTauri()) return null;
  return invoke<ShortcutStatus[]>("shortcut_status");
}

/** Rebind and remember. Throws a readable message if the keys can't be used. */
export async function setShortcut(action: ShortcutAction, accelerator: string): Promise<ShortcutStatus> {
  const status = await invoke<ShortcutStatus>("set_shortcut", { action, accelerator });
  await setRawSetting(KEY_PREFIX + action, status.accelerator === status.default_accelerator ? null : accelerator);
  return status;
}

/** Called once by the main window: re-register the user's saved shortcuts. */
export async function applySavedShortcuts(): Promise<void> {
  if (!isTauri()) return;
  const saved = await getRawSettings(KEY_PREFIX);
  for (const [key, accelerator] of Object.entries(saved)) {
    const action = key.slice(KEY_PREFIX.length) as ShortcutAction;
    if (!(action in SHORTCUT_NAMES)) continue;
    try {
      await invoke("set_shortcut", { action, accelerator });
    } catch (e) {
      // Keep the default; Settings shows the current state.
      console.warn(`Saved shortcut for ${action} not applied:`, e);
    }
  }
}
