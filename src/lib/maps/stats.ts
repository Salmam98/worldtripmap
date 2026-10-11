import { CANADA_REGIONS, CANADA_TOTAL_AREA_KM2 } from '../../data/definitions/canada';
import type { MapDefinition, Selection } from './types';

export interface GroupStat {
  id: string;
  name: string;
  visited: number;
  total: number;
}

export interface MapStats {
  /** Countable features marked as explored. A feature is never counted twice. */
  visited: number;
  /** Countable features on the map. */
  total: number;
  /** Exact share of countable features, 0 to 100. */
  percent: number;
  /** The share as people should read it: never "0%" for some, never "100%" for almost all. */
  percentLabel: string;
  complete: boolean;
  /** Non-countable features (territories) marked as explored, and how many exist. */
  otherVisited: number;
  otherTotal: number;
  wishlist: number;
  /** Per group, counting countable features only. */
  groups: GroupStat[];
  /** Groups with at least one countable feature explored. */
  groupsTouched: number;
  /** Groups that contain at least one countable feature. */
  groupsTotal: number;
}

export function percentLabel(visited: number, total: number): string {
  if (total <= 0 || visited <= 0) return '0%';
  if (visited >= total) return '100%';
  const exact = (visited / total) * 100;
  if (exact < 1) return '<1%';
  return `${Math.min(99, Math.round(exact))}%`;
}

export function computeStats(def: MapDefinition, selection: Selection): MapStats {
  let visited = 0;
  let total = 0;
  let otherVisited = 0;
  let otherTotal = 0;
  let wishlist = 0;
  const groups = new Map<string, GroupStat>(
    def.groups.map((g) => [g.id, { id: g.id, name: g.name, visited: 0, total: 0 }]),
  );

  for (const feature of def.features) {
    const isVisited = selection.visited.has(feature.id);
    if (!isVisited && selection.wishlist.has(feature.id)) wishlist++;
    if (!feature.countable) {
      otherTotal++;
      if (isVisited) otherVisited++;
      continue;
    }
    total++;
    const group = groups.get(feature.group);
    if (group) group.total++;
    if (isVisited) {
      visited++;
      if (group) group.visited++;
    }
  }

  const withFeatures = [...groups.values()].filter((g) => g.total > 0);
  return {
    visited,
    total,
    percent: total ? (visited / total) * 100 : 0,
    percentLabel: percentLabel(visited, total),
    complete: total > 0 && visited === total,
    otherVisited,
    otherTotal,
    wishlist,
    groups: withFeatures,
    groupsTouched: withFeatures.filter((g) => g.visited > 0).length,
    groupsTotal: withFeatures.length,
  };
}

/**
 * Share of Canada's total area (land and freshwater) that lies inside the provinces and
 * territories marked as explored. This measures the size of those places, not how much of them
 * someone has seen, and the interface always says so next to the number.
 */
export function canadaAreaShare(selection: Selection): { km2: number; percent: number; label: string } {
  let km2 = 0;
  for (const region of CANADA_REGIONS) if (selection.visited.has(region.id)) km2 += region.areaKm2;
  return { km2, percent: (km2 / CANADA_TOTAL_AREA_KM2) * 100, label: percentLabel(km2, CANADA_TOTAL_AREA_KM2) };
}

/**
 * 1234567 becomes "1,234,567", the way English-language Canadian text groups digits. It is done
 * by hand because the browser's own number formatter pauses noticeably the first time it is used
 * on a phone, and every map and poster shows a count the moment it opens.
 */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
