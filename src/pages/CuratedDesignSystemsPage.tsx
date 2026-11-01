import { useMemo, useState } from "react";
import { DsLinks } from "../components/DsLinks";
import { PageHead } from "../components/PageHead";
import {
  createDesignSystem,
  CURATED_DS,
  CURATED_DS_NOTE,
  CURATED_DS_TAGS,
  draftFromCurated,
  recordOpened,
  requestEdit,
  searchCurated,
  type CuratedDesignSystem,
} from "../lib/designSystems";
import type { Section } from "../sections";
import { useMyDesignSystems } from "../useMyDesignSystems";

/** How many tag chips to show before "More". */
const TOP_TAGS = 12;

/** Curated design systems (20): public systems with links to their docs and code. */
export function CuratedDesignSystemsPage({ section }: { section: Section }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { list: mine } = useMyDesignSystems();
  const results = useMemo(() => searchCurated(query, tag), [query, tag]);
  const copied = useMemo(() => new Map(mine.filter((m) => m.source).map((m) => [m.source, m.id])), [mine]);
  const tags = allTags ? CURATED_DS_TAGS : CURATED_DS_TAGS.slice(0, TOP_TAGS);

  const addToMine = async (s: CuratedDesignSystem) => {
    try {
      const id = await createDesignSystem(draftFromCurated(s));
      recordOpened(`my:${id}`);
      requestEdit(id);
      window.location.hash = "/my-design-systems";
    } catch (e) {
      setStatus(`Could not add ${s.name}: ${e}`);
    }
  };

  const openMine = (id: number) => {
    recordOpened(`my:${id}`);
    requestEdit(id);
    window.location.hash = "/my-design-systems";
  };

  return (
    <div className="page">
      <PageHead section={section} />
      <div className="toolbar-row">
        <input
          type="search"
          className="text-input"
          placeholder="Search by name, company or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search design systems"
        />
      </div>
      <div className="font-cats" role="group" aria-label="Tags">
        <button type="button" className={`chip-btn${tag === null ? " on" : ""}`} aria-pressed={tag === null} onClick={() => setTag(null)}>
          All <b>{CURATED_DS.length}</b>
        </button>
        {tags.map((t) => (
          <button key={t} type="button" className={`chip-btn${tag === t ? " on" : ""}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            {t}
          </button>
        ))}
        {CURATED_DS_TAGS.length > TOP_TAGS && (
          <button type="button" className="link-btn" onClick={() => setAllTags(!allTags)}>
            {allTags ? "Fewer" : `More (${CURATED_DS_TAGS.length - TOP_TAGS})`}
          </button>
        )}
      </div>
      <p className="help" role="status">
        {status ?? `${results.length} ${results.length === 1 ? "system" : "systems"} · links open in your browser · "Add to mine" copies one into My design systems so you can add notes, colors and fonts.`}
      </p>

      <ul className="ds-grid">
        {results.map((s) => {
          const mineId = copied.get(s.id);
          return (
            <li key={s.id} className="ds-card">
              <div className="ds-card-head">
                <strong>{s.name}</strong>
                <small>{s.org}</small>
              </div>
              <p>{s.description}</p>
              <span className="ds-tags">
                {[...s.platforms, ...s.tags].map((t) => (
                  <span key={t} className="ds-tag">
                    {t}
                  </span>
                ))}
              </span>
              <div className="ds-card-foot">
                <DsLinks links={s.links} from={`curated:${s.id}`} onError={setStatus} />
                {mineId !== undefined ? (
                  <button type="button" className="link-btn" onClick={() => openMine(mineId)}>
                    In my systems
                  </button>
                ) : (
                  <button type="button" className="secondary-btn" onClick={() => void addToMine(s)}>
                    Add to mine
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {results.length === 0 && <p className="help">No design system matches. Try fewer words or another tag.</p>}

      <p className="note">{CURATED_DS_NOTE} Names belong to their owners; Huetype is not affiliated with them.</p>
    </div>
  );
}
