export function PickerHome() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Picker</h1>
        <p>Pick a color from any app, or identify a font on screen.</p>
      </header>
      <div className="big-actions">
        <button type="button" className="big-action" disabled>
          <strong>Pick color</strong>
          <span>From any app or screen</span>
          <kbd>Ctrl + Shift + C</kbd>
        </button>
        <button type="button" className="big-action" disabled>
          <strong>Identify font</strong>
          <span>Drag around text</span>
          <kbd>Ctrl + Shift + F</kbd>
        </button>
      </div>
      <p className="note">
        The color picker arrives in Phase 1 and font identify in Phase 3. Close this window any time:
        Huetype keeps running in the system tray.
      </p>
    </div>
  );
}
