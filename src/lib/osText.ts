import { isMac } from "./env";

/** Words that differ between Windows and macOS. */
export interface OsText {
  os: string;
  /** Where Huetype lives when its window is closed. */
  tray: string;
  paste: string;
  /** "Launch Huetype ..." */
  startup: string;
  modifiers: string;
}

const WINDOWS: OsText = {
  os: "Windows",
  tray: "system tray",
  paste: "Ctrl+V",
  startup: "when Windows starts",
  modifiers: "Ctrl, Alt, Shift or Win",
};

const MAC: OsText = {
  os: "macOS",
  tray: "menu bar",
  paste: "⌘V",
  startup: "when you log in",
  modifiers: "Control, Option, Shift or Command",
};

export function osText(mac: boolean = isMac()): OsText {
  return mac ? MAC : WINDOWS;
}
