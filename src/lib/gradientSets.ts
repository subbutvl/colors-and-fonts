import data from "../data/curated-gradients.json";
import { DEFAULT_GRADIENT, fromColors, parseGradient, type Gradient } from "./gradient";

/** Curated gradients: our own JSON, read into full gradients. */
export interface CuratedGradient {
  name: string;
  group: string;
  gradient: Gradient;
}

interface Raw {
  name: string;
  group: string;
  colors?: string[];
  stops?: { color: string; pos: number }[];
  [key: string]: unknown;
}

function build(raw: Raw): CuratedGradient {
  const { name, group, colors, stops, ...rest } = raw;
  const base = { ...DEFAULT_GRADIENT, ...rest } as Gradient;
  const g = stops ? parseGradient({ ...base, stops }) : parseGradient(fromColors(colors ?? [], base));
  if (!g) throw new Error(`Bad curated gradient: ${name}`);
  return { name, group, gradient: g };
}

export const CURATED_GRADIENTS: CuratedGradient[] = (data.gradients as Raw[]).map(build);

export const GRADIENT_GROUPS: string[] = [...new Set(CURATED_GRADIENTS.map((g) => g.group))];
