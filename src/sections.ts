/**
 * Every page in the main window. The sidebar, router and placeholders all
 * read from this list, so adding a section means adding one entry here.
 * `num` matches the section numbers in the feature spec (1 to 21).
 */
export type SectionGroup = "Picker" | "Colors" | "Fonts" | "Design systems" | "App";

export interface Section {
  id: string;
  num?: number;
  title: string;
  group: SectionGroup;
  blurb: string;
  /** Roadmap phase that delivers this section (see docs/ROADMAP.md). */
  phase: number;
}

export const SECTIONS: Section[] = [
  { id: "picker", title: "Picker", group: "Picker", phase: 1, blurb: "Start a color pick or font identify, and reuse recent picks." },
  { id: "identify", title: "Identify font", group: "Picker", phase: 3, blurb: "Drag a box around text anywhere on screen to read it and find its font." },
  { id: "saved", title: "Saved", group: "Picker", phase: 2, blurb: "Everything you starred: colors, palettes, gradients and fonts." },

  { id: "palettes", num: 1, title: "Palettes", group: "Colors", phase: 2, blurb: "Generate palettes, lock colors you like, save and export." },
  { id: "scales", num: 2, title: "Scales", group: "Colors", phase: 2, blurb: "Turn a base color into a 50 to 950 tint and shade scale." },
  { id: "contrast", num: 3, title: "Contrast", group: "Colors", phase: 1, blurb: "WCAG 2.2 and APCA contrast for text and background." },
  { id: "pantone", num: 4, title: "Pantone", group: "Colors", phase: 4, blurb: "Pantone Color of the Year, 2002 to 2026." },
  { id: "color-blindness", num: 5, title: "Color blindness", group: "Colors", phase: 2, blurb: "See a color pair the way people with different vision do." },
  { id: "color-pairing", num: 6, title: "Color pairing", group: "Colors", phase: 2, blurb: "Complementary, analogous, triadic and other partners." },
  { id: "curated-colors", num: 7, title: "Curated colors", group: "Colors", phase: 4, blurb: "Hand-picked color collections by mood and theme." },
  { id: "brand-colors", num: 8, title: "Brand colors", group: "Colors", phase: 4, blurb: "Official colors of well-known brands." },
  { id: "gradients", num: 9, title: "Gradients", group: "Colors", phase: 4, blurb: "Browse curated gradients and build your own." },
  { id: "css-generator", num: 10, title: "CSS generator", group: "Colors", phase: 2, blurb: "Export as CSS variables, Tailwind, Material 3, SCSS or tokens." },
  { id: "image-palette", num: 11, title: "Image palette", group: "Colors", phase: 2, blurb: "Extract the main colors from an image." },
  { id: "guess-the-color", num: 12, title: "Guess the color", group: "Colors", phase: 4, blurb: "Spot the next color in a sequence." },
  { id: "html-color-names", num: 13, title: "HTML color names", group: "Colors", phase: 1, blurb: "All 148 CSS named colors, searchable." },
  { id: "converter", num: 14, title: "Converter", group: "Colors", phase: 1, blurb: "Convert between HEX, RGB, HSL, OKLCH and more." },

  { id: "font-listing", num: 15, title: "Font listing", group: "Fonts", phase: 3, blurb: "Browse every Google Fonts family with live previews." },
  { id: "top-fonts", num: 16, title: "Top fonts", group: "Fonts", phase: 3, blurb: "Most popular and trending Google Fonts." },
  { id: "font-pairing", num: 17, title: "Font pairing", group: "Fonts", phase: 3, blurb: "Heading and body font pairs, previewed as a page." },
  { id: "curated-fonts", num: 18, title: "Curated fonts", group: "Fonts", phase: 3, blurb: "Font collections by use: UI, editorial, display, code." },

  { id: "design-systems", num: 19, title: "Overview", group: "Design systems", phase: 4, blurb: "Search across curated and your own design systems." },
  { id: "curated-design-systems", num: 20, title: "Curated", group: "Design systems", phase: 4, blurb: "Public design systems with links to docs, tokens and guides." },
  { id: "my-design-systems", num: 21, title: "My design systems", group: "Design systems", phase: 4, blurb: "Add, edit and delete your own design-system references." },

  // Not in the section list. Color details opens from a picked color (`#/color/<hex>`).
  { id: "color", title: "Color details", group: "App", phase: 6, blurb: "Values, contrast, tints, shades and harmonies for one color." },
  // Reached from the sidebar footer and the tray menu.
  { id: "settings", title: "Settings", group: "App", phase: 0, blurb: "Theme, startup and app info." },
];

/** Groups shown in the sidebar list ("App" pages live in the sidebar footer). */
export const GROUPS: SectionGroup[] = ["Picker", "Colors", "Fonts", "Design systems"];

export const DEFAULT_SECTION = "picker";

export function findSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
