import { sanitizeText } from '../maps/share-codec';
import { readJson, writeJson } from '../maps/store';
import type { MapDefinition } from '../maps/types';
import { getFormat, type FormatId } from './formats';

export type TemplateId = 'midnight-atlas' | 'nordic-explorer' | 'modern-cartographer' | 'travel-journal';
export type Typeface = 'template' | 'serif' | 'sans' | 'script';

export interface PosterSettings {
  template: TemplateId;
  format: FormatId;
  title: string;
  subtitle: string;
  name: string;
  dates: string;
  caption: string;
  /** Id of one of the template's accent colours, or "default". */
  accent: string;
  typeface: Typeface;
  showLabels: boolean;
  showList: boolean;
  showWishlist: boolean;
  showBrand: boolean;
  /** Percentages from the places ticked inside each province, on maps that have them. */
  showPlaces: boolean;
  /** With those percentages on: colour each province by its own, deeper for a higher one. */
  shadePlaces: boolean;
  /** Id of an achievement to show as a seal. Ignored unless it has been earned. */
  badge: string;
  bleed: boolean;
}

export const LIMITS = { title: 48, subtitle: 64, name: 40, dates: 28, caption: 120 } as const;

export const TEMPLATE_IDS: TemplateId[] = ['midnight-atlas', 'nordic-explorer', 'modern-cartographer', 'travel-journal'];

export function defaultSettings(def: MapDefinition): PosterSettings {
  return {
    template: 'midnight-atlas',
    format: 'post',
    title: def.defaultPosterTitle,
    subtitle: '',
    name: '',
    dates: '',
    caption: '',
    accent: 'default',
    typeface: 'template',
    showLabels: true,
    showList: true,
    showWishlist: false,
    showBrand: true,
    showPlaces: true,
    shadePlaces: true,
    badge: '',
    bleed: false,
  };
}

/** One line of plain text, trimmed to a limit. Applied to everything a visitor types. */
export function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return sanitizeText(value.slice(0, 2000), limit);
}

/** Accepts anything (old saved data, a hand-edited value) and returns valid settings. */
export function normalizeSettings(def: MapDefinition, input: Partial<Record<keyof PosterSettings, unknown>> | null): PosterSettings {
  const base = defaultSettings(def);
  if (!input || typeof input !== 'object') return base;
  const bool = (key: keyof PosterSettings) => (typeof input[key] === 'boolean' ? (input[key] as boolean) : (base[key] as boolean));
  return {
    template: TEMPLATE_IDS.includes(input.template as TemplateId) ? (input.template as TemplateId) : base.template,
    format: getFormat(input.format as string).id,
    title: typeof input.title === 'string' ? cleanText(input.title, LIMITS.title) : base.title,
    subtitle: cleanText(input.subtitle, LIMITS.subtitle),
    name: cleanText(input.name, LIMITS.name),
    dates: cleanText(input.dates, LIMITS.dates),
    caption: cleanText(input.caption, LIMITS.caption),
    accent: typeof input.accent === 'string' && /^[a-z-]{1,24}$/.test(input.accent) ? input.accent : 'default',
    typeface: (['template', 'serif', 'sans', 'script'] as Typeface[]).includes(input.typeface as Typeface)
      ? (input.typeface as Typeface)
      : 'template',
    showLabels: bool('showLabels'),
    showList: bool('showList'),
    showWishlist: bool('showWishlist'),
    showBrand: bool('showBrand'),
    showPlaces: bool('showPlaces'),
    shadePlaces: bool('shadePlaces'),
    badge: typeof input.badge === 'string' && /^[a-z-]{0,40}$/.test(input.badge) ? input.badge : '',
    bleed: bool('bleed'),
  };
}

export function loadSettings(def: MapDefinition): PosterSettings {
  return normalizeSettings(def, readJson<Partial<PosterSettings>>(`poster:${def.id}`));
}

export function saveSettings(def: MapDefinition, settings: PosterSettings): boolean {
  return writeJson(`poster:${def.id}`, settings);
}
