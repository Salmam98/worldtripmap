/**
 * Shared map model.
 *
 * Every map on WorldTripMap (world countries, a country's regions, a set of cities) is described by
 * the same two things:
 *
 *  1. A hand-curated MapDefinition: stable ids, names, grouping, counting rules, parent links.
 *  2. Generated geometry: pre-projected SVG path data built by scripts/geo from a licensed dataset.
 *
 * Adding a country means adding one definition file and one entry in the geo build config.
 * No rendering, statistics, sharing or poster code needs to change.
 */

export type MapId = 'world' | 'canada' | 'canada-cities';
export type MapLevel = 'country' | 'region' | 'city';
export type Lod = 'preview' | 'display' | 'print';

export interface GroupDef {
  id: string;
  name: string;
}

export interface FeatureDef {
  /** Stable id, unique within its map: ISO 3166-1 alpha-3, ISO 3166-2, or a slug for cities. */
  id: string;
  name: string;
  /** Short label for the map face, e.g. "ON". */
  short?: string;
  /** Extra search terms. Never shown as the name. */
  aliases?: string[];
  group: string;
  /** Counts toward the headline total and percentage. */
  countable: boolean;
  /** Short qualifier shown beside the name in lists, e.g. "Territory" or "Denmark". */
  note?: string;
  /** The feature in a broader map that contains this one, e.g. a city's province. */
  parent?: { map: MapId; id: string };
  facts?: Record<string, string | number>;
}

export interface Plural {
  one: string;
  many: string;
}

export interface SourceDef {
  name: string;
  url: string;
  licence: string;
  note?: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  /** The rule, in words a visitor can check for themselves. */
  rule: string;
}

export interface MapDefinition {
  id: MapId;
  level: MapLevel;
  /** URL segment under /maps/. */
  slug: string;
  /** Short place name: "Canada", "World". */
  place: string;
  /** Name of the map in menus: "Canada: provinces and territories". */
  name: string;
  /** What one countable feature is called. */
  unit: Plural;
  /** What a non-countable feature is called, when the map has any. */
  otherUnit?: Plural;
  /** ISO 3166-1 alpha-2 of the country a regional or city map belongs to. */
  countryCode?: string;
  /** The feature of a broader map that this whole map sits inside. */
  parent?: { map: MapId; id: string };
  groups: GroupDef[];
  features: FeatureDef[];
  /**
   * Order used to pack selections into share links. Append new ids at the end and never reorder:
   * links people have already shared depend on it.
   */
  shareOrder: string[];
  /** The whole set in words, with its size: "Canada’s 13 provinces and territories". */
  scope: string;
  /** One plain sentence saying what the percentage does and does not measure. */
  countingNote: string;
  defaultPosterTitle: string;
  posterTitles: string[];
  sources: SourceDef[];
}

/** Geometry-derived facts for one feature, in map units. */
export interface FeatureGeo {
  /** [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
  /** A point safely inside the feature's largest polygon. */
  label: [number, number];
  /**
   * Square root of the feature's area, in map units: a single number for "how big is this on
   * screen". The map draws a tap marker for features that are small at the current zoom.
   */
  size: number;
}

export interface MapGeoMeta {
  id: MapId;
  width: number;
  height: number;
  projection: {
    name: string;
    detail: string;
    /** Kilometres per map unit where the projection's scale is true. Absent when no such line exists. */
    kmPerUnit?: number;
    trueScaleNote?: string;
  };
  /** The box that holds everything drawn, [minX, minY, maxX, maxY]. Posters fit the map to it. */
  bounds: [number, number, number, number];
  features: Record<string, FeatureGeo>;
}

export interface MapGeometry {
  id: MapId;
  lod: Lod;
  width: number;
  height: number;
  /** Area features: feature id -> SVG path data. */
  shapes: Record<string, string>;
  /** Point features: feature id -> [x, y]. */
  points?: Record<string, [number, number]>;
  /** Land that is drawn but cannot be selected. */
  base?: string;
  /** Named areas drawn under point features but not selectable, e.g. provinces under cities. */
  baseShapes?: Record<string, string>;
  lakes?: string;
  graticule?: string;
  /** Outline of the projected globe. */
  outline?: string;
}

/** A visitor's marks on one map. */
export interface Selection {
  visited: Set<string>;
  wishlist: Set<string>;
}

// ---------------------------------------------------------------------------------------------
// Places inside the features of a map
// ---------------------------------------------------------------------------------------------

/**
 * A map can carry a second level: the places inside each of its features, such as the cities,
 * parks and landmarks of a province. Marking them is how a visitor says how much of a province
 * they have seen. A place belongs to exactly one feature, so a mark never leaks into another one.
 */
export interface PlaceDef {
  /** Stable id, unique within its layer. */
  id: string;
  name: string;
  /** Id of one of the layer's kinds. */
  kind: string;
  /** Id of the feature (province, territory) the place is counted in. */
  within: string;
  /** Extra search terms. Never shown as the name. */
  aliases?: string[];
  /** Short qualifier shown beside the name, e.g. "World Heritage Site". */
  note?: string;
  /** When the place is also a feature of another map, its mark is kept there, in one place. */
  from?: { map: MapId; id: string };
}

export interface PlaceKindDef {
  id: string;
  name: Plural;
  /** One plain sentence saying which places of this kind are listed, and on whose authority. */
  rule: string;
}

export interface PlaceLayer {
  /** Used for storage on the device. */
  id: string;
  /** The map whose features contain these places. */
  map: MapId;
  kinds: PlaceKindDef[];
  places: PlaceDef[];
  /** One plain sentence saying what the percentages do and do not measure. */
  countingNote: string;
  sources: SourceDef[];
}
