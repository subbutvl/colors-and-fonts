import { useCallback, useEffect, useState } from "react";
import { listStarredFonts, onLibraryChanged, starFont, unstarFont } from "./lib/library";

/** The set of starred font families, kept fresh across windows. */
export function useStarredFonts() {
  const [starred, setStarred] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    listStarredFonts()
      .then((list) => setStarred(new Set(list.map((f) => f.family))))
      .catch((e) => console.error("starred fonts", e));
  }, []);

  useEffect(() => {
    reload();
    return onLibraryChanged(reload);
  }, [reload]);

  const isStarred = useCallback((family: string) => starred.has(family), [starred]);
  const toggle = useCallback(
    (family: string) => {
      (starred.has(family) ? unstarFont(family) : starFont(family)).catch((e) => console.error("star font", e));
    },
    [starred],
  );

  return { isStarred, toggle };
}
