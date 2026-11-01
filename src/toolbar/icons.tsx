/** Stroke icons for the toolbar (24x24 grid, currentColor). */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const PlusIcon = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const DropperIcon = () => (
  <svg {...base}>
    <path d="m2 22 1-1h3l9-9" />
    <path d="M3 21v-3l9-9" />
    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
  </svg>
);
export const FontIcon = () => (
  <svg {...base}>
    <path d="M4 20 9.5 5h1L16 20" />
    <path d="M6.2 14h7.6" />
    <path d="M17 12.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm2.5 0V20" />
  </svg>
);
export const HistoryIcon = () => (
  <svg {...base}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);
export const AppIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const CopyIcon = () => (
  <svg {...base}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
export const CheckIcon = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
