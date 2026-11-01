import { useEffect, useState } from "react";
import { getCopyFormat, onCopyFormat, type ColorFormat } from "./lib/colors";

/** The app-wide copy format (picker.format), kept in sync with the toolbar. */
export function useCopyFormat(): ColorFormat {
  const [format, setFormat] = useState<ColorFormat>("hex");
  useEffect(() => {
    getCopyFormat().then(setFormat).catch(() => {});
    return onCopyFormat(setFormat);
  }, []);
  return format;
}
