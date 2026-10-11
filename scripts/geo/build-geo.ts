/**
 * Builds the map geometry used by the site and the poster engine.
 *
 *   npm run geo:fetch   download and verify the pinned Natural Earth files
 *   npm run geo:build   write src/data/maps/*.json
 *
 * For every map this script:
 *   1. reads a licensed dataset and keeps only the features named in the map's definition,
 *   2. merges and simplifies them with shared borders intact (mapshaper),
 *   3. projects them with a projection suited to the area (d3-geo),
 *   4. writes compact SVG path data at three levels of detail, plus label points and sizes.
 *
 * The output is committed, so the site builds without network access. Re-run this script only
 * when a definition or a source changes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  geoArea,
  geoConicConformal,
  geoEqualEarth,
  geoGraticule,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { CANADA_REGIONS } from '../../src/data/definitions/canada';
import { CANADA_CITIES } from '../../src/data/definitions/canada-cities';
import { WORLD_UNITS } from '../../src/data/definitions/world';
import type { FeatureGeo, Lod, MapGeoMeta, MapGeometry } from '../../src/lib/maps/types';
import { CACHE_DIR } from './sources';

const OUT_DIR = 'src/data/maps';
/** Every map is drawn in a coordinate space this many units wide. */
const WIDTH = 10_000;
const EARTH_RADIUS_KM = 6371.0088;

type Position = [number, number];
interface Polygon { type: 'Polygon'; coordinates: Position[][] }
interface MultiPolygon { type: 'MultiPolygon'; coordinates: Position[][][] }
interface Feature<G = Polygon | MultiPolygon> {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: G;
}
interface FeatureCollection<G = Polygon | MultiPolygon> {
  type: 'FeatureCollection';
  features: Feature<G>[];
}

interface LodSpec {
  lod: Lod;
  /** Simplification tolerance in metres on the ground. 0 keeps every vertex. */
  intervalM: number;
  /** Decimal places kept in path coordinates. */
  decimals: number;
  /** Rings smaller than this (map units squared) are dropped unless they are a feature's largest. */
  minRingArea: number;
  /** Lakes smaller than this (map units squared) are not drawn. */
  minLakeArea: number;
}

// ---------------------------------------------------------------------------------------------
// Reading and reshaping
// ---------------------------------------------------------------------------------------------

async function readSource<G = Polygon | MultiPolygon>(name: string): Promise<FeatureCollection<G>> {
  const file = path.join(CACHE_DIR, name);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`Missing ${file}. Run "npm run geo:fetch" first.`);
  }
}

function polygonsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * d3-geo reads ring direction on the sphere: a ring wound the "wrong" way means everything
 * except the polygon. Flip any polygon that comes out larger than half the globe.
 */
function orient(coordinates: Position[][]): Polygon {
  const polygon: Polygon = { type: 'Polygon', coordinates };
  if (geoArea(polygon as any) > 2 * Math.PI) {
    return { type: 'Polygon', coordinates: coordinates.map((ring) => [...ring].reverse()) };
  }
  return polygon;
}

function projectPolygons(projection: GeoProjection, geometry: Polygon | MultiPolygon): SubPath[][] {
  return polygonsOf(geometry).map((coordinates) => project(projection, orient(coordinates) as any));
}

function ringBounds(ring: Position[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

async function shape(
  inputs: Record<string, unknown>,
  commands: string,
): Promise<Record<string, FeatureCollection<any>>> {
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(inputs)) files[name] = JSON.stringify(data);
  const out = await mapshaper.applyCommands(commands, files);
  const parsed: Record<string, FeatureCollection<any>> = {};
  for (const [name, data] of Object.entries(out)) parsed[name] = JSON.parse(String(data));
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// Projecting and encoding
// ---------------------------------------------------------------------------------------------

interface SubPath { pts: Position[]; closed: boolean }

/** A drawing context for d3.geoPath that records coordinates instead of drawing them. */
class Recorder {
  subs: SubPath[] = [];
  private cur: SubPath | undefined;
  beginPath(): void {}
  moveTo(x: number, y: number): void {
    this.cur = { pts: [[x, y]], closed: false };
    this.subs.push(this.cur);
  }
  lineTo(x: number, y: number): void {
    this.cur?.pts.push([x, y]);
  }
  closePath(): void {
    if (this.cur) this.cur.closed = true;
  }
  arc(): void {}
}

function project(projection: GeoProjection, object: GeoPermissibleObjects): SubPath[] {
  const recorder = new Recorder();
  geoPath(projection, recorder as any)(object);
  return recorder.subs;
}

function signedArea(pts: Position[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function fmt(v: number, k: number): string {
  if (k === 1) return String(v);
  const neg = v < 0;
  const abs = Math.abs(v);
  const whole = Math.floor(abs / k);
  const frac = abs % k;
  let s = String(whole);
  if (frac) s += '.' + String(frac).padStart(String(k).length - 1, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + s;
}

/**
 * Encodes sub-paths as SVG path data: an absolute "M", then relative "l" segments.
 * Coordinates are snapped to a grid first, so repeated points and empty rings disappear.
 */
function encode(subs: SubPath[], spec: LodSpec, keepLargest = true): string {
  const k = 10 ** spec.decimals;
  const snapped = subs
    .map((s) => {
      const q: Position[] = [];
      for (const [x, y] of s.pts) {
        const qx = Math.round(x * k);
        const qy = Math.round(y * k);
        const last = q[q.length - 1];
        if (!last || last[0] !== qx || last[1] !== qy) q.push([qx, qy]);
      }
      if (s.closed && q.length > 1) {
        const a = q[0];
        const b = q[q.length - 1];
        if (a[0] === b[0] && a[1] === b[1]) q.pop();
      }
      return { q, closed: s.closed, area: s.closed ? Math.abs(signedArea(q)) / (k * k) : Infinity };
    })
    .filter((s) => (s.closed ? s.q.length >= 3 : s.q.length >= 2));

  if (!snapped.length) {
    // The whole feature is smaller than one grid cell (Vatican City, Monaco). Keep it on the map
    // as the smallest shape the grid can hold, so it can still be drawn, filled and found.
    const all = subs.flatMap((s) => s.pts);
    if (!keepLargest || !all.length) return '';
    const cx = Math.round((all.reduce((a, p) => a + p[0], 0) / all.length) * k);
    const cy = Math.round((all.reduce((a, p) => a + p[1], 0) / all.length) * k);
    const r = k;
    return `M${fmt(cx, k)} ${fmt(cy - r, k)}l${fmt(r, k)} ${fmt(r, k)}${fmt(-r, k)} ${fmt(r, k)}${fmt(-r, k)}${fmt(-r, k)}z`;
  }
  const largest = snapped.reduce((a, b) => (b.area > a.area ? b : a));
  let out = '';
  for (const s of snapped) {
    if (s.closed && s.area < spec.minRingArea && !(keepLargest && s === largest)) continue;
    const [x0, y0] = s.q[0];
    out += `M${fmt(x0, k)}${y0 < 0 ? '' : ' '}${fmt(y0, k)}l`;
    let px = x0;
    let py = y0;
    let first = true;
    for (let i = 1; i < s.q.length; i++) {
      const dx = s.q[i][0] - px;
      const dy = s.q[i][1] - py;
      px = s.q[i][0];
      py = s.q[i][1];
      out += `${first || dx < 0 ? '' : ' '}${fmt(dx, k)}${dy < 0 ? '' : ' '}${fmt(dy, k)}`;
      first = false;
    }
    if (s.closed) out += 'z';
  }
  return out;
}

function featureGeo(perPolygon: SubPath[][]): FeatureGeo {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let best: { area: number; polygon: SubPath[]; ring: SubPath } | undefined;
  let total = 0;
  for (const polygon of perPolygon) {
    // Holes wind the other way, so the signed sum is the polygon's area net of its holes.
    total += Math.abs(polygon.reduce((a, ring) => a + signedArea(ring.pts), 0));
    for (const ring of polygon) {
      for (const [x, y] of ring.pts) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
      const area = Math.abs(signedArea(ring.pts));
      if (!best || area > best.area) best = { area, polygon, ring };
    }
  }
  if (!best) throw new Error('Feature has no geometry after projection.');
  const sign = Math.sign(signedArea(best.ring.pts));
  const holes = best.polygon.filter((r) => r !== best!.ring && Math.sign(signedArea(r.pts)) !== sign);
  const size = Math.max(x1 - x0, y1 - y0);
  const [lx, ly] = polylabel([best.ring.pts, ...holes.map((h) => h.pts)], Math.max(1, size / 200));
  return {
    bbox: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
    label: [Math.round(lx), Math.round(ly)],
    size: Math.round(Math.sqrt(total) * 10) / 10,
  };
}

function fitWidth(projection: GeoProjection, object: GeoPermissibleObjects, pad: number): number {
  projection.fitWidth(WIDTH - pad * 2, object);
  const [tx, ty] = projection.translate();
  projection.translate([tx + pad, ty + pad]);
  const [[, top], [, bottom]] = geoPath(projection).bounds(object);
  return Math.ceil(bottom + pad + (top - pad < 0 ? 0 : 0));
}

function simplifyCommand(spec: LodSpec): string {
  return spec.intervalM > 0 ? `-simplify weighted keep-shapes interval=${spec.intervalM}` : '';
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  const text = JSON.stringify(data);
  await writeFile(file, text + '\n');
  console.log(`${file.padEnd(44)} ${(text.length / 1024).toFixed(1).padStart(8)} KB`);
}

// ---------------------------------------------------------------------------------------------
// World: countries and territories
// ---------------------------------------------------------------------------------------------

/**
 * Natural Earth draws de facto control, which places Crimea inside Russia's polygon. The site counts
 * countries on the UN's basis, and UN General Assembly resolution 68/262 affirms Ukraine's borders,
 * so the Crimea polygon is moved to Ukraine before features are merged. Change this function if you
 * need a different depiction; nothing else depends on it.
 */
function reassignCrimea(fc: FeatureCollection): void {
  const russia = fc.features.find((f) => f.properties.ADM0_A3 === 'RUS');
  const ukraine = fc.features.find((f) => f.properties.ADM0_A3 === 'UKR');
  if (!russia || !ukraine) throw new Error('Russia or Ukraine missing from source.');
  const russianPolygons = polygonsOf(russia.geometry);
  const isCrimea = (polygon: Position[][]) => {
    const [x0, y0, x1, y1] = ringBounds(polygon[0]);
    return x0 > 32 && x1 < 37 && y0 > 44 && y1 < 46.5;
  };
  const crimea = russianPolygons.filter(isCrimea);
  if (crimea.length !== 1) throw new Error(`Expected one Crimea polygon, found ${crimea.length}.`);
  russia.geometry = { type: 'MultiPolygon', coordinates: russianPolygons.filter((p) => !isCrimea(p)) };
  ukraine.geometry = { type: 'MultiPolygon', coordinates: [...polygonsOf(ukraine.geometry), ...crimea] };
}

// The world has no "preview" level: where a light outline is wanted (the stand-in shown while the
// map loads, the home page, thumbnails) the even lighter world.art.json below is used instead.
const WORLD_LODS: LodSpec[] = [
  { lod: 'display', intervalM: 7_000, decimals: 0, minRingArea: 3, minLakeArea: 40 },
  { lod: 'print', intervalM: 0, decimals: 1, minRingArea: 0.3, minLakeArea: 12 },
];

async function buildWorld(): Promise<void> {
  const source = await readSource('ne_50m_admin_0_countries_lakes.geojson');
  reassignCrimea(source);

  const unitOf = new Map<string, string>();
  for (const unit of WORLD_UNITS) for (const code of unit.ne) unitOf.set(code, unit.id);
  const unmapped: string[] = [];
  for (const feature of source.features) {
    const code = feature.properties.ADM0_A3;
    const uid = unitOf.get(code);
    if (!uid) unmapped.push(code);
    feature.properties = { uid: uid ?? '_land' };
  }
  // Siachen Glacier has no ISO code and no agreed owner; it is drawn as land that cannot be selected.
  if (unmapped.join() !== 'KAS') throw new Error(`Unexpected unmapped features: ${unmapped.join(', ')}`);

  const lakes = await readSource('ne_50m_lakes.geojson');
  lakes.features = lakes.features.filter((f) => f.properties.scalerank <= 2);

  const projection = geoEqualEarth().rotate([-11, 0]).precision(0.05);
  const sphere = { type: 'Sphere' } as const;
  const height = fitWidth(projection, sphere, 20);

  const meta: MapGeoMeta = {
    id: 'world',
    width: WIDTH,
    height,
    projection: {
      name: 'Equal Earth',
      detail: 'Equal-area projection centred on 11°E, which keeps the eastern tip of Russia attached and puts the map edge in the Bering Strait and the mid-Pacific.',
    },
    bounds: [20, 20, WIDTH - 20, height - 20],
    features: {},
  };

  for (const spec of WORLD_LODS) {
    const out = await shape(
      { 'in.geojson': source, 'lakes.geojson': lakes },
      `-i in.geojson name=land -dissolve2 uid ${simplifyCommand(spec)} -clean -o land.geojson precision=0.0001 ` +
        `-i lakes.geojson name=lakes ${simplifyCommand(spec)} -o lakes.geojson precision=0.0001`,
    );
    const geometry: MapGeometry = { id: 'world', lod: spec.lod, width: WIDTH, height, shapes: {} };
    const baseSubs: SubPath[] = [];
    for (const feature of out['land.geojson'].features as Feature[]) {
      const uid: string = feature.properties.uid;
      const perPolygon = projectPolygons(projection, feature.geometry);
      const subs = perPolygon.flat();
      if (uid === '_land') {
        baseSubs.push(...subs);
        continue;
      }
      geometry.shapes[uid] = encode(subs, spec);
      if (!geometry.shapes[uid]) throw new Error(`${uid} vanished at ${spec.lod}.`);
      if (spec.lod === 'print') meta.features[uid] = featureGeo(perPolygon);
    }
    if (baseSubs.length) geometry.base = encode(baseSubs, spec);

    const lakeSubs: SubPath[] = [];
    for (const feature of out['lakes.geojson'].features as Feature[]) {
      if (!feature.geometry) continue;
      const subs = projectPolygons(projection, feature.geometry).flat();
      const area = subs.reduce((a, s) => Math.max(a, Math.abs(signedArea(s.pts))), 0);
      if (area >= spec.minLakeArea) lakeSubs.push(...subs);
    }
    geometry.lakes = encode(lakeSubs, { ...spec, minRingArea: 0 }, false);
    geometry.outline = encode(project(projection, sphere), spec);
    geometry.graticule = encode(
      project(projection, geoGraticule().step([30, 30]).extent([[-180, -90], [180.01, 90.01]])()),
      spec,
    );

    const missing = WORLD_UNITS.filter((u) => !geometry.shapes[u.id]).map((u) => u.id);
    if (missing.length) throw new Error(`World ${spec.lod}: no geometry for ${missing.join(', ')}`);
    await writeJson(`world.${spec.lod}.json`, geometry);
  }
  await writeJson('world.meta.json', meta);

  // A very light version for decoration (the home page hero, thumbnails on cards): big shapes only.
  const art: LodSpec = { lod: 'preview', intervalM: 115_000, decimals: 0, minRingArea: 110, minLakeArea: 1e9 };
  const drawn = await shape(
    { 'in.geojson': source },
    `-i in.geojson name=land -dissolve2 uid ${simplifyCommand(art)} -clean -o land.geojson precision=0.001`,
  );
  const shapes: Record<string, string> = {};
  let rest = '';
  for (const feature of drawn['land.geojson'].features as Feature[]) {
    const uid: string = feature.properties.uid;
    const subs = projectPolygons(projection, feature.geometry).flat();
    const area = subs.reduce((a, s) => a + Math.abs(signedArea(s.pts)), 0);
    const d = encode(subs, art, false);
    if (!d) continue;
    // Only places big enough to see get their own shape; the rest are drawn as one.
    if (uid !== '_land' && area >= 2500) shapes[uid] = d;
    else rest += d;
  }
  // Curves are resampled coarsely here; at decoration size the difference cannot be seen.
  const coarse = geoEqualEarth().rotate([-11, 0]).scale(projection.scale()).translate(projection.translate()).precision(6);
  await writeJson('world.art.json', {
    width: WIDTH,
    height,
    outline: encode(project(coarse, sphere), art),
    graticule: encode(project(coarse, geoGraticule().step([30, 30]).extent([[-180, -90], [180.01, 90.01]])()), art),
    shapes,
    rest,
  });
}

// ---------------------------------------------------------------------------------------------
// Canada: provinces and territories, and major cities on the same base
// ---------------------------------------------------------------------------------------------

const CANADA_LODS: LodSpec[] = [
  { lod: 'preview', intervalM: 30_000, decimals: 0, minRingArea: 250, minLakeArea: 12_000 },
  { lod: 'display', intervalM: 2_200, decimals: 0, minRingArea: 4, minLakeArea: 2_500 },
  { lod: 'print', intervalM: 600, decimals: 1, minRingArea: 0.5, minLakeArea: 500 },
];

async function buildCanada(): Promise<void> {
  const source = await readSource('ne_10m_admin_1_states_provinces_lakes.geojson');
  const wanted = new Set(CANADA_REGIONS.map((r) => r.id));
  source.features = source.features
    .filter((f) => f.properties.iso_a2 === 'CA' && wanted.has(f.properties.iso_3166_2))
    .map((f) => ({ ...f, properties: { uid: f.properties.iso_3166_2 } }));
  if (source.features.length !== CANADA_REGIONS.length) {
    throw new Error(`Expected ${CANADA_REGIONS.length} Canadian regions, found ${source.features.length}.`);
  }

  const lakes = await readSource('ne_10m_lakes.geojson');
  lakes.features = lakes.features.filter((f) => {
    if (!f.geometry) return false;
    const [x0, y0, x1, y1] = ringBounds(polygonsOf(f.geometry)[0][0]);
    return x1 > -141 && x0 < -52 && y1 > 41.5 && y0 < 84;
  });

  // The projection Statistics Canada and Natural Resources Canada use for national maps.
  const projection = geoConicConformal()
    .parallels([49, 77])
    .rotate([91.866667, 0])
    .center([0, 63.390675])
    .precision(0.05);
  const height = fitWidth(projection, source as any, 120);
  const kmPerUnit = EARTH_RADIUS_KM / projection.scale();

  const meta: MapGeoMeta = {
    id: 'canada',
    width: WIDTH,
    height,
    projection: {
      name: 'Lambert conformal conic',
      detail: 'Standard parallels 49°N and 77°N, central meridian 91°52′W: the projection used for national maps of Canada.',
      kmPerUnit: Number(kmPerUnit.toFixed(5)),
      trueScaleNote: 'Scale is true along 49°N and 77°N.',
    },
    bounds: [0, 0, WIDTH, height],
    features: {},
  };

  for (const spec of CANADA_LODS) {
    const out = await shape(
      { 'in.geojson': source, 'lakes.geojson': lakes },
      `-i in.geojson name=land -dissolve2 uid ${simplifyCommand(spec)} -clean -o land.geojson precision=0.00001 ` +
        `-i lakes.geojson name=lakes -clip source=land ${simplifyCommand(spec)} -o lakes.geojson precision=0.00001`,
    );
    const geometry: MapGeometry = { id: 'canada', lod: spec.lod, width: WIDTH, height, shapes: {} };
    for (const feature of out['land.geojson'].features as Feature[]) {
      const uid: string = feature.properties.uid;
      const perPolygon = projectPolygons(projection, feature.geometry);
      geometry.shapes[uid] = encode(perPolygon.flat(), spec);
      if (spec.lod === 'print') meta.features[uid] = featureGeo(perPolygon);
    }
    const lakeSubs: SubPath[] = [];
    for (const feature of out['lakes.geojson'].features as Feature[]) {
      if (!feature.geometry) continue;
      const subs = projectPolygons(projection, feature.geometry).flat();
      const area = subs.reduce((a, s) => Math.max(a, Math.abs(signedArea(s.pts))), 0);
      if (area >= spec.minLakeArea) lakeSubs.push(...subs);
    }
    geometry.lakes = encode(lakeSubs, { ...spec, minRingArea: spec.minLakeArea / 4 }, false);

    const clipped = geoConicConformal()
      .parallels([49, 77])
      .rotate([91.866667, 0])
      .center([0, 63.390675])
      .scale(projection.scale())
      .translate(projection.translate())
      .clipExtent([[0, 0], [WIDTH, height]])
      .precision(0.05);
    geometry.graticule = encode(project(clipped, geoGraticule().step([10, 10])()), spec);

    const missing = CANADA_REGIONS.filter((r) => !geometry.shapes[r.id]).map((r) => r.id);
    if (missing.length) throw new Error(`Canada ${spec.lod}: no geometry for ${missing.join(', ')}`);
    await writeJson(`canada.${spec.lod}.json`, geometry);
  }
  const boxes = Object.values(meta.features).map((f) => f.bbox);
  meta.bounds = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
  await writeJson('canada.meta.json', meta);

  // Cities are points on the same projection, so they sit exactly on the provincial base map.
  const places = await readSource<{ type: 'Point'; coordinates: Position }>('ne_10m_populated_places.geojson');
  const canadian = places.features.filter((f) => f.properties.ADM0_A3 === 'CAN');
  const provinceName = new Map(CANADA_REGIONS.map((r) => [r.id, r.name]));
  const points: Record<string, [number, number]> = {};
  const cityMeta: MapGeoMeta = { ...meta, id: 'canada-cities', features: {} };
  for (const city of CANADA_CITIES) {
    let lonLat = city.lonLat;
    if (!lonLat) {
      const wantName = city.ne ?? city.name;
      const wantProvince = provinceName.get(city.province)!;
      const matches = canadian.filter(
        (f) =>
          f.properties.NAME === wantName &&
          (f.properties.ADM1NAME === wantProvince || f.properties.ADM1NAME === 'Québec' && wantProvince === 'Quebec'),
      );
      if (matches.length !== 1) throw new Error(`${city.name}: expected one populated place, found ${matches.length}.`);
      lonLat = matches[0].geometry.coordinates;
    }
    const xy = projection(lonLat);
    if (!xy) throw new Error(`${city.name} is outside the projection.`);
    const x = Math.round(xy[0]);
    const y = Math.round(xy[1]);
    points[city.id] = [x, y];
    cityMeta.features[city.id] = { bbox: [x, y, x, y], label: [x, y], size: 0 };
  }
  await writeJson('canada-cities.points.json', { id: 'canada-cities', width: WIDTH, height, points });
  await writeJson('canada-cities.meta.json', cityMeta);
}

await buildWorld();
await buildCanada();
