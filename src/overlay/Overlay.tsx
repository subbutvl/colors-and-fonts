import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/env";
import { FRAME_HEADER, OVERLAY_OPEN_EVENT, type Pick } from "../lib/picker";
import { averageRect, hex, pixel } from "./pixels";

/** Loupe: 11 x 11 pixels, each drawn 10 CSS px wide. */
const LOUPE_CELLS = 11;
const LOUPE_ZOOM = 10;
const LOUPE_SIZE = LOUPE_CELLS * LOUPE_ZOOM;
const LOUPE_GAP = 22;

interface Frame {
  image: ImageData;
  /** Monitor origin on the virtual desktop, physical pixels. */
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

/** Parse an `overlay_frame` response (see `encode_frame` in picker.rs). */
function parseFrame(buf: ArrayBuffer): Frame {
  const view = new DataView(buf);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const pixels = new Uint8ClampedArray(buf, FRAME_HEADER, width * height * 4);
  return { image: new ImageData(pixels, width, height), x: view.getInt32(8, true), y: view.getInt32(12, true) };
}

/** Outside the app (vite preview) show a test pattern so the UI can be checked. */
function demoFrame(): Frame {
  const w = Math.round(window.innerWidth * devicePixelRatio);
  const h = Math.round(window.innerHeight * devicePixelRatio);
  const image = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      image.data[i] = (x / w) * 255;
      image.data[i + 1] = (y / h) * 255;
      image.data[i + 2] = ((x >> 3) + (y >> 3)) % 2 ? 200 : 120;
      image.data[i + 3] = 255;
    }
  }
  return { image, x: 0, y: 0 };
}

const finish = () => {
  if (isTauri()) invoke("overlay_finish").catch(console.error);
};

/**
 * Full-screen picker for one monitor: shows the frozen frame, a loupe that
 * follows the pointer, and turns clicks into picks. Always dark.
 */
export function Overlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  /** Pointer position in frame pixels; null while the pointer is on another monitor. */
  const [pos, setPos] = useState<Point | null>(null);
  /** Shift+drag rectangle corners, frame pixels. */
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [picked, setPicked] = useState<{ hex: string; count: number } | null>(null);

  const load = useCallback(async () => {
    setPos(null);
    setDrag(null);
    setPicked(null);
    try {
      const next = isTauri() ? parseFrame(await invoke<ArrayBuffer>("overlay_frame")) : demoFrame();
      const c = canvas.current;
      if (c) {
        c.width = next.image.width;
        c.height = next.image.height;
        c.getContext("2d")?.putImageData(next.image, 0, 0);
      }
      setFrame(next);
      // Show the window once the frame has been painted.
      requestAnimationFrame(() => {
        if (isTauri()) invoke("overlay_ready").catch(console.error);
      });
    } catch (e) {
      console.error("overlay frame", e);
    }
  }, []);

  useEffect(() => {
    load();
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen(OVERLAY_OPEN_EVENT, () => load()).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [load]);

  /** CSS px per frame pixel (the inverse of the monitor's scale factor). */
  const cssPerPx = frame ? window.innerWidth / frame.image.width : 1;

  const toFrame = (e: { clientX: number; clientY: number }): Point | null => {
    if (!frame) return null;
    const k = frame.image.width / window.innerWidth;
    const x = Math.min(frame.image.width - 1, Math.max(0, Math.floor(e.clientX * k)));
    const y = Math.min(frame.image.height - 1, Math.max(0, Math.floor(e.clientY * k)));
    return { x, y };
  };

  const pick = useCallback(
    (from: Point, to: Point = from) => {
      if (!frame) return;
      const rgb = from === to ? pixel(frame.image, from.x, from.y) : averageRect(frame.image, from.x, from.y, to.x, to.y);
      if (!rgb) return;
      const p: Pick = {
        hex: hex(rgb),
        ...rgb,
        x: frame.x + Math.min(from.x, to.x),
        y: frame.y + Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x) + 1,
        height: Math.abs(to.y - from.y) + 1,
      };
      if (isTauri()) invoke("overlay_pick", { pick: p }).catch(console.error);
      setPicked((prev) => ({ hex: p.hex, count: (prev?.count ?? 0) + 1 }));
    },
    [frame],
  );

  // Keyboard: Esc ends, arrows nudge one pixel (Shift: ten), Enter/Space picks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
        return;
      }
      if (!frame) return;
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      if (delta[e.key]) {
        e.preventDefault();
        setPos((p) => {
          const from = p ?? { x: Math.floor(frame.image.width / 2), y: Math.floor(frame.image.height / 2) };
          return {
            x: Math.min(frame.image.width - 1, Math.max(0, from.x + delta[e.key].x)),
            y: Math.min(frame.image.height - 1, Math.max(0, from.y + delta[e.key].y)),
          };
        });
      } else if ((e.key === "Enter" || e.key === " ") && pos) {
        e.preventDefault();
        pick(pos);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, pos, pick]);

  // Redraw the loupe whenever the point moves.
  useEffect(() => {
    const c = loupe.current;
    if (!c || !frame || !pos) return;
    const dpr = devicePixelRatio;
    c.width = LOUPE_SIZE * dpr;
    c.height = LOUPE_SIZE * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const half = Math.floor(LOUPE_CELLS / 2);
    for (let row = 0; row < LOUPE_CELLS; row++) {
      for (let col = 0; col < LOUPE_CELLS; col++) {
        const px = pixel(frame.image, pos.x + col - half, pos.y + row - half);
        ctx.fillStyle = px ? `rgb(${px.r},${px.g},${px.b})` : "#0b0c0f";
        ctx.fillRect(col * LOUPE_ZOOM, row * LOUPE_ZOOM, LOUPE_ZOOM, LOUPE_ZOOM);
      }
    }
    // Faint pixel grid, then a two-tone ring around the centre pixel so it
    // shows on any color.
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i < LOUPE_CELLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LOUPE_ZOOM + 0.5, 0);
      ctx.lineTo(i * LOUPE_ZOOM + 0.5, LOUPE_SIZE);
      ctx.moveTo(0, i * LOUPE_ZOOM + 0.5);
      ctx.lineTo(LOUPE_SIZE, i * LOUPE_ZOOM + 0.5);
      ctx.stroke();
    }
    const c0 = half * LOUPE_ZOOM;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeRect(c0 - 1, c0 - 1, LOUPE_ZOOM + 2, LOUPE_ZOOM + 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c0 - 1, c0 - 1, LOUPE_ZOOM + 2, LOUPE_ZOOM + 2);
  }, [frame, pos]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const p = toFrame(e);
    if (!p) return;
    setPos(p);
    if (e.shiftKey) setDrag({ from: p, to: p });
    else pick(p);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const p = toFrame(e);
    if (!p) return;
    setPos(p);
    if (drag) setDrag({ from: drag.from, to: p });
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = toFrame(e) ?? drag.to;
    pick(drag.from, p);
    setDrag(null);
  };

  const center = frame?.image && pos ? pixel(frame.image, pos.x, pos.y) : null;
  const dragAvg = frame && drag ? averageRect(frame.image, drag.from.x, drag.from.y, drag.to.x, drag.to.y) : null;
  const shown = dragAvg ?? center;

  // Loupe sits below-right of the point, flipping near the screen edges.
  const panelW = LOUPE_SIZE + 2;
  const panelH = LOUPE_SIZE + 48;
  const px = pos ? (pos.x + 0.5) * cssPerPx : 0;
  const py = pos ? (pos.y + 0.5) * cssPerPx : 0;
  const left = px + LOUPE_GAP + panelW > window.innerWidth ? px - LOUPE_GAP - panelW : px + LOUPE_GAP;
  const top = py + LOUPE_GAP + panelH > window.innerHeight ? py - LOUPE_GAP - panelH : py + LOUPE_GAP;

  return (
    <div
      className="overlay"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => !drag && setPos(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <canvas ref={canvas} className="frame" />

      {drag && (
        <div
          className="drag-rect"
          style={{
            left: Math.min(drag.from.x, drag.to.x) * cssPerPx,
            top: Math.min(drag.from.y, drag.to.y) * cssPerPx,
            width: (Math.abs(drag.to.x - drag.from.x) + 1) * cssPerPx,
            height: (Math.abs(drag.to.y - drag.from.y) + 1) * cssPerPx,
          }}
        />
      )}

      {pos && (
        <>
          <div className="marker" style={{ left: px, top: py }} />
          <div className="loupe" style={{ left, top }} aria-hidden="true">
            <canvas ref={loupe} style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }} />
            {shown && (
              <div className="readout">
                <span className="chip" style={{ background: hex(shown) }} />
                <strong>{hex(shown)}</strong>
                <span className="coords">
                  {drag
                    ? `${Math.abs(drag.to.x - drag.from.x) + 1} x ${Math.abs(drag.to.y - drag.from.y) + 1} avg`
                    : `${(frame?.x ?? 0) + pos.x}, ${(frame?.y ?? 0) + pos.y}`}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="hint" role="status">
        {picked ? (
          <>
            <span className="chip" style={{ background: picked.hex }} />
            Picked <b>{picked.hex}</b>
            {picked.count > 1 && <span className="muted"> · {picked.count} this time</span>}
            <span className="sep" />
          </>
        ) : null}
        Click to pick <span className="sep" /> Shift+drag to average <span className="sep" /> Arrows nudge, Enter picks{" "}
        <span className="sep" /> <kbd>Esc</kbd> done
      </div>
    </div>
  );
}
