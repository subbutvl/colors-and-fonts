import type { Section } from "../sections";

export function PageHead({ section }: { section: Section }) {
  return (
    <header className="page-head">
      <h1>{section.title}</h1>
      <p>{section.blurb}</p>
    </header>
  );
}
