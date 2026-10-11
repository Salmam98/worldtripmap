import type { MapGeometry } from '../maps/types';

/**
 * Loads the detailed geometry for print-size files. Each print file is its own chunk, so it is
 * downloaded only at the moment someone exports a large poster.
 *
 * Only the print files may be imported here. The display files are imported directly by the map
 * and poster islands; importing one of them here as well would make the bundler wrap it in a
 * shared helper, and every map page would then download the font library that helper lives
 * beside. `tests/site` fails the build if that happens again.
 */
export async function loadPrintGeometry(display: MapGeometry): Promise<MapGeometry> {
  if (display.id === 'world') {
    return (await import('../../data/maps/world.print.json')).default as unknown as MapGeometry;
  }
  const canada = (await import('../../data/maps/canada.print.json')).default as unknown as MapGeometry;
  if (display.id === 'canada') return canada;
  // City maps are points on the outline of Canada. Only the outline has a more detailed version.
  return { ...display, lod: 'print', baseShapes: canada.shapes, lakes: canada.lakes, graticule: canada.graticule };
}
