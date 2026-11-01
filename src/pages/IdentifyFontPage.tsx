import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontCard } from "../components/FontCard";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText } from "../lib/colors";
import { captureNotes, fontCaptureImage, lastFontCapture, onFontCaptured, startFontPick, type FontCapture } from "../lib/fontIdentify";
import { fallbackFor, fontFamilyCss, loadPreviewFont, type FontFamily } from "../lib/fonts";
import { CONFIDENCE_LABELS, identify, loadFontIndex, MIN_LETTERS, type Identified } from "../lib/fontMatch";
import { byFamily, knownAlternatives, MATCH_PREFER, requestPairing, sameLetterFamilies } from "../lib/fontSets";
import { isTauri } from "../lib/env";
import { getShortcutStatus, prettyShortcut } from "../lib/shortcuts";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useStarredFonts } from "../useStarredFonts";

/** Largest the crop is drawn, CSS px. */
const MAX_VIEW_W = 760;
const MAX_VIEW_H = 220;

/** The captured pixels, scaled to fit, with the OCR word boxes on top. */
function CaptureView({ capture, image }: { capture: FontCapture; image: ImageData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const k = Math.min(MAX_VIEW_W / image.width, MAX_VIEW_H / image.height, 4);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")?.putImageData(image, 0, 0);
  }, [image]);
  return (
    <div className="id-crop" style={{ width: image.width * k, height: image.height * k }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", imageRendering: k > 1.5 ? "pixelated" : "auto" }} />
      {capture.ocr?.lines.flatMap((l, li) =>
        l.words.map((w, wi) => (
          <span key={`${li}-${wi}`} className="id-word" style={{ left: w.x * k, top: w.y * k, width: w.width * k, height: w.height * k }} title={w.text} />
        )),
      )}
    </div>
  );
}

const TONES = { likely: "pass", possible: "plain", alternative: "muted" } as const;

/** Notes on how far to trust the letter matching. */
function matchNotes(r: Identified): string[] {
  const notes: string[] = [];
  const { skippedWords, lowContrast } = r.measured;
  if (r.letterCount < MIN_LETTERS) {
    notes.push(
      r.letterCount
        ? `Only ${r.letterCount} different ${r.letterCount === 1 ? "letter" : "letters"} could be measured, so treat these as rough alternatives. A few words of plain text work best.`
        : "No letters could be measured. Capture a few words of plain text, with a little space around them.",
    );
  }
  if (skippedWords) notes.push(`${skippedWords} ${skippedWords === 1 ? "word was" : "words were"} skipped because the letters touch or did not match the text read.`);
  if (lowContrast) notes.push(`${lowContrast} ${lowContrast === 1 ? "word was" : "words were"} skipped because the text is too close to its background color.`);
  return notes;
}

/** Bold matched, and the families with the very same Latin letters. */
function matchNote(family: string, weight: number): string | undefined {
  const same = sameLetterFamilies(family);
  const parts = [
    weight >= 600 ? "Matched its bold style." : "",
    same.length ? `Same Latin letters as ${same.slice(0, 3).join(", ")}${same.length > 3 ? ` and ${same.length - 3} more` : ""}.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/** Ranked Google Fonts for the captured letters, plus our known stand-ins for a reported font. */
function MatchResults({
  capture,
  image,
  families,
  sample,
  onCopy,
}: {
  capture: FontCapture;
  image: ImageData;
  families: Map<string, FontFamily>;
  sample: string;
  onCopy: (value: string, what: string) => void;
}) {
  const [result, setResult] = useState<Identified | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();
  const known = capture.exact ? knownAlternatives(capture.exact.name) : null;

  useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);
    const words = capture.ocr?.lines.flatMap((l) => l.words) ?? [];
    loadFontIndex()
      .then((index) => live && setResult(identify(index, image, words, { prefer: MATCH_PREFER })))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [capture, image]);

  const card = (font: FontFamily, weight: number, tag: { label: string; tone: "pass" | "plain" | "muted"; title?: string }, note?: string) => (
    <FontCard
      key={font.family}
      font={font}
      text={sample}
      size={28}
      weight={weight}
      starred={isStarred(font.family)}
      onStar={() => toggle(font.family)}
      onCopy={onCopy}
      onPair={() => requestPairing(font.family)}
      tag={tag}
      note={note}
    />
  );

  const knownFonts = known?.alternatives.flatMap((n) => families.get(n) ?? []) ?? [];
  const shown = new Set(knownFonts.map((f) => f.family));
  const matched = (result?.matches ?? []).filter((m) => families.has(m.family) && !shown.has(m.family)).slice(0, 5);

  return (
    <div className="id-matches">
      {knownFonts.length > 0 && (
        <>
          <p className="help">{known!.why}</p>
          <ul className="font-grid">{knownFonts.map((f) => card(f, 400, { label: "Known alternative", tone: "pass" }))}</ul>
          <h3 className="vision-h">Closest by letter shapes</h3>
        </>
      )}
      {error && <p className="alert">Font matching is unavailable: {error}</p>}
      {!result && !error && <p className="help">Comparing letters…</p>}
      {result && (
        <>
          <p className="help">
            Compared {result.letterCount} different {result.letterCount === 1 ? "letter" : "letters"} with {result.indexSize.toLocaleString()} Google Fonts families
            (regular, and bold for popular families). Italic and decorated text match roughly.
          </p>
          {matchNotes(result).map((n) => (
            <p key={n} className="alert">
              {n}
            </p>
          ))}
          {matched.length > 0 && (
            <ul className="font-grid">
              {matched.map((m) =>
                card(
                  families.get(m.family)!,
                  m.weight,
                  // The app named a non-Google font: these can only be alternatives.
                  capture.exact
                    ? { label: CONFIDENCE_LABELS.alternative, tone: "plain", title: `Distance ${m.distance.toFixed(3)} over ${m.letters} letters` }
                    : { label: CONFIDENCE_LABELS[m.confidence], tone: TONES[m.confidence], title: `Distance ${m.distance.toFixed(3)} over ${m.letters} letters` },
                  matchNote(m.family, m.weight),
                ),
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Identify font (Picker group): capture text on screen, read it, show the exact font when the app reports one. */
export function IdentifyFontPage({ section }: { section: Section }) {
  const [capture, setCapture] = useState<FontCapture | null>(null);
  const [image, setImage] = useState<ImageData | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [keys, setKeys] = useState("Ctrl+Alt+F");
  const { catalog } = useFontCatalog();
  const { isStarred, toggle } = useStarredFonts();

  const show = useCallback((c: FontCapture | null) => {
    setCapture(c);
    setImage(null);
    if (c) fontCaptureImage().then(setImage).catch((e) => console.error("capture image", e));
  }, []);

  useEffect(() => {
    lastFontCapture().then(show).catch(() => {});
    getShortcutStatus()
      .then((all) => {
        const s = all?.find((x) => x.action === "identify_font");
        if (s) setKeys(prettyShortcut(s.accelerator));
      })
      .catch(() => {});
    return onFontCaptured(show);
  }, [show]);

  const start = () => {
    setStatus(null);
    startFontPick().catch((e) => setStatus(e instanceof Error ? e.message : String(e)));
  };

  const copy = (value: string, what: string) =>
    copyText(value)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const families = useMemo(() => (catalog ? byFamily(catalog.families) : null), [catalog]);
  const exact = capture?.exact ?? null;
  const google = exact && families ? families.get(exact.name) : undefined;
  useEffect(() => {
    if (google) loadPreviewFont(google, 400);
  }, [google]);
  const notes = capture ? captureNotes(capture) : [];
  const text = capture?.ocr?.text.trim() ?? "";
  const sample = (capture?.ocr?.lines[0]?.text ?? "").slice(0, 60);


  return (
    <div className="page">
      <PageHead section={section} />

      <div className="toolbar-row">
        <button type="button" className="primary-btn" onClick={start} disabled={!isTauri()}>
          Identify font <kbd>{keys}</kbd>
        </button>
        <span className="help">The screen freezes: drag a box around one line of text, Esc to cancel.</span>
      </div>
      {status && (
        <p className="alert" role="status">
          {status}
        </p>
      )}

      {!capture ? (
        <p className="note">
          {isTauri()
            ? "Nothing captured yet. Text reads best when it is at least 14 px tall and on a plain background."
            : "Font identify works in the desktop app: it reads text from any window on your screen."}
        </p>
      ) : (
        <>
          <section className="settings-group id-result">
            <h2>Captured</h2>
            {image && <CaptureView capture={capture} image={image} />}
            <p className="help">
              {capture.width} x {capture.height} px at {capture.x}, {capture.y}
              {capture.ocr ? ` · read in ${capture.ocr.language}` : ""} · {Math.round(capture.elapsedMs)} ms
            </p>
            {notes.map((n) => (
              <p key={n} className="alert">
                {n}
              </p>
            ))}
            {text && (
              <div className="id-text">
                <blockquote>{text}</blockquote>
                <button type="button" className="link-btn" onClick={() => copy(text, "the text")}>
                  Copy text
                </button>
              </div>
            )}
          </section>

          <section className="settings-group">
            <h2>Font</h2>
            {exact && google ? (
              <div className="id-exact">
                <p>
                  The app reports this text is set in <strong>{exact.name}</strong>
                  {exact.size ? ` at ${Math.round(exact.size * 10) / 10} pt` : ""}. This is the exact font, not a guess.
                </p>
                <div className="id-google">
                  <span className="id-sample" style={{ fontFamily: `"${google.family}", ${fallbackFor(google.category)}` }}>
                    {sample || google.family}
                  </span>
                  <span className="id-actions">
                    <button type="button" className="link-btn" onClick={() => copy(fontFamilyCss(google), `font-family for ${google.family}`)}>
                      Copy CSS
                    </button>
                    <button type="button" className="link-btn" onClick={() => requestPairing(google.family)}>
                      Pairings
                    </button>
                    <StarButton on={isStarred(google.family)} onClick={() => toggle(google.family)} />
                  </span>
                </div>
              </div>
            ) : (
              <>
                <p>
                  {exact ? (
                    <>
                      The app reports this text is set in <strong>{exact.name}</strong>
                      {exact.size ? ` at ${Math.round(exact.size * 10) / 10} pt` : ""}, which is not a Google Font. These are the closest Google Fonts
                      alternatives.
                    </>
                  ) : (
                    "This app does not report its fonts, so Huetype compared the captured letters with Google Fonts. These are the closest matches; the exact font may not be a Google Font."
                  )}
                </p>
                {image && families ? (
                  <MatchResults capture={capture} image={image} families={families} sample={sample} onCopy={copy} />
                ) : (
                  <p className="help">Loading…</p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
