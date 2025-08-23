import type { GalleryConfig, GalleryItem } from "../types";
import { slugify, normalize } from "./string";

export const buildAllFilters = (
  items: GalleryItem[],
  configured?: string[]
): string[] => {
  if (configured && configured.length) return configured;
  const set = new Set<string>();
  for (const it of items) {
    for (const t of it.tags || []) set.add(t);
  }
  return ["All", ...Array.from(set)];
};

export const otherFilterSet = (filters: string[]): Set<string> =>
  new Set(filters.map(normalize).filter((f) => f !== "all" && f !== "others"));

export const belongsToFilter = (
  item: GalleryItem,
  filter: string,
  allFilters: string[]
): boolean => {
  const nf = normalize(filter);
  if (nf === "all") return true;
  const tags = (item.tags || []).map(normalize);
  if (nf === "others") {
    const others = otherFilterSet(allFilters);
    return tags.length === 0 || tags.every((t) => !others.has(t));
  }
  return tags.includes(nf);
};

export const findFilterForPath = (
  path: string,
  allFilters: string[]
): string => {
  const seg = (path || "/").split("?")[0];
  if (seg === "/" || seg === "") return "All";
  const name = decodeURIComponent(seg.replace(/^\//, ""));
  const match = allFilters.find((f) => slugify(f) === slugify(name));
  return match || "All";
};

export const navigateToFilter = (f: string) => {
  const isAll = f === "All";
  const target = isAll ? "/" : `/${slugify(f)}`;
  try {
    history.pushState({ tag: f }, "", target);
  } catch {}
};

