import { useEffect, useState } from "react";
import { DEFAULT_SECTION, findSection } from "./sections";

/** Current section id from `#/<id>`, falling back to the Picker home. */
function current(): string {
  const id = window.location.hash.replace(/^#\/?/, "");
  return findSection(id) ? id : DEFAULT_SECTION;
}

export function useHashRoute(): [string, (id: string) => void] {
  const [id, setId] = useState(current);

  useEffect(() => {
    const onChange = () => setId(current());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (next: string) => {
    window.location.hash = `/${next}`;
  };

  return [id, navigate];
}
