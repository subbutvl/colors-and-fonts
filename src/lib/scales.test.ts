import { describe, expect, it, vi } from "vitest";
import { makeScale } from "./scale";
import { cleanScale, listScales, parseSteps, requestOpenScale, saveScale, takeOpenScale } from "./scales";

describe("saved scales", () => {
  it("cleans names and keeps exactly 50 to 950", () => {
    const scale = makeScale("#5b6cff");
    const c = cleanScale("  Brand blue  ", scale)!;
    expect(c.name).toBe("Brand blue");
    expect(c.steps.map((s) => s.step)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    expect(cleanScale("", scale)!.name).toBe("Untitled scale");
    expect(cleanScale("x", scale.slice(1))).toBeNull();
  });

  it("reads back only well-formed step lists", () => {
    const steps = cleanScale("x", makeScale("#E5484D"))!.steps;
    expect(parseSteps(JSON.stringify(steps))).toEqual(steps);
    expect(parseSteps("not json")).toBeNull();
    expect(parseSteps(JSON.stringify(steps.slice(2)))).toBeNull();
    expect(parseSteps(JSON.stringify([{ step: 50, hex: "red" }]))).toBeNull();
  });

  it("saves in memory outside Tauri, newest first", async () => {
    await saveScale("One", "#5b6cff", makeScale("#5b6cff"));
    await saveScale("Two", "#E5484D", makeScale("#E5484D"));
    const list = await listScales();
    expect(list.map((s) => s.name)).toEqual(["Two", "One"]);
    expect(list[1].base).toBe("#5B6CFF");
    expect(list[0].steps).toHaveLength(11);
  });
});

describe("open handoff", () => {
  it("carries the stored steps once, so a reopened scale shows exactly what was saved", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    const steps = makeScale("#3B82F6").map(({ step, hex }) => ({ step, hex }));
    steps[0] = { step: 50, hex: "#ABCDEF" }; // not what makeScale gives today
    requestOpenScale({ base: "#3b82f6", name: "Blue", steps });
    expect(takeOpenScale()).toEqual({ base: "#3B82F6", name: "Blue", steps });
    expect(takeOpenScale()).toBeNull();
    store.set("huetype.scales.open", JSON.stringify({ base: "#3B82F6", name: "x", steps: [] }));
    expect(takeOpenScale()).toBeNull();
    vi.unstubAllGlobals();
  });
});
