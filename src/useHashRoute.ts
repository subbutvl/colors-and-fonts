import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./lib/env";
import { DEFAULT_SECTION, findSection } from "./sections";

/** `#/<id>` or `#/<id>/<arg>` (e.g. `#/color/5B6CFF`). */
function parts(): [string, string | undefined] {
  const [id, arg] = window.location.hash.replace(/^#\/?/, "").split("/", 2);
  return [id, arg || undefined];
}

/** Current section id, falling back to the Picker home. */
function current(): string {
  const [id] = parts();
  return findSection(id) ? id : DEFAULT_SECTION;
}

/** The route argument after the section id, if any. */
export function routeArg(): string | undefined {
  return parts()[1];
}

/** Must match `NAVIGATE_EVENT` in src-tauri/src/lib.rs (sent by the tray menu). */
const NAVIGATE_EVENT = "huetype://navigate";

export function useHashRoute(): [string, (id: string) => void, string | undefined] {
  const [id, setId] = useState(current);
  const [arg, setArg] = useState(routeArg);

  useEffect(() => {
    const onChange = () => {
      setId(current());
      setArg(routeArg());
    };
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

  return [id, navigate, arg];
}
