import { useEffect, useState } from "react";
import { getCatalog, type Catalog } from "./lib/fonts";

/** The font catalog (cached API copy or the bundled snapshot). */
export function useFontCatalog(): { catalog: Catalog | null; error: string | null } {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((e) => setError(`Could not load the font catalog: ${e}`));
  }, []);
  return { catalog, error };
}
