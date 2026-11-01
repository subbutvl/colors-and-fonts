import { useState } from "react";
import {
  acceleratorFromEvent,
  prettyShortcut,
  setShortcut,
  SHORTCUT_NAMES,
  type ShortcutStatus,
} from "../lib/shortcuts";

interface Props {
  status: ShortcutStatus;
  onChange: (s: ShortcutStatus) => void;
}

export function ShortcutRow({ status, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (accelerator: string) => {
    setBusy(true);
    try {
      onChange(await setShortcut(status.action, accelerator));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setRecording(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      setRecording(false);
      return;
    }
    const accelerator = acceleratorFromEvent(e);
    if (!accelerator) return; // still holding modifiers
    if (!accelerator.includes("+")) {
      setError("Add Ctrl, Alt, Shift or Win so the shortcut doesn't block normal typing.");
      return;
    }
    apply(accelerator);
  };

  const isDefault = status.accelerator === status.default_accelerator;
  const id = `shortcut-${status.action}`;

  return (
    <div className="setting-row shortcut-row">
      <div>
        <strong id={`${id}-label`}>{SHORTCUT_NAMES[status.action]}</strong>
        <span>
          {recording
            ? "Press the new keys, or Esc to cancel."
            : status.registered
              ? "Works from any app."
              : "Not available: another app is using these keys. Choose a different combination."}
        </span>
        {status.saved_failed && !error && (
          <span className="field-error" role="status">
            Your shortcut {prettyShortcut(status.saved_failed.accelerator)} couldn't be set up this time, so the
            default is in use. {status.saved_failed.error}
          </span>
        )}
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="shortcut-actions">
        <button
          id={id}
          type="button"
          className={`shortcut${status.registered ? "" : " off"}${recording ? " recording" : ""}`}
          aria-labelledby={`${id}-label ${id}`}
          aria-pressed={recording}
          disabled={busy}
          onClick={() => {
            setError(null);
            setRecording((r) => !r);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setRecording(false)}
        >
          {recording ? "Press keys…" : prettyShortcut(status.accelerator)}
        </button>
        {!isDefault && !recording && (
          <button type="button" className="link-btn" disabled={busy} onClick={() => apply(status.default_accelerator)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
