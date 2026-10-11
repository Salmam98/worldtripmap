# How WorldTripMap is built

This is the map of the codebase: what each part does, how data moves through it, and the exact
steps for adding a new map. For setup and commands see the [README](../README.md).

## The short version

- **Static site.** [Astro](https://astro.build) builds every page to plain HTML at build time.
  There is no server code, no database and no account system. A host only has to serve files.
- **Interactive parts are small islands.** The maps and the poster studio are
  [Preact](https://preactjs.com) components that load only on the pages that use them. Reading
  pages (guides, About, Terms and so on) ship no framework code at all.
- **A visitor's data never leaves their browser.** Marks, poster settings and a nickname are kept
  in `localStorage`. A share link carries the marks inside the link itself.
- **Map shapes are prepared ahead of time.** A script turns public-domain Natural Earth data into
  compact SVG paths, already projected, so the browser draws them without a mapping library.
- **Posters are drawn by the site's own engine**, which produces the on-screen preview, the PNG
  and the PDF from one description of the poster, so the three always match.

## Folders

```
src/
  pages/                 One file per page (or per group of pages)
    index.astro            Home
    maps/index.astro       "Explore maps": the three levels and what is coming
    maps/[map]/index.astro A map page, built once for each live map
    maps/[map]/poster.astro The poster studio for that map
    travel-map-poster.astro Poster landing page (designs, sizes, questions)
    guides/                The guides page (three shelves) and one page per guide, from Markdown in src/content/guides
    how-it-works, methodology, about, contact, privacy, terms, 404
    sitemap.xml.ts, robots.txt.ts
  layouts/               Base.astro (head, header, footer, security policy) and Page.astro
  components/            Astro components that render to plain HTML
  islands/               Everything that runs in the browser
    map/                   The map tool: MapApp, MapCanvas, PlaceList, panels, ShareDialog
    poster/                The poster studio
    ui/                    Dialog, Toast, Icon, ErrorBoundary, LoadState
    CanadaMap.tsx ...      One thin file per tool per map: it picks the data and the options
  lib/
    maps/                  Counting, sharing, saving, search, achievements, keyboard movement
    poster/                The poster engine (see below)
    guides/                What the guides and the printable checklists are made from (see below)
    analytics.ts, csp.ts, seo.ts, site.ts, routes.ts
  data/
    definitions/           Hand-written facts for each map: names, groups, counting rules
    reference/             Facts only a guide uses: land area of countries, the 22 World Heritage Sites
    maps/                  Generated shapes (JSON). Do not edit by hand
    catalog.ts             What the site offers, including "Coming soon" entries
    pages.ts               Titles, descriptions and copy for the map and studio pages
  content/guides/        The guides, in Markdown with their sources
  styles/                tokens.css (colours, type, spacing) and global.css
scripts/
  geo/                   Downloads and converts the map data
  assets/                Renders sample posters, social images and icons with the poster engine,
                         and the printable checklists
  content/               Writes the lists and tables inside the guides from the map data
  fonts/                 Prepares the fonts
  preview/               Builds a relative copy of the site for hosted previews
  dev/                   Screenshot helpers used while building
tests/                   Unit, built-site and browser tests (see docs/quality-report.md)
public/                  Files copied as they are: images, the printable checklists (downloads/),
                         _headers, _redirects, manifest
```

## A map is two things

Every map (the world by country, a country by region, a set of cities) is described the same way,
which is what makes new maps cheap to add.

1. **A definition**, written by hand: `src/data/definitions/<map>.ts`. It lists every place with a
   stable id (ISO 3166-1 alpha-3 for countries, ISO 3166-2 for provinces, a slug for cities), its
   name, its group (continent or region), whether it counts toward the total, and optionally the
   place on a broader map that contains it. It also holds the wording: what one place is called,
   the sentence that says what the percentage does and does not measure, poster titles, and the
   sources with their licences.
2. **Geometry**, generated: `src/data/maps/<map>.*.json`. Pre-projected SVG path data at up to
   three levels of detail, plus a small `meta` file with each place's bounding box, label point
   and size.

| File | Used for |
|---|---|
| `*.display.json` | The interactive map, the poster preview, and PNG files up to about 2,200 px wide |
| `*.print.json` | Large PNG files and every PDF. Fetched only at the moment of export |
| `canada.preview.json`, `world.art.json` | Light outlines: the stand-in shown while a map loads, the home page, thumbnails |
| `*.meta.json` | Label points, sizes and bounds. Small, loaded with the map |

Counting, statistics, achievements, share links, search, the checklist, the map canvas and the
poster engine all work from these two things and know nothing about any particular country.

### What is counted

| Map | Total | Rule |
|---|---|---|
| World | 195 | 193 UN member states plus the two UN observer states (Holy See, Palestine). 42 territories can be marked and are reported on a separate line, never inside the 195 |
| Canada | 13 | 10 provinces and 3 territories, grouped into the five regions the Government of Canada uses in *Discover Canada* |
| Canadian cities | 45 | The 41 census metropolitan areas of the 2021 Census, plus the four capitals that are not one (Charlottetown, Whitehorse, Yellowknife, Iqaluit) |

Progress on one map never changes another. Marking Alberta does not mark Calgary, and marking
Calgary does not mark Alberta. When a narrower map implies a place on a broader one, the broader
map offers to add it and does nothing until the visitor agrees (`src/lib/maps/rollup.ts`).

### Places inside a province: the second level

Marking Ontario says someone has been there, not how much of it they have seen. For that a map
can carry a **place layer**: a list of places inside each of its features. Canada has one,
`src/data/definitions/canada-places.ts`, with 178 places of four kinds.

| Kind | Count | What is listed |
|---|---|---|
| Cities | 45 | The cities of the cities map: 41 census metropolitan areas and four more capitals |
| Well-known places | 68 | A short editorial list of each province's best-known attractions. Not an official list |
| National parks | 49 | The 48 national parks and reserves, and Rouge National Urban Park |
| World Heritage Sites | 16 | UNESCO's 22 Canadian sites, less the six that are national parks already listed |

How it works:

- **One province per place.** `PlaceDef.within` is a single feature id, so a tick can never leak
  into a second province. A place that lies in two is listed in one and its note names the other.
- **The numbers** come from `src/lib/maps/places.ts`. A province's percentage is its ticked places
  over its listed places. The figure for the country is every ticked place over all of them, so
  each place weighs the same. Labels follow the site-wide rule: "<1%" for a small share, "100%"
  only when complete.
- **A city is one mark.** A place with `from: { map, id }` is a feature of another map, and its
  tick is read from and written to that map's saved marks. Toronto ticked in Ontario's list is
  Toronto marked on the cities map, and the other way round.
- **A tick implies its province, never the reverse.** Ticking a place in a province's list marks
  that province, because having been to Toronto means having been to Ontario. Marking a province
  ticks nothing. Places ticked in an unmarked province are offered through the same suggestion
  banner as before.
- **In the interface** the layer is a prop: `<MapApp places={CANADA_PLACES} />`. `usePlaces.ts`
  holds the ticks, `PlaceList` shows "3 of 31 places · 9%" under each row, `PlacesDialog.tsx` is
  the checklist for one province, and `ProgressPanel` shows the figure for the country with the
  result for each province that has something ticked. Maps
  without a layer are unchanged, and so is the small map on the home page.
- **On posters** the same summary is passed to `composePoster` as `places`. `posterFigures()`
  then makes the percentage for the country the large figure ("16% of Canada explored"), with
  "28 of 178 places visited" and the count of provinces on the small lines underneath. The list
  gets each province's percentage beside its name and one line saying what the percentages are.
  A wide figure such as "100%" is set smaller until it fits beside the list. The studio has a
  switch for all of it (`showPlaces`); switched off, or with nothing ticked, the poster is
  exactly as it was.

- **Colour follows the percentage.** `src/lib/maps/shade.ts` turns a share (0 to 1) into a tone
  between a pale tint and the full colour. It keeps the hue of the full colour, takes larger
  steps at the low end (a square-root curve, so 25% is halfway), keeps the lightest tone at
  least 1.5 to 1 from unmarked land, and picks a label colour that reaches 4.5 to 1 on every
  tone. On the map, `MapApp` works out a tone for each marked province once any place is ticked
  and hands it to `MapCanvas` through `toneOf`; the canvas sets it as a CSS variable (`--tone`),
  so the stylesheet still owns the fill and its hover state. The map key then shows the scale
  in place of the single "Explored" swatch. On posters the same function runs between each
  design's land colour and accent, colours the list's squares to match, and is switched by
  `shadePlaces`. The map's two base colours are repeated in `src/islands/map/tones.ts`, and a
  unit test fails if they ever differ from `tokens.css`.

To give another map a layer (states of the United States, say), write a `PlaceLayer` beside its
definition, pass it to the map's two island files and to the two placeholder components, and
add its facts to `tests/unit/places.test.ts`. Nothing else needs to change.

## Where the shapes come from

```
npm run geo:fetch    Natural Earth 5.1.2 -> .cache/natural-earth/v5.1.2/   (checked by SHA-256)
npm run geo:build    .cache -> src/data/maps/*.json
```

`scripts/geo/sources.ts` pins the exact files and their checksums, so a rebuild always starts
from the same data. `scripts/geo/build-geo.ts` then:

1. merges source features into the site's units (for example, the parts of a country that Natural
   Earth lists separately),
2. simplifies them with [mapshaper](https://github.com/mbloch/mapshaper) to each level of detail,
3. projects them with [d3-geo](https://d3js.org/d3-geo): Equal Earth, centred on 11°E, for the
   world; Lambert conformal conic with standard parallels 49°N and 77°N for Canada,
4. writes compact relative SVG paths in whole map units.

The output is committed. A normal `npm run build` does not need the source data or a network
connection. Running `geo:build` twice gives byte-identical files.

One editorial choice is made in this script and described on the site's Data and methods page:
Natural Earth draws de facto control, which puts Crimea inside Russia's shape. The site counts by
UN membership, so Crimea is drawn as part of Ukraine.

## The map tool (`src/islands/map`)

- `MapApp.tsx` holds one map page together: toolbar, map, progress, checklist, achievements,
  share dialog, the banner for a shared or challenge link.
- `MapCanvas.tsx` draws the SVG and handles pointer, touch, pinch, wheel and keyboard input.
  Places are focusable; arrow keys move to the nearest place in that direction
  (`src/lib/maps/spatial.ts`), Space marks it, plus and minus zoom.
- `PlaceList.tsx` is the searchable checklist: the dependable way to mark small places. The rows
  of a closed group are built when it is opened.
- `useMapState.ts` owns the visitor's marks: explored, want to go, or neither, so a place can
  never be counted twice. It keeps an undo history and saves after every change.
- `usePlaces.ts` and `PlacesDialog.tsx` are the second level, where a map has one: the places
  ticked inside each province. "Start over" clears them too, and Undo brings them back.

### What is stored, and where

| Key (in `localStorage`) | Contents |
|---|---|
| `wtm:v1:map:<map>` | Ids of explored and want-to-go places, and when it was saved |
| `wtm:v1:places:<layer>` | Ids of places ticked inside provinces, other than cities. A city's tick lives with the cities map |
| `wtm:v1:poster:<map>` | Poster choices: design, colour, lettering, shape, the text typed in |
| `wtm:v1:profile` | The nickname typed into a poster or a share link |
| `wtm:v1:consent` | The analytics choice, only when Google Analytics is configured |

`sessionStorage` holds `wtm:v1:rollup-dismissed:<map>` for the rest of a visit when a suggestion is
turned down. Every read and write is guarded: where storage is blocked the tool still works and
says plainly that the map will not be kept. The Privacy page has a button that deletes all of it.

### Share and challenge links

`src/lib/maps/share-codec.ts` packs the marks into the part of the address after `#`:

```
/maps/canada/#v=DEA&n=Salman&c=1
              |     |        └ c=1: a challenge ("mark yours, then compare")
              |     └ optional nickname, cleaned and limited to 40 characters
              └ explored places as a bit set in base64url
```

Browsers do not send that part of an address to a server, so the marks in a link reach nobody but
the people the link is sent to. Nothing is stored anywhere, which also means there is nothing to
revoke: a link is only as public as the places it was posted.

A share link carries the marked provinces, not the places ticked inside them. The picture made by
"Share image" and the poster do carry the percentages.

Bits are assigned in each definition's `shareOrder`. **Never reorder or remove ids in
`shareOrder`; only append.** Links already shared depend on it, and
`tests/fixtures/share-order.v1.json` fails the build if the order changes.

## The poster engine (`src/lib/poster`)

```
settings + marks + geometry
        │  compose.ts, templates.ts   lay the poster out in "poster units" (1,080 on the short side)
        ▼
      Scene                            a plain list of filled and stroked paths (scene.ts)
        ├── render-svg.ts     -> the live preview
        ├── render-canvas.ts  -> PNG (export.ts adds the print resolution to the file)
        └── pdf.ts            -> vector PDF 1.4, with a TrimBox when bleed is added
```

- **Text is drawn as outlines.** `painter.ts` measures, wraps and converts every line of text to
  paths with [opentype.js](https://opentype.js.org), using the same font data for all three
  outputs. That is why the preview and the files agree to the unit, and why a print shop never
  reports a missing font.
- **Other scripts.** The bundled fonts cover Latin text. A name in Bengali, Arabic, Chinese and
  so on is drawn with the device's own font and placed in the poster as an image
  (`raster-text.ts`), so it still appears, at slightly lower sharpness in a PDF.
- **Templates** (`templates.ts`): Midnight Atlas, Nordic Explorer, Modern Cartographer and Travel
  Journal. Each is a function that draws onto the shared layout, so a new design is one more
  entry.
- **Shapes and sizes** (`formats.ts`): Post 4:5, Story 9:16, Pin 2:3, Poster 3:4 (18 × 24 in),
  Poster wide, A3 and A3 wide. PNG sizes stay under 16.7 million pixels so the same export works
  on phones.
- The font library and the typefaces are fetched only on the studio pages; the detailed print
  geometry only when a large file is exported.

## The guides (`src/content/guides`, `src/lib/guides`)

A guide is a Markdown file with front matter: title, description, the map it leads to (`map`),
its shelf on the guides page (`topic`), its sources, and any files to print (`downloads`). Adding
a file publishes a guide. It then appears on the guides page, on the page of its map, at the foot
of every other guide and in the sitemap without another edit.

**Lists that cannot drift.** Many guides repeat what a map holds: the 195 countries, the 48
national parks, the 41 metropolitan areas. Those parts are not written by hand. In the Markdown
they sit between two comments,

```
<!-- data:parks-checklist -->
...
<!-- /data:parks-checklist -->
```

and `npm run guides:sync` writes what belongs between them (`scripts/content/guide-blocks.ts`),
from `src/lib/guides/lists.ts`, which reads the same definitions the maps do. `npm test` runs the
same code and fails when a guide differs from it, and it also checks the sentences around the
lists that quote a total ("British Columbia has the most, with seven"). So a park added to
`canada-places.ts` reaches the map, the guide, its table and its checklist together, or the tests
say exactly what is behind.

Two small reference files hold facts that only a guide uses, each with its source and the date it
was read: `src/data/reference/land-area.ts` (World Bank) and `unesco-canada.ts` (UNESCO). The
second ties each World Heritage Site to the places on the Canada map that stand for it, and a
test keeps the two in step.

**Printable checklists.** `npm run checklists:build` lays out each checklist
(`src/lib/guides/checklists.ts`) on a Letter and an A4 page with the poster fonts, as large as
the page allows (`checklist-pdf.ts`), and writes a PDF and a small picture of the sheet to
`public/downloads/`. The PDF writer here (`sheet.ts`) differs from the posters' in one way: a
checklist is nearly all text, so each letter shape is stored once and placed wherever it is used.
That makes a page of 237 names about 80 KB, where the posters' writer would make it more than
800 KB. Like the posters, the file is pure vector and needs no fonts on the printer's side. Each
PDF records a fingerprint of its contents, and a test compares it with the data, so a stale file
cannot be published.

**On paper.** A guide also prints well straight from the browser: a print stylesheet in
`global.css` drops the header, footer and buttons, sets a checklist in four columns, and writes
each source's address after its name.

## Loading without a jump

A tool needs its scripts before it can be used, and the page must not rearrange itself when they
arrive. So each tool page is built with a **stand-in**: the very same component, drawn to plain
HTML when the site is built, in a "shell" mode with a light picture in place of the interactive
map and with every control switched off (`MapPlaceholder.astro`, `StudioPlaceholder.astro`).

```html
<div data-island-host>
  <div data-placeholder> …the tool as it first appears, as plain HTML… </div>
  <astro-island> …the live tool mounts here… </astro-island>
</div>
```

When the live tool mounts, `ErrorBoundary.tsx` removes the stand-in in the same frame. Because
both are the same component with the same styles, every block is in the same place before and
after. Saved marks, poster settings and a shared link are read before the first frame, so a
returning visitor sees no second rearrangement either. `tests/e2e/loading.spec.ts` checks both.

The stand-in also covers the unhappy cases: with JavaScript switched off it shows the picture and
says what is needed, and if the scripts have not arrived twelve seconds after the page loaded it
says so and offers a reload.

## Security and privacy by construction

- **No secrets.** There are no API keys anywhere. Only variables that begin with `PUBLIC_` reach
  the browser, and none of them is confidential.
- **Content Security Policy.** `src/lib/csp.ts` builds a policy that only lets a page load from,
  and send data to, the site itself, plus the analytics and contact-form services you configure.
  It is sent as a `<meta>` tag so it works on every static host.
- **Text typed by visitors** (titles, names, captions) is length-limited, stripped of control and
  direction-override characters, and only ever written to the page as text or as vector outlines,
  never as HTML.
- **Share links** are parsed defensively: unknown ids, oversized values and malformed input are
  ignored.
- **Analytics is off by default.** When turned on, events carry the map id and coarse counts
  only: never a name, never which places were marked, never the part of the address after `#`.

## Adding a new map

The example is the United States by state. The same steps apply to Bangladesh by district, or to
any set of cities.

1. **Find licensed data** with accurate boundaries, and note the licence. Natural Earth's
   `ne_10m_admin_1_states_provinces_lakes` (public domain) already contains the US states. For
   districts or neighbourhoods you will usually need a national statistics office or a comparable
   open dataset; check that its licence allows redistribution, and credit it.
2. **Write the definition**: `src/data/definitions/usa.ts`, modelled on `canada.ts`. Give every
   place a stable id (`US-CA`), a name, a group and `countable: true`. Fill in `unit`, `scope`,
   `countingNote`, `posterTitles`, `sources`, and `shareOrder` (the ids in any fixed order).
3. **Register it**: add the id to `MapId` in `src/lib/maps/types.ts` and the definition to `MAPS`
   in `src/lib/maps/registry.ts`. TypeScript will now point at every place that needs a decision
   for the new map.
4. **Generate the geometry**: add a `buildUsa()` function to `scripts/geo/build-geo.ts`, modelled
   on `buildCanada()`, choosing a projection that suits the country (Albers equal-area conic is
   the usual choice for the United States). If the data is a new file, add it with its SHA-256 to
   `scripts/geo/sources.ts`. Run `npm run geo:fetch && npm run geo:build`.
5. **Add the two thin island files**: `src/islands/UsaMap.tsx` and `UsaPoster.tsx`, copies of the
   Canada ones that import the new data. Add the map's layout and zoom to
   `src/islands/map/options.ts`, and its print file to `src/lib/poster/data.ts`.
6. **Wire the pages**: one line each in `src/pages/maps/[map]/index.astro` and `poster.astro` to
   mount the new islands, and one case each in `MapPlaceholder.astro` and
   `StudioPlaceholder.astro` for the stand-in's picture.
7. **Write the copy**: an entry in `MAP_PAGES` in `src/data/pages.ts` (title, description,
   heading, how it counts, questions and answers). In `src/data/catalog.ts`, add `map: 'usa'` to
   the existing "United States" entry, which turns "Coming soon" into a link.
8. **Achievements**: add an entry for the map to `RULES` in `src/lib/maps/achievements.ts`. The
   four standard rules (First Adventure, Regional Explorer, Halfway There, Complete Explorer) are
   ready to reuse; write any that are specific to the map beside them. Every rule states itself
   in words and reports "have / need", so nothing is awarded that the map does not show.
9. **Images**: add the map to `scripts/assets/build-assets.ts` and run `npm run assets:build` for
   its social image and sample posters.
10. **Tests**: add the map to `tests/helpers/geo.ts`, to the `META` and `TOOLS` lists in the
    browser tests, and freeze its share order in `tests/fixtures/share-order.v1.json`. Then run
    `npm run test:all`. The data tests check the new map automatically: unique ids, every place
    drawn at every level of detail, label points inside their shapes, totals that match the copy.

The sitemap, the "Explore maps" page, internal links and the poster landing page pick the new map
up from the registry.
