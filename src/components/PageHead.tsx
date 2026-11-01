import type { Section } from "../sections";

export function PageHead({ section }: { section: Section }) {
  return (
    <header className="page-head">
      <h1>
        {section.num !== undefined && <span className="page-num">{section.num}</span>}
        {section.title}
      </h1>
      <p>{section.blurb}</p>
    </header>
  );
}
