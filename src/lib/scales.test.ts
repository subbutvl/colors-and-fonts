import { describe, expect, it } from "vitest";
import { makeScale } from "./scale";
import { cleanScale, listScales, parseSteps, saveScale } from "./scales";

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
