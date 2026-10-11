import type { PlacesSummary } from '../maps/places';
import type { MapDefinition, MapGeoMeta, MapGeometry, Selection } from '../maps/types';
import { composePoster, fontsFor } from './compose';
import { canShareFile, exportPng, saveFile, shareFile, type ExportedFile } from './export';
import { loadFonts } from './fonts';
import { getFormat, type FormatId } from './formats';
import { rasterText } from './raster-text';
import { cleanText, LIMITS, loadSettings } from './settings';

/**
 * Makes a share image straight from the map page, using whatever poster design the visitor last
 * chose (or the default). Loaded on demand, so the map page does not carry the poster engine.
 */
export async function makeShareCard(
  def: MapDefinition,
  meta: MapGeoMeta,
  geometry: MapGeometry,
  selection: Selection,
  name: string,
  formatId: FormatId = 'post',
  places?: PlacesSummary | null,
): Promise<ExportedFile> {
  const settings = { ...loadSettings(def), format: formatId };
  if (name.trim()) settings.name = cleanText(name, LIMITS.name);
  const format = getFormat(formatId);
  const fonts = await loadFonts(fontsFor(settings));
  const scene = composePoster({ def, meta, geometry, selection, settings, format, places }, fonts, rasterText);
  return exportPng(scene, def, settings, format.png[0]);
}

/** Shares the image with the system share sheet where that is possible, otherwise saves it. */
export async function shareOrSave(file: ExportedFile, text: string, url: string): Promise<'shared' | 'saved'> {
  if (canShareFile(file) && (await shareFile(file, text, url))) return 'shared';
  const objectUrl = saveFile(file);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return 'saved';
}
