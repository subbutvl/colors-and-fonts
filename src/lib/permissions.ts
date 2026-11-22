import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

/** macOS Screen Recording permission; Windows has none ("notNeeded"). */
export type ScreenAccess = "granted" | "denied" | "notNeeded";

export async function screenPermission(): Promise<ScreenAccess> {
  if (!isTauri()) return "notNeeded";
  return invoke<ScreenAccess>("screen_permission");
}

/** Ask macOS once, then open System Settings at Privacy & Security > Screen Recording. */
export async function openScreenSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_screen_settings");
}
