import { useEffect, useState } from "react";
import { getCatalog, onCatalogChanged, type Catalog } from "./lib/fonts";

/** The font catalog (cached API copy or the bundled snapshot), reloaded when it is refreshed. */
export function useFontCatalog(): { catalog: Catalog | null; error: string | null } {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getCatalog()
        .then((c) => alive && setCatalog(c))
        .catch((e) => alive && setError(`Could not load the font catalog: ${e}`));
    void load();
    const off = onCatalogChanged(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return { catalog, error };
}
