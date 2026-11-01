import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanDraft,
  createDesignSystem,
  CURATED_DS,
  CURATED_DS_TAGS,
  deleteDesignSystem,
  draftFromCurated,
  EMPTY_DRAFT,
  hostLabel,
  listMyDesignSystems,
  normalizeUrl,
  parseTags,
  recentOpened,
  recordOpened,
  requestEdit,
  searchCurated,
  takeEditRequest,
  updateDesignSystem,
} from "./designSystems";
import { exportLibrary } from "./library";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("curated design systems", () => {
  it("have unique ids, https links and a description", () => {
    expect(CURATED_DS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(CURATED_DS.map((s) => s.id)).size).toBe(CURATED_DS.length);
    for (const s of CURATED_DS) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.links.length).toBeGreaterThan(0);
      for (const l of s.links) expect(normalizeUrl(l.url)).toBe(l.url);
      for (const l of s.links) expect(l.url.startsWith("https://")).toBe(true);
    }
  });

  it("search by words and filter by tag or platform", () => {
    expect(searchCurated("ibm", null).map((s) => s.id)).toEqual(["carbon"]);
    expect(searchCurated("react tokens", null).length).toBeGreaterThan(2);
    const gov = searchCurated("", "Government").map((s) => s.id);
    expect(gov).toEqual(["govuk", "uswds"]);
    expect(searchCurated("", "iOS").some((s) => s.id === "apple-hig")).toBe(true);
    expect(CURATED_DS_TAGS[0]).toBe("Web");
  });
});

describe("drafts", () => {
  it("accepts only web links and adds https to bare hosts", () => {
    expect(normalizeUrl("example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///C:/x")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(hostLabel("https://www.figma.com/file/x")).toBe("figma.com");
  });

  it("cleans names, links, tags, colors and fonts", () => {
    const d = cleanDraft({
      ...EMPTY_DRAFT,
      name: "  Acme UI ",
      links: [
        { label: "", url: "acme.dev" },
        { label: "Again", url: "https://acme.dev/" },
        { label: "Bad", url: "ftp://acme.dev" },
      ],
      tags: parseTags("Web, web; Tokens\n "),
      colors: ["#abc", "rgb(255 0 0)", "nope", "#AABBCC"],
      fonts: ["Inter", "inter", " Lora "],
    });
    expect(d.name).toBe("Acme UI");
    expect(d.links).toEqual([{ label: "acme.dev", url: "https://acme.dev/" }]);
    expect(d.tags).toEqual(["Web", "Tokens"]);
    expect(d.colors).toEqual(["#AABBCC", "#FF0000"]);
    expect(d.fonts).toEqual(["Inter", "Lora"]);
    expect(() => cleanDraft({ ...EMPTY_DRAFT, name: "  " })).toThrow();
  });

  it("copies a curated system with its source", () => {
    const d = draftFromCurated(CURATED_DS.find((s) => s.id === "primer")!);
    expect(d.source).toBe("primer");
    expect(d.tags).toContain("Web");
  });
});

describe("my design systems (in memory outside Tauri)", () => {
  it("create, update, list newest first, export and delete", async () => {
    stubStorage();
    const a = await createDesignSystem({ ...EMPTY_DRAFT, name: "First" });
    const b = await createDesignSystem({ ...EMPTY_DRAFT, name: "Second", colors: ["#123456"] });
    expect((await listMyDesignSystems()).map((m) => m.name)).toEqual(["Second", "First"]);
    await updateDesignSystem(a, { ...EMPTY_DRAFT, name: "First, edited", notes: "Use v2 tokens" });
    const list = await listMyDesignSystems();
    expect(list[0]).toEqual(expect.objectContaining({ id: a, name: "First, edited", notes: "Use v2 tokens" }));
    const json = JSON.parse(await exportLibrary());
    expect(json.designSystems.map((d: { name: string }) => d.name)).toEqual(["First, edited", "Second"]);
    expect(json.designSystems[0].id).toBeUndefined();
    recordOpened(`my:${b}`);
    await deleteDesignSystem(b);
    await deleteDesignSystem(a);
    expect(await listMyDesignSystems()).toEqual([]);
    expect(recentOpened()).toEqual([]);
  });

  it("remembers recently opened, newest first, without repeats", () => {
    stubStorage();
    recordOpened("curated:carbon");
    recordOpened("my:3");
    recordOpened("curated:carbon");
    expect(recentOpened()).toEqual(["curated:carbon", "my:3"]);
    for (let i = 0; i < 12; i++) recordOpened(`my:${i + 10}`);
    expect(recentOpened()).toHaveLength(8);
    requestEdit(5);
    expect(takeEditRequest()).toBe(5);
    expect(takeEditRequest()).toBeNull();
  });
});
