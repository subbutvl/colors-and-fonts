import { useEffect, useState } from "react";

/**
 * Theme preference. "system" follows the Windows app theme (via the
 * prefers-color-scheme media query in WebView2); light and dark override it.
 * Stored in localStorage until the settings store lands (Phase 0, step 2).
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "huetype.theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // storage unavailable: fall through to the default
  }
  return "system";
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === "system") delete root.dataset.theme;
    else root.dataset.theme = pref;
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // ignore
    }
  }, [pref]);

  return [pref, setPref];
}
