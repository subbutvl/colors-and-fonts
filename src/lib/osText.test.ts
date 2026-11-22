import { describe, expect, it } from "vitest";
import { osText } from "./osText";
import { prettyShortcut } from "./shortcuts";

describe("osText", () => {
  it("names the menu bar and Command key on macOS", () => {
    expect(osText(true).tray).toBe("menu bar");
    expect(osText(true).paste).toBe("⌘V");
    expect(osText(false).tray).toBe("system tray");
    expect(osText(false).modifiers).toContain("Win");
  });
});

describe("prettyShortcut", () => {
  it("spells keys out on Windows", () => {
    expect(prettyShortcut("Ctrl+Alt+KeyC", false)).toBe("Ctrl + Alt + C");
    expect(prettyShortcut("Ctrl+Shift+Digit1", false)).toBe("Ctrl + Shift + 1");
  });
  it("uses the Mac symbols in Mac order", () => {
    expect(prettyShortcut("Ctrl+Alt+KeyC", true)).toBe("⌃⌥C");
    expect(prettyShortcut("Ctrl+Alt+Shift+Super+Space", true)).toBe("⌃⌥⇧⌘Space");
  });
});
