import { GROUPS, SECTIONS } from "../sections";
import { ThemeSwitch } from "./ThemeSwitch";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ active, onNavigate }: Props) {
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
                {s.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <ThemeSwitch />
        <button
          type="button"
          className={`nav-item${active === "settings" ? " active" : ""}`}
          aria-current={active === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
        >
          <span className="nav-icon" aria-hidden="true">⚙</span>
          Settings
        </button>
      </div>
    </nav>
  );
}
