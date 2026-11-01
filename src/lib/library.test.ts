import { describe, expect, it, vi } from "vitest";
import {
  exportLibrary,
  isStarred,
  listStarred,
  listStarredFonts,
  onLibraryChanged,
  setColorNote,
  setFontNote,
  starColor,
  starFont,
  toggleStar,
  unstarColor,
  unstarFont,
} from "./library";
import { DEFAULT_GRADIENT, gradientCss } from "./gradient";
import { deleteGradient, listGradients, renameGradient, requestOpenGradient, saveGradient, takeOpenGradient } from "./gradients";
import { deletePalette, listPalettes, savePalette } from "./palettes";

describe("library (in-memory outside Tauri)", () => {
  it("stars once per color, case-insensitively, newest first", async () => {
    await starColor("#5b6cff");
    await starColor("#5B6CFF");
    await starColor("#E5484D");
    const list = await listStarred();
    expect(list.map((c) => c.hex)).toEqual(["#E5484D", "#5B6CFF"]);
    expect(await isStarred("#5b6cff")).toBe(true);
    await unstarColor("#E5484D");
    await unstarColor("#5B6CFF");
    expect(await listStarred()).toEqual([]);
  });

  it("toggles and notes", async () => {
    expect(await toggleStar("#123456")).toBe(true);
    await setColorNote("#123456", "  Button hover  ");
    expect((await listStarred())[0].note).toBe("Button hover");
    expect(await toggleStar("#123456")).toBe(false);
    expect(await isStarred("#123456")).toBe(false);
  });

  it("tells listeners about color and palette changes", async () => {
    const fn = vi.fn();
    const off = onLibraryChanged(fn);
    await starColor("#ABCDEF");
    const id = await savePalette("Test", ["#000000", "#FFFFFF", "#FF0000"]);
    await deletePalette(id);
    await unstarColor("#ABCDEF");
    off();
    await starColor("#ABCDEF");
    expect(fn).toHaveBeenCalledTimes(4);
    await unstarColor("#ABCDEF");
  });

  it("exports colors and palettes as JSON", async () => {
    await starColor("#5B6CFF", "brand");
    const id = await savePalette("Sunset", ["#DEA98A", "#145A6E", "#263056"]);
    const json = JSON.parse(await exportLibrary());
    expect(json.app).toBe("Huetype");
    expect(json.colors).toEqual([expect.objectContaining({ hex: "#5B6CFF", note: "brand" })]);
    expect(json.palettes[0]).toEqual(expect.objectContaining({ name: "Sunset", colors: ["#DEA98A", "#145A6E", "#263056"] }));
    await deletePalette(id);
    await unstarColor("#5B6CFF");
    expect(await listPalettes()).toEqual([]);
  });

  it("stars fonts once and exports them", async () => {
    await starFont("Inter");
    await starFont(" Inter ");
    await starFont("Lora");
    await setFontNote("Lora", "Body copy");
    expect((await listStarredFonts()).map((f) => f.family)).toEqual(["Lora", "Inter"]);
    const json = JSON.parse(await exportLibrary());
    expect(json.fonts).toEqual([expect.objectContaining({ family: "Lora", note: "Body copy" }), expect.objectContaining({ family: "Inter" })]);
    await unstarFont("Inter");
    await unstarFont("Lora");
    expect(await listStarredFonts()).toEqual([]);
  });

  it("saves, renames and exports gradients", async () => {
    const id = await saveGradient("  Dawn  ", { ...DEFAULT_GRADIENT, angle: 400 });
    let list = await listGradients();
    expect(list[0]).toEqual(expect.objectContaining({ id, name: "Dawn" }));
    expect(list[0].gradient.angle).toBe(40);
    await renameGradient(id, "");
    list = await listGradients();
    expect(list[0].name).toBe("Untitled gradient");
    const json = JSON.parse(await exportLibrary());
    expect(json.gradients[0]).toEqual(expect.objectContaining({ name: "Untitled gradient", css: gradientCss(list[0].gradient) }));
    await deleteGradient(id);
    expect(await listGradients()).toEqual([]);
  });

  it("hands a gradient to the Gradients page once", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    requestOpenGradient({ ...DEFAULT_GRADIENT, type: "conic" }, "Wheel");
    expect(takeOpenGradient()).toEqual(expect.objectContaining({ name: "Wheel", gradient: expect.objectContaining({ type: "conic" }) }));
    expect(takeOpenGradient()).toBeNull();
    vi.unstubAllGlobals();
  });
});
