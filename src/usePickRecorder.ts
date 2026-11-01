import { useEffect } from "react";
import { copyText, formatColor, getCopyFormat, onCopyFormat } from "./lib/colors";
import { historyChanged, onHistoryChanged, pushRecentToTray, recordPick } from "./lib/history";
import { onPick } from "./lib/picker";

/**
 * Runs in the main window, which is always loaded (hidden or not): saves
 * every pick to history, copies it in the chosen format, and keeps the tray's
 * Recent menu current.
 */
export function usePickRecorder() {
  useEffect(() => {
    const tray = () => pushRecentToTray().catch((e) => console.error("tray recent", e));
    tray();
    const offPick = onPick(async (p) => {
      try {
        await recordPick(p);
        await historyChanged();
      } catch (e) {
        console.error("record pick", e);
      }
      try {
        await copyText(formatColor(p.hex, await getCopyFormat()));
      } catch (e) {
        console.error("copy pick", e);
      }
    });
    const offFormat = onCopyFormat(tray);
    // A saved pick or a cleared history refreshes the tray menu.
    const offHistory = onHistoryChanged(tray);
    return () => {
      offPick();
      offFormat();
      offHistory();
    };
  }, []);
}
