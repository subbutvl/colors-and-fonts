import { useCallback, useEffect, useState } from "react";
import { listMyDesignSystems, type MyDesignSystem } from "./lib/designSystems";
import { onLibraryChanged } from "./lib/library";

/** My design systems, kept fresh when any window changes the library. */
export function useMyDesignSystems(): { list: MyDesignSystem[]; error: string | null; loaded: boolean } {
  const [list, setList] = useState<MyDesignSystem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    listMyDesignSystems()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e) => setError(`Could not load your design systems: ${e}`))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    reload();
    return onLibraryChanged(reload);
  }, [reload]);
  return { list, error, loaded };
}
