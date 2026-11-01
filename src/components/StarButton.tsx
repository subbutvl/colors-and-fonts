/** Star toggle for one color. */
export function StarButton({
  on,
  onClick,
  className = "",
  disabledReason,
}: {
  on: boolean;
  onClick: () => void;
  className?: string;
  /** When set, the button is disabled and this explains why. */
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      className={`star-btn${on ? " on" : ""} ${className}`.trim()}
      onClick={onClick}
      disabled={!!disabledReason}
      aria-pressed={on}
      aria-label={on ? "Remove from Saved" : "Save to Saved"}
      title={disabledReason ?? (on ? "Starred: click to remove from Saved" : "Star: keep it in Saved")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </svg>
    </button>
  );
}
