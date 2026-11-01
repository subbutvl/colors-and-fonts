import { useMemo, useState } from "react";
import { DsLinks } from "../components/DsLinks";
import { PageHead } from "../components/PageHead";
import {
  CURATED_DS,
  matchesQuery,
  recentOpened,
  recordOpened,
  requestEdit,
  searchCurated,
  type CuratedDesignSystem,
  type DsRef,
  type MyDesignSystem,
} from "../lib/designSystems";
import type { Section } from "../sections";
import { useMyDesignSystems } from "../useMyDesignSystems";

type Item = { ref: DsRef; kind: "curated"; system: CuratedDesignSystem } | { ref: DsRef; kind: "mine"; system: MyDesignSystem };

function Row({ item, onError }: { item: Item; onError: (m: string) => void }) {
  const s = item.system;
  const open = () => {
    if (item.kind !== "mine") return;
    recordOpened(item.ref);
    requestEdit(item.system.id);
    window.location.hash = "/my-design-systems";
  };
  return (
    <li className="ds-row">
      <span className="ds-row-main">
        {item.kind === "mine" ? (
          <button type="button" className="link-btn ds-row-name" onClick={open}>
            {s.name}
          </button>
        ) : (
          <strong>{s.name}</strong>
        )}
        <small>{item.kind === "mine" ? "Mine" : item.system.org}</small>
      </span>
      <span className="ds-row-desc">{s.description}</span>
      <DsLinks links={s.links.slice(0, 3)} from={item.ref} onError={onError} />
    </li>
  );
}

/** Design systems overview (19): what is in Curated and Mine, search across both, recently opened. */
export function DesignSystemsHubPage({ section }: { section: Section }) {
  const { list: mine } = useMyDesignSystems();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [recentRefs] = useState(recentOpened);

  const lookup = (ref: DsRef): Item | null => {
    if (ref.startsWith("curated:")) {
      const s = CURATED_DS.find((c) => `curated:${c.id}` === ref);
      return s ? { ref, kind: "curated", system: s } : null;
    }
    const m = mine.find((x) => `my:${x.id}` === ref);
    return m ? { ref, kind: "mine", system: m } : null;
  };

  const recent = recentRefs.map(lookup).filter((i): i is Item => !!i);
  const results = useMemo<Item[]>(() => {
    if (!query.trim()) return [];
    return [
      ...mine.filter((m) => matchesQuery(m, query)).map((m): Item => ({ ref: `my:${m.id}`, kind: "mine", system: m })),
      ...searchCurated(query, null).map((c): Item => ({ ref: `curated:${c.id}`, kind: "curated", system: c })),
    ];
  }, [query, mine]);

  const linkCount = mine.reduce((n, m) => n + m.links.length, 0);

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="ds-hub-cards">
        <a className="ds-hub-card" href="#/curated-design-systems">
          <span className="ds-hub-num">20</span>
          <strong>Curated</strong>
          <span>
            <b>{CURATED_DS.length}</b> public design systems with links to their docs and code
          </span>
        </a>
        <a className="ds-hub-card" href="#/my-design-systems">
          <span className="ds-hub-num">21</span>
          <strong>My design systems</strong>
          <span>
            {mine.length ? (
              <>
                <b>{mine.length}</b> saved, {linkCount} {linkCount === 1 ? "link" : "links"}
              </>
            ) : (
              "Add your own: links, notes, colors and fonts"
            )}
          </span>
        </a>
      </div>

      <div className="toolbar-row">
        <input
          type="search"
          className="text-input ds-hub-search"
          placeholder="Search curated and your own design systems"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search all design systems"
        />
      </div>
      <p className="help" role="status">
        {status ?? (query.trim() ? `${results.length} ${results.length === 1 ? "match" : "matches"}` : "Search by name, company, tag, notes or link.")}
      </p>

      {query.trim() ? (
        <ul className="ds-rows">
          {results.map((i) => (
            <Row key={i.ref} item={i} onError={setStatus} />
          ))}
        </ul>
      ) : (
        <section aria-labelledby="ds-recent-h">
          <h2 className="vision-h" id="ds-recent-h">
            Recently opened
          </h2>
          {recent.length ? (
            <ul className="ds-rows">
              {recent.map((i) => (
                <Row key={i.ref} item={i} onError={setStatus} />
              ))}
            </ul>
          ) : (
            <p className="help">Systems you open from Curated or My design systems will show up here.</p>
          )}
        </section>
      )}
    </div>
  );
}
