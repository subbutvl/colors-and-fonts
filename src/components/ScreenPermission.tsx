import { useCallback, useEffect, useState } from "react";
import { openScreenSettings, screenPermission, type ScreenAccess } from "../lib/permissions";

/** Re-check when the window gets focus again, e.g. back from System Settings. */
export function useScreenAccess(): ScreenAccess | null {
  const [access, setAccess] = useState<ScreenAccess | null>(null);
  const check = useCallback(() => {
    screenPermission().then(setAccess).catch(() => setAccess(null));
  }, []);
  useEffect(() => {
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);
  return access;
}

export function OpenScreenSettingsButton() {
  return (
    <button type="button" className="secondary-btn" onClick={() => void openScreenSettings().catch(() => {})}>
      Open System Settings
    </button>
  );
}

/** Settings row (macOS only): whether Screen Recording is allowed, and a way to allow it. */
export function ScreenPermissionRow() {
  const access = useScreenAccess();
  if (access === null || access === "notNeeded") return null;
  return (
    <div className="setting-row">
      <div>
        <strong>Screen Recording</strong>
        <span>
          {access === "granted"
            ? "Allowed. Huetype can read colors and text from anywhere on screen."
            : "Not allowed yet. Picking colors, identifying fonts and grabbing the screen need it. After you turn it on, quit and reopen Huetype."}
        </span>
      </div>
      {access === "granted" ? <span className="mono">Allowed</span> : <OpenScreenSettingsButton />}
    </div>
  );
}
