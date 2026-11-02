/**
 * Every page in the main window. The sidebar, router and placeholders all
 * read from this list, so adding a section means adding one entry here.
 * The sidebar shows the groups in `GROUPS` order and the sections in the
 * order they appear here; sections are not numbered in the UI.
 */
export type SectionGroup = "Picker" | "Create" | "Check" | "Discover" | "Fonts" | "Design systems" | "App";

export interface Section {
  id: string;
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

  { id: "palettes", title: "Palettes", group: "Create", phase: 2, blurb: "Generate palettes, lock colors you like, save and export." },
  { id: "scales", title: "Scales", group: "Create", phase: 2, blurb: "Turn a base color into a 50 to 950 tint and shade scale." },
  { id: "gradients", title: "Gradients", group: "Create", phase: 4, blurb: "Browse curated gradients and build your own." },
  { id: "color-pairing", title: "Color pairing", group: "Create", phase: 2, blurb: "Complementary, analogous, triadic and other partners." },
  { id: "image-palette", title: "Image palette", group: "Create", phase: 2, blurb: "Extract the main colors from an image." },
  { id: "css-generator", title: "CSS generator", group: "Create", phase: 2, blurb: "Export as CSS variables, Tailwind, Material 3, SCSS or tokens." },

  { id: "contrast", title: "Contrast", group: "Check", phase: 1, blurb: "WCAG 2.2 and APCA contrast for text and background." },
  { id: "color-blindness", title: "Color blindness", group: "Check", phase: 2, blurb: "See a color pair the way people with different vision do." },
  { id: "converter", title: "Converter", group: "Check", phase: 1, blurb: "Convert between HEX, RGB, HSL, OKLCH and more." },

  { id: "curated-colors", title: "Curated colors", group: "Discover", phase: 4, blurb: "Hand-picked color collections by mood and theme." },
  { id: "brand-colors", title: "Brand colors", group: "Discover", phase: 4, blurb: "Official colors of well-known brands." },
  { id: "pantone", title: "Pantone", group: "Discover", phase: 4, blurb: "Pantone Color of the Year, 2002 to 2026." },
  { id: "html-color-names", title: "HTML color names", group: "Discover", phase: 1, blurb: "All 148 CSS named colors, searchable." },
  { id: "guess-the-color", title: "Guess the color", group: "Discover", phase: 4, blurb: "Spot the next color in a sequence." },

  { id: "font-listing", title: "Font listing", group: "Fonts", phase: 3, blurb: "Browse every Google Fonts family with live previews." },
  { id: "top-fonts", title: "Top fonts", group: "Fonts", phase: 3, blurb: "Most popular and trending Google Fonts." },
  { id: "font-pairing", title: "Font pairing", group: "Fonts", phase: 3, blurb: "Heading and body font pairs, previewed as a page." },
  { id: "curated-fonts", title: "Curated fonts", group: "Fonts", phase: 3, blurb: "Font collections by use: UI, editorial, display, code." },

  { id: "design-systems", title: "Overview", group: "Design systems", phase: 4, blurb: "Search across curated and your own design systems." },
  { id: "curated-design-systems", title: "Curated", group: "Design systems", phase: 4, blurb: "Public design systems with links to docs, tokens and guides." },
  { id: "my-design-systems", title: "My design systems", group: "Design systems", phase: 4, blurb: "Add, edit and delete your own design-system references." },

  // Not in the section list. Color details opens from a picked color (`#/color/<hex>`).
  { id: "color", title: "Color details", group: "App", phase: 6, blurb: "Values, contrast, tints, shades and harmonies for one color." },
  // Reached from the sidebar footer and the tray menu.
  { id: "settings", title: "Settings", group: "App", phase: 0, blurb: "Theme, startup and app info." },
];

/** Groups shown in the sidebar list ("App" pages live in the sidebar footer). */
export const GROUPS: SectionGroup[] = ["Picker", "Create", "Check", "Discover", "Fonts", "Design systems"];

export const DEFAULT_SECTION = "picker";

export function findSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
