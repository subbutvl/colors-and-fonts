import { useMemo, useState } from "react";
import { FontCard } from "../components/FontCard";
import { FontPreviewControls } from "../components/FontPreviewControls";
import { PageHead } from "../components/PageHead";
import { copyText } from "../lib/colors";
import { byFamily, COLLECTIONS, requestPairing } from "../lib/fontSets";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useStarredFonts } from "../useStarredFonts";

const SAMPLES: Record<string, string> = {
  ui: "Settings · Save changes · 1,284 items",
  editorial: "It was the best of times, it was the worst of times.",
  display: "Bold Ideas",
  code: "const total = items.reduce((a, b) => a + b, 0);",
  branding: "Northwind Studio",
};

/** Curated fonts (18): collections by use. */
export function CuratedFontsPage({ section }: { section: Section }) {
  const { catalog, error } = useFontCatalog();
  const [active, setActive] = useState(COLLECTIONS[0].id);
  const [text, setText] = useState("");
  const [size, setSize] = useState(30);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();

  const map = useMemo(() => (catalog ? byFamily(catalog.families) : null), [catalog]);
  const collection = COLLECTIONS.find((c) => c.id === active)!;

  const copy = (value: string, what: string) =>
    copyText(value)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="font-cats" role="tablist" aria-label="Collections">
        {COLLECTIONS.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === active} className={`chip-btn${c.id === active ? " on" : ""}`} onClick={() => setActive(c.id)}>
            {c.title} <small>{c.fonts.length}</small>
          </button>
        ))}
      </div>
      <p className="note">{collection.blurb}</p>
      <FontPreviewControls text={text} size={size} onText={setText} onSize={setSize} placeholder={SAMPLES[collection.id]} />
      <p className="help" role="status">
        {error ?? status ?? "Our own picks, chosen for the job. Star the ones you like to keep them in Saved."}
      </p>
      <ul className="font-grid">
        {map &&
          collection.fonts.flatMap(({ family, why }) => {
            const f = map.get(family);
            return f
              ? [
                  <FontCard
                    key={family}
                    font={f}
                    text={text || SAMPLES[collection.id]}
                    size={size}
                    weight={400}
                    starred={isStarred(family)}
                    onStar={() => toggle(family)}
                    onCopy={copy}
                    onPair={() => requestPairing(family)}
                    note={why}
                  />,
                ]
              : [];
          })}
      </ul>
    </div>
  );
}
