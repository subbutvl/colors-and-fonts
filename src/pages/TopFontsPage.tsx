import { useMemo, useState } from "react";
import { FontCard } from "../components/FontCard";
import { FontPreviewControls } from "../components/FontPreviewControls";
import { PageHead } from "../components/PageHead";
import { copyText } from "../lib/colors";
import { requestPairing, TOP_NOTE, topFonts, trendingFonts } from "../lib/fontSets";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useStarredFonts } from "../useStarredFonts";

type Tab = "popular" | "trending";

/** Top fonts (16): most popular and trending Google Fonts. */
export function TopFontsPage({ section }: { section: Section }) {
  const { catalog, error } = useFontCatalog();
  const [tab, setTab] = useState<Tab>("popular");
  const [text, setText] = useState("");
  const [size, setSize] = useState(32);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();

  const popular = useMemo(() => (catalog ? topFonts(catalog.families) : null), [catalog]);
  const trending = useMemo(() => (catalog ? trendingFonts(catalog.families) : null), [catalog]);
  const current = tab === "popular" ? popular : trending;

  const copy = (value: string, what: string) =>
    copyText(value)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const explain = !current
    ? "Loading the catalog…"
    : tab === "popular"
      ? current.live
        ? `Live Google Fonts popularity, refreshed ${catalog!.updated} (weekly while an API key is set).`
        : `${TOP_NOTE} Add an API key in Settings → Fonts for the live order.`
      : current.live
        ? `Families gaining use fastest on Google Fonts, refreshed ${catalog!.updated}.`
        : "Trending needs a Google Fonts API key (Settings → Fonts). Until then this shows the most recently updated families.";

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="toolbar-row">
        <div className="theme-switch" role="tablist" aria-label="List">
          <button type="button" role="tab" aria-selected={tab === "popular"} className={tab === "popular" ? "on" : ""} onClick={() => setTab("popular")}>
            Most popular
          </button>
          <button type="button" role="tab" aria-selected={tab === "trending"} className={tab === "trending" ? "on" : ""} onClick={() => setTab("trending")}>
            {trending?.live === false ? "Recently updated" : "Trending"}
          </button>
        </div>
      </div>
      <FontPreviewControls text={text} size={size} onText={setText} onSize={setSize} />
      <p className="help" role="status">
        {error ?? status ?? explain}
      </p>
      <ol className="font-grid">
        {current?.fonts.map((f, i) => (
          <FontCard
            key={f.family}
            font={f}
            text={text}
            size={size}
            weight={400}
            starred={isStarred(f.family)}
            onStar={() => toggle(f.family)}
            onCopy={copy}
            onPair={() => requestPairing(f.family)}
            rankLabel={`${i + 1}`}
            note={tab === "trending" && !current.live ? `Updated ${f.modified}` : undefined}
          />
        ))}
      </ol>
    </div>
  );
}
