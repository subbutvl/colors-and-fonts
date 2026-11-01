import { PageHead } from "../components/PageHead";
import type { Section } from "../sections";

export function Placeholder({ section }: { section: Section }) {
  return (
    <div className="page">
      <PageHead section={section} />
      <div className="empty">
        <strong>Coming in Phase {section.phase}</strong>
        <span>This section is planned in docs/ROADMAP.md.</span>
      </div>
    </div>
  );
}
