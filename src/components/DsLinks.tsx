import { openExternal } from "../lib/open";
import { recordOpened, type DsLink, type DsRef } from "../lib/designSystems";

/** Link buttons that open in the browser and count as "recently opened". */
export function DsLinks({ links, from, onError }: { links: DsLink[]; from: DsRef; onError?: (message: string) => void }) {
  if (links.length === 0) return null;
  return (
    <span className="ds-links">
      {links.map((l) => (
        <button
          key={l.url}
          type="button"
          className="link-btn"
          title={l.url}
          onClick={() => {
            recordOpened(from);
            openExternal(l.url).catch((e) => onError?.(`Could not open ${l.url}: ${e}`));
          }}
        >
          {l.label} ↗
        </button>
      ))}
    </span>
  );
}
