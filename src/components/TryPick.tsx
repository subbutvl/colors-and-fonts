import { useEffect, useRef, useState } from "react";
import { colorAtCursor, SAMPLE_SIZES, type ColorSample } from "../lib/capture";

const COUNTDOWN = 3;

/**
 * Temporary test bench for screen sampling (step 1.1): counts down, then reads
 * the color under the cursor wherever it is. The real picker overlay replaces
 * this in step 1.2.
 */
export function TryPick() {
  const [size, setSize] = useState<number>(1);
  const [left, setLeft] = useState<number | null>(null);
  const [sample, setSample] = useState<ColorSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function start() {
    setError(null);
    setLeft(COUNTDOWN);
    let n = COUNTDOWN;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setLeft(n);
        return;
      }
      window.clearInterval(timer.current);
      setLeft(null);
      colorAtCursor(size)
        .then(setSample)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 1000);
  }

  return (
    <section className="try-pick" aria-labelledby="try-pick-title">
      <div className="try-pick-head">
        <div>
          <h2 id="try-pick-title">Try screen sampling</h2>
          <span>Press Start, then move the mouse over anything on any monitor.</span>
        </div>
        <div className="try-pick-controls">
          <label>
            Average
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={left !== null}>
              {SAMPLE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? "1 pixel" : `${s} x ${s}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-btn" onClick={start} disabled={left !== null}>
            {left !== null ? `Sampling in ${left}…` : "Start"}
          </button>
        </div>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {sample && (
        <div className="try-pick-result" aria-live="polite">
          <span className="try-pick-swatch" style={{ background: sample.hex }} />
          <div>
            <strong className="mono-lg">{sample.hex}</strong>
            <span className="mono">
              rgb({sample.rgb.r}, {sample.rgb.g}, {sample.rgb.b}) at {sample.x}, {sample.y}
            </span>
            <span className="mono">
              {sample.monitor.name || "Monitor"} · {sample.monitor.width}x{sample.monitor.height} ·{" "}
              {Math.round(sample.monitor.scaleFactor * 100)}% · {sample.elapsedMs.toFixed(1)} ms
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
