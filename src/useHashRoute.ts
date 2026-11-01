import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./lib/env";
import { DEFAULT_SECTION, findSection } from "./sections";

/** Current section id from `#/<id>`, falling back to the Picker home. */
function current(): string {
  const id = window.location.hash.replace(/^#\/?/, "");
  return findSection(id) ? id : DEFAULT_SECTION;
}

/** Must match `NAVIGATE_EVENT` in src-tauri/src/lib.rs (sent by the tray menu). */
const NAVIGATE_EVENT = "huetype://navigate";

export function useHashRoute(): [string, (id: string) => void] {
  const [id, setId] = useState(current);

  useEffect(() => {
    const onChange = () => setId(current());
    window.addEventListener("hashchange", onChange);
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    if (isTauri()) {
      listen<string>(NAVIGATE_EVENT, (e) => {
        window.location.hash = `/${e.payload}`;
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onChange);
      unlisten?.();
    };
  }, []);

  const navigate = (next: string) => {
    window.location.hash = `/${next}`;
  };

  return [id, navigate];
}
