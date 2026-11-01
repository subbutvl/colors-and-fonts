import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauri } from "./env";

/**
 * Launch at Windows sign-in. The OS entry is the source of truth (it is not
 * stored in SQLite), and it always starts Huetype hidden in the tray.
 */
export async function getAutostart(): Promise<boolean | null> {
  if (!isTauri()) return null;
  return isEnabled();
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return;
  if (on) await enable();
  else await disable();
}
