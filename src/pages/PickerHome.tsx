import { useEffect, useState } from "react";
import { TryPick } from "../components/TryPick";
import { getShortcutStatus, prettyShortcut, type ShortcutAction, type ShortcutStatus } from "../lib/shortcuts";

const FALLBACK: Record<ShortcutAction, string> = {
  pick_color: "Ctrl+Alt+KeyC",
  identify_font: "Ctrl+Alt+KeyF",
  toggle_toolbar: "Ctrl+Alt+Space",
};

export function PickerHome() {
  const [shortcuts, setShortcuts] = useState<ShortcutStatus[] | null>(null);
  useEffect(() => {
    getShortcutStatus().then(setShortcuts).catch(() => {});
  }, []);
  const keys = (a: ShortcutAction) =>
    prettyShortcut(shortcuts?.find((s) => s.action === a)?.accelerator ?? FALLBACK[a]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Picker</h1>
        <p>Pick a color from any app, or identify a font on screen.</p>
      </header>
      <div className="big-actions">
        <button type="button" className="big-action" disabled>
          <strong>Pick color</strong>
          <span>From any app or screen</span>
          <kbd>{keys("pick_color")}</kbd>
        </button>
        <button type="button" className="big-action" disabled>
          <strong>Identify font</strong>
          <span>Drag around text</span>
          <kbd>{keys("identify_font")}</kbd>
        </button>
      </div>
      <TryPick />
      <p className="note">
        The color picker arrives in Phase 1 and font identify in Phase 3. Press {keys("toggle_toolbar")} to show the
        floating toolbar. Close this window any time: Huetype keeps running in the system tray.
      </p>
    </div>
  );
}
