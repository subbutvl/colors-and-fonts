import { GROUPS, SECTIONS } from "../sections";
import type { ThemePref } from "../useTheme";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
  theme: ThemePref;
  onTheme: (p: ThemePref) => void;
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function Sidebar({ active, onNavigate, theme, onTheme }: Props) {
  return (
    <nav className="sidebar" aria-label="Sections">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Huetype
      </div>
      <div className="sidebar-scroll">
        {GROUPS.map((group) => (
          <div key={group} className="nav-group">
            <div className="nav-group-title">{group}</div>
            {SECTIONS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`nav-item${s.id === active ? " active" : ""}`}
                aria-current={s.id === active ? "page" : undefined}
                ref={s.id === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => onNavigate(s.id)}
              >
                <span className="nav-num">{s.num ?? ""}</span>
                {s.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="theme-switch" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            className={theme === t.value ? "on" : ""}
            onClick={() => onTheme(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
