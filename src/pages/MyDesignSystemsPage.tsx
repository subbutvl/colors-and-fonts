import { useEffect, useMemo, useState } from "react";
import { DsLinks } from "../components/DsLinks";
import { PageHead } from "../components/PageHead";
import { colorSwatchInk } from "../lib/colorInk";
import { copyText, parseColor } from "../lib/colors";
import {
  cleanDraft,
  createDesignSystem,
  CURATED_DS,
  deleteDesignSystem,
  EMPTY_DRAFT,
  LIMITS,
  matchesQuery,
  normalizeUrl,
  parseTags,
  recordOpened,
  takeEditRequest,
  updateDesignSystem,
  type DsDraft,
  type MyDesignSystem,
} from "../lib/designSystems";
import { formatHex } from "culori";
import { listStarred, type StarredColor } from "../lib/library";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useMyDesignSystems } from "../useMyDesignSystems";

type Editing = { id: number | null; draft: DsDraft; tagsText: string };

const toEditing = (m: MyDesignSystem | null): Editing =>
  m
    ? { id: m.id, draft: { ...m, links: m.links.map((l) => ({ ...l })) }, tagsText: m.tags.join(", ") }
    : { id: null, draft: { ...EMPTY_DRAFT, links: [{ label: "", url: "" }] }, tagsText: "" };

/** The add and edit form. */
function Editor({ editing, onDone }: { editing: Editing; onDone: (message: string | null) => void }) {
  const [e, setE] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [colorText, setColorText] = useState("");
  const [fontText, setFontText] = useState("");
  const [starred, setStarred] = useState<StarredColor[]>([]);
  const { catalog } = useFontCatalog();
  const d = e.draft;
  const set = (patch: Partial<DsDraft>) => setE({ ...e, draft: { ...d, ...patch } });

  useEffect(() => {
    listStarred()
      .then(setStarred)
      .catch(() => setStarred([]));
  }, []);

  const addColor = (text: string) => {
    const c = parseColor(text);
    if (!c) return setError(`"${text}" is not a color I can read.`);
    const hex = formatHex(c)!.toUpperCase();
    if (!d.colors.includes(hex) && d.colors.length < LIMITS.colors) set({ colors: [...d.colors, hex] });
    setColorText("");
    setError(null);
  };

  const addFont = (text: string) => {
    const name = text.trim();
    if (!name) return;
    const known = catalog?.families.find((f) => f.family.toLowerCase() === name.toLowerCase())?.family ?? name;
    if (!d.fonts.some((f) => f.toLowerCase() === known.toLowerCase()) && d.fonts.length < LIMITS.fonts) set({ fonts: [...d.fonts, known] });
    setFontText("");
  };

  const save = async () => {
    const badLink = d.links.find((l) => l.url.trim() && !normalizeUrl(l.url));
    if (badLink) return setError(`"${badLink.url}" is not a web address (http or https).`);
    let clean: DsDraft;
    try {
      clean = cleanDraft({ ...d, tags: parseTags(e.tagsText) });
    } catch (err) {
      return setError(String(err instanceof Error ? err.message : err));
    }
    try {
      if (e.id === null) {
        const id = await createDesignSystem(clean);
        recordOpened(`my:${id}`);
      } else {
        await updateDesignSystem(e.id, clean);
        recordOpened(`my:${e.id}`);
      }
      onDone(`Saved "${clean.name}"`);
    } catch (err) {
      setError(`Could not save: ${err}`);
    }
  };

  const unusedStarred = starred.filter((s) => !d.colors.includes(s.hex)).slice(0, 16);
  const source = d.source ? CURATED_DS.find((c) => c.id === d.source) : undefined;

  return (
    <form
      className="ds-editor"
      onSubmit={(ev) => {
        ev.preventDefault();
        void save();
      }}
      aria-label={e.id === null ? "New design system" : `Edit ${editing.draft.name}`}
    >
      <div className="picks-head">
        <h2>{e.id === null ? "New design system" : "Edit design system"}</h2>
        {source && <span className="help">Copied from {source.name} in Curated</span>}
      </div>

      <label className="ds-field">
        <span>Name</span>
        <input className="text-input" value={d.name} maxLength={LIMITS.name} onChange={(ev) => set({ name: ev.target.value })} required autoFocus />
      </label>
      <label className="ds-field">
        <span>Description</span>
        <input className="text-input" value={d.description} maxLength={LIMITS.description} onChange={(ev) => set({ description: ev.target.value })} placeholder="What it is and where you use it" />
      </label>

      <fieldset className="ds-field">
        <legend>Links, references and guides</legend>
        {d.links.map((l, i) => {
          const invalid = !!l.url.trim() && !normalizeUrl(l.url);
          return (
            <div key={i} className="ds-link-row">
              <input
                className="text-input"
                value={l.label}
                maxLength={LIMITS.label}
                placeholder="Label (Docs, Figma, Tokens...)"
                aria-label={`Link ${i + 1} label`}
                onChange={(ev) => set({ links: d.links.map((x, k) => (k === i ? { ...x, label: ev.target.value } : x)) })}
              />
              <input
                className="text-input mono"
                value={l.url}
                placeholder="https://"
                aria-label={`Link ${i + 1} address`}
                aria-invalid={invalid}
                onChange={(ev) => set({ links: d.links.map((x, k) => (k === i ? { ...x, url: ev.target.value } : x)) })}
              />
              <button type="button" className="link-btn" onClick={() => set({ links: d.links.filter((_, k) => k !== i) })} aria-label={`Remove link ${i + 1}`}>
                Remove
              </button>
            </div>
          );
        })}
        <button type="button" className="link-btn" disabled={d.links.length >= LIMITS.links} onClick={() => set({ links: [...d.links, { label: "", url: "" }] })}>
          + Add link
        </button>
      </fieldset>

      <label className="ds-field">
        <span>Tags</span>
        <input className="text-input" value={e.tagsText} onChange={(ev) => setE({ ...e, tagsText: ev.target.value })} placeholder="Web, Tokens, Client A (comma separated)" />
      </label>

      <fieldset className="ds-field">
        <legend>Colors</legend>
        {d.colors.length > 0 && (
          <ul className="ds-chips">
            {d.colors.map((c) => (
              <li key={c} className="ds-color-chip" style={{ background: c, color: colorSwatchInk(c) }}>
                <span className="mono">{c}</span>
                <button type="button" onClick={() => set({ colors: d.colors.filter((x) => x !== c) })} aria-label={`Remove ${c}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="conv-row">
          <input
            className="text-input mono"
            value={colorText}
            onChange={(ev) => setColorText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                if (colorText.trim()) addColor(colorText);
              }
            }}
            placeholder="#5B6CFF, rgb(...), oklch(...) or a CSS name"
            aria-label="Add a color"
          />
          <button type="button" className="secondary-btn" disabled={!colorText.trim() || d.colors.length >= LIMITS.colors} onClick={() => addColor(colorText)}>
            Add color
          </button>
        </div>
        {unusedStarred.length > 0 && (
          <div className="ds-starred">
            <span className="help">From Saved:</span>
            {unusedStarred.map((s) => (
              <button key={s.hex} type="button" className="ds-starred-sw" style={{ background: s.hex }} title={`Add ${s.hex}`} aria-label={`Add ${s.hex}`} onClick={() => addColor(s.hex)} />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="ds-field">
        <legend>Fonts</legend>
        {d.fonts.length > 0 && (
          <ul className="ds-chips">
            {d.fonts.map((f) => (
              <li key={f} className="ds-font-chip">
                {f}
                <button type="button" onClick={() => set({ fonts: d.fonts.filter((x) => x !== f) })} aria-label={`Remove ${f}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="conv-row">
          <input
            className="text-input"
            list="ds-font-names"
            value={fontText}
            onChange={(ev) => setFontText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                addFont(fontText);
              }
            }}
            placeholder="Font family (Google Fonts or any other)"
            aria-label="Add a font"
          />
          <datalist id="ds-font-names">
            {catalog?.families.map((f) => (
              <option key={f.family} value={f.family} />
            ))}
          </datalist>
          <button type="button" className="secondary-btn" disabled={!fontText.trim() || d.fonts.length >= LIMITS.fonts} onClick={() => addFont(fontText)}>
            Add font
          </button>
        </div>
      </fieldset>

      <label className="ds-field">
        <span>Notes</span>
        <textarea className="text-input" rows={4} value={d.notes} maxLength={LIMITS.notes} onChange={(ev) => set({ notes: ev.target.value })} placeholder="Versions, decisions, where the tokens live..." />
      </label>

      {error && (
        <p className="help ds-error" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar-row">
        <button type="submit" className="primary-btn">
          {e.id === null ? "Add design system" : "Save changes"}
        </button>
        <button type="button" className="secondary-btn" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** My design systems (21): add, edit and delete your own references. */
export function MyDesignSystemsPage({ section }: { section: Section }) {
  const { list, error, loaded } = useMyDesignSystems();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pendingEdit] = useState(takeEditRequest);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const shown = useMemo(() => list.filter((m) => matchesQuery(m, query) || m.colors.some((c) => c.toLowerCase().includes(query.trim().toLowerCase().replace(/^#?/, "#"))) || m.fonts.some((f) => f.toLowerCase().includes(query.trim().toLowerCase()))), [list, query]);

  // Another page asked to open an entry (Curated "Add to mine", Overview).
  useEffect(() => {
    if (pendingEdit === null || !loaded) return;
    const m = list.find((x) => x.id === pendingEdit);
    if (m) setEditing(toEditing(m));
  }, [pendingEdit, loaded, list]);

  const edit = (m: MyDesignSystem | null) => {
    setEditing(toEditing(m));
    setConfirmDelete(null);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (m: MyDesignSystem) => {
    try {
      await deleteDesignSystem(m.id);
      setStatus(`Deleted "${m.name}"`);
      setConfirmDelete(null);
      if (editing?.id === m.id) setEditing(null);
    } catch (e) {
      setStatus(`Could not delete: ${e}`);
    }
  };

  const copyJson = (m: MyDesignSystem) => {
    const { id: _id, ...rest } = m;
    copyText(JSON.stringify(rest, null, 2))
      .then(() => setStatus(`Copied "${m.name}" as JSON`))
      .catch((e) => setStatus(`Copy failed: ${e}`));
  };

  return (
    <div className="page">
      <PageHead section={section} />

      {editing ? (
        <Editor
          key={editing.id ?? "new"}
          editing={editing}
          onDone={(message) => {
            setEditing(null);
            if (message) setStatus(message);
          }}
        />
      ) : (
        <div className="toolbar-row">
          <button type="button" className="primary-btn" onClick={() => edit(null)}>
            New design system
          </button>
          <input type="search" className="text-input" placeholder="Search your systems" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your design systems" />
          <span className="spacer" />
          <a className="link-btn" href="#/curated-design-systems">
            Start from a curated one
          </a>
        </div>
      )}

      <p className="help" role="status">
        {error ?? status ?? (list.length ? `${list.length} saved · newest changes first.` : "")}
      </p>

      {loaded && list.length === 0 && !editing && (
        <div className="ds-empty">
          <strong>No design systems yet</strong>
          <p className="help">Keep the systems you work with in one place: links to docs, tokens and Figma files, tags, notes, and the colors and fonts they use.</p>
        </div>
      )}

      <ul className="ds-grid">
        {shown.map((m) => (
          <li key={m.id} className={`ds-card${editing?.id === m.id ? " editing" : ""}`}>
            <div className="ds-card-head">
              <strong>{m.name}</strong>
              {m.source && <small>from Curated</small>}
            </div>
            {m.description && <p>{m.description}</p>}
            {(m.colors.length > 0 || m.fonts.length > 0) && (
              <div className="ds-attached">
                {m.colors.length > 0 && (
                  <span className="ds-strip" aria-label={`${m.colors.length} colors`}>
                    {m.colors.map((c) => (
                      <span key={c} style={{ background: c }} title={c} />
                    ))}
                  </span>
                )}
                {m.fonts.length > 0 && <small>{m.fonts.join(", ")}</small>}
              </div>
            )}
            {m.tags.length > 0 && (
              <span className="ds-tags">
                {m.tags.map((t) => (
                  <span key={t} className="ds-tag">
                    {t}
                  </span>
                ))}
              </span>
            )}
            {m.notes && <p className="ds-notes">{m.notes}</p>}
            <div className="ds-card-foot">
              <DsLinks links={m.links} from={`my:${m.id}`} onError={setStatus} />
              <span className="ds-actions">
                {confirmDelete === m.id ? (
                  <>
                    <span className="help">Delete?</span>
                    <button type="button" className="link-btn ds-danger" onClick={() => void remove(m)}>
                      Delete
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="link-btn" onClick={() => edit(m)}>
                      Edit
                    </button>
                    <button type="button" className="link-btn" onClick={() => copyJson(m)}>
                      Copy JSON
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirmDelete(m.id)}>
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {list.length > 0 && shown.length === 0 && <p className="help">Nothing matches "{query}".</p>}

      <p className="note">References only: Huetype keeps your links, notes, colors and fonts on this computer and opens links in your browser. The whole list is part of "Copy library as JSON" on the Saved page.</p>
    </div>
  );
}
