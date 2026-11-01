import { useCallback, useEffect, useState } from "react";
import { listStarred, onLibraryChanged, toggleStar } from "./lib/library";

/** The set of starred hex values (uppercase), kept fresh across windows. */
export function useStarred() {
  const [starred, setStarred] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    listStarred()
      .then((list) => setStarred(new Set(list.map((c) => c.hex))))
      .catch((e) => console.error("starred colors", e));
  }, []);

  useEffect(() => {
    reload();
    return onLibraryChanged(reload);
  }, [reload]);

  const isStarred = useCallback((hex: string) => starred.has(hex.toUpperCase()), [starred]);
  const toggle = useCallback((hex: string) => {
    toggleStar(hex).catch((e) => console.error("star", e));
  }, []);

  return { isStarred, toggle };
}
