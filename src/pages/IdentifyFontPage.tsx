import { useCallback, useEffect, useRef, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText } from "../lib/colors";
import { captureNotes, fontCaptureImage, lastFontCapture, onFontCaptured, startFontPick, type FontCapture } from "../lib/fontIdentify";
import { fallbackFor, fontFamilyCss, loadPreviewFont } from "../lib/fonts";
import { byFamily, requestPairing } from "../lib/fontSets";
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

  const exact = capture?.exact ?? null;
  const google = exact && catalog ? byFamily(catalog.families).get(exact.name) : undefined;
  useEffect(() => {
    if (google) loadPreviewFont(google, 400);
  }, [google]);
  const notes = capture ? captureNotes(capture) : [];
  const text = capture?.ocr?.text.trim() ?? "";

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
            {exact ? (
              <div className="id-exact">
                <p>
                  The app reports this text is set in <strong>{exact.name}</strong>
                  {exact.size ? ` at ${Math.round(exact.size * 10) / 10} pt` : ""}. This is the exact font, not a guess.
                </p>
                {google ? (
                  <div className="id-google">
                    <span className="id-sample" style={{ fontFamily: `"${google.family}", ${fallbackFor(google.category)}` }}>
                      {text.split("\n")[0] || google.family}
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
                ) : (
                  <p className="help">{exact.name} is not a Google Font. Closest Google Fonts alternatives arrive with font matching in the next update.</p>
                )}
              </div>
            ) : (
              <p className="help">
                This app does not report its fonts (common in browsers, images and many modern apps). Matching the captured letters against Google Fonts
                arrives in the next update.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
