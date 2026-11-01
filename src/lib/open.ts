import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./env";

/** Open a web page in the user's default browser. */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}
