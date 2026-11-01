import type { Section } from "../sections";

export function Placeholder({ section }: { section: Section }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>
          {section.num !== undefined && <span className="page-num">{section.num}</span>}
          {section.title}
        </h1>
        <p>{section.blurb}</p>
      </header>
      <div className="empty">
        <strong>Coming in Phase {section.phase}</strong>
        <span>This section is planned in docs/ROADMAP.md.</span>
      </div>
    </div>
  );
}
