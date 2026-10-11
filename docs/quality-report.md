# Quality report

What was measured and tested before hand-over, what the results were, what a person still has to
check, and what the site does not do. All results are from **11 October 2026**, on the build in
this repository. That build includes three things added after the first hand-over on 10 October:
the places inside each Canadian province and territory, colouring each province by its
percentage, and seven more guides with two printable checklists. Every step below was run again
on it.

## Summary

| Area | Result |
|---|---|
| Type checks | 0 errors, 0 warnings across 163 files |
| Unit tests | 407 of 407 pass |
| Checks on the built files | 422 of 422 pass |
| Browser tests, desktop and phone sizes | 450 pass, 0 fail, 16 skipped on purpose (each belongs to the other screen size) |
| Lighthouse, 14 pages, phone and desktop | Performance 98 to 100, Accessibility 100, Best practices 100, SEO 100 |
| Automated accessibility rules (WCAG 2.2 A and AA) | 0 violations on every page and on nine in-use states, at both sizes |
| Known security advisories in dependencies (`npm audit`) | 0 |

Three things these numbers do **not** cover, and which are listed under
[What a person still has to check](#what-a-person-still-has-to-check):

1. Everything ran in one browser engine, Chromium, on a computer. No real iPhone, Android phone,
   Safari or Firefox was used.
2. No screen reader was used. Automated rules find only part of what makes a page accessible.
3. Speed figures are laboratory measurements. Real Core Web Vitals come from real visitors and
   will appear in Search Console after launch.

## How it was measured

| | |
|---|---|
| Machine | Linux container, 2 CPU cores, Node.js 22.22 |
| Browser | Chromium 141 (the build Playwright 1.64 drives) |
| Speed and audits | Lighthouse 13.5.0. Each page three times; the middle result is reported. The Canada map on the phone profile was run five more times, for the reason given under "Notes on the audit", and the middle of those five is its row |
| Phone profile for Lighthouse | Its standard phone test: 412 × 823 screen, simulated slow 4G (about 1.6 Mbit/s, 150 ms delay) and a processor slowed four times |
| Server for Lighthouse | A small static server sending Brotli-compressed text and long cache times for fingerprinted files, as the recommended hosts do |
| Accessibility rules | axe-core 4.13: the WCAG 2.0, 2.1 and 2.2 level A and AA rule sets, plus its best-practice rules |
| Browser tests | Playwright 1.64 against the built site: a 1366 × 900 desktop and a Pixel 7 phone profile with touch |

## Performance

### Lighthouse results

Phone profile:

| Page | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Blocking time | Layout shift | Transferred |
|---|---|---|---|---|---|---|---|---|---|
| Home | 99 | 100 | 100 | 100 | 1.20 s | 1.95 s | 0 ms | 0.000 | 120 KB |
| Maps chooser | 100 | 100 | 100 | 100 | 1.05 s | 1.35 s | 0 ms | 0.000 | 65 KB |
| Canada map | 98 | 100 | 100 | 100 | 1.13 s | 1.51 s | 176 ms | 0.000 | 144 KB |
| World map | 99 | 100 | 100 | 100 | 1.08 s | 1.53 s | 98 ms | 0.000 | 173 KB |
| Canadian cities map | 99 | 100 | 100 | 100 | 0.98 s | 1.37 s | 112 ms | 0.000 | 138 KB |
| Canada poster studio | 100 | 100 | 100 | 100 | 0.91 s | 1.21 s | 65 ms | 0.000 | 316 KB |
| World poster studio | 100 | 100 | 100 | 100 | 0.91 s | 1.21 s | 50 ms | 0.000 | 338 KB |
| Poster page | 100 | 100 | 100 | 100 | 0.91 s | 1.59 s | 0 ms | 0.000 | 235 KB |
| Guides page | 100 | 100 | 100 | 100 | 1.06 s | 1.51 s | 0 ms | 0.000 | 66 KB |
| A guide (how to make a map) | 100 | 100 | 100 | 100 | 1.05 s | 1.41 s | 0 ms | 0.000 | 64 KB |
| Countries checklist guide | 100 | 100 | 100 | 100 | 1.06 s | 1.50 s | 0 ms | 0.000 | 76 KB |
| World Heritage Sites guide | 100 | 100 | 100 | 100 | 0.91 s | 1.35 s | 0 ms | 0.000 | 56 KB |
| Largest cities guide | 100 | 100 | 100 | 100 | 0.91 s | 1.35 s | 0 ms | 0.000 | 57 KB |
| Data and methods | 100 | 100 | 100 | 100 | 0.90 s | 1.35 s | 0 ms | 0.000 | 53 KB |

Desktop profile:

| Page | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Blocking time | Layout shift |
|---|---|---|---|---|---|---|---|---|
| Home | 100 | 100 | 100 | 100 | 0.35 s | 0.49 s | 0 ms | 0.000 |
| Maps chooser | 100 | 100 | 100 | 100 | 0.29 s | 0.37 s | 0 ms | 0.000 |
| Canada map | 100 | 100 | 100 | 100 | 0.32 s | 0.44 s | 4 ms | 0.000 |
| World map | 100 | 100 | 100 | 100 | 0.29 s | 0.37 s | 0 ms | 0.000 |
| Canadian cities map | 100 | 100 | 100 | 100 | 0.30 s | 0.38 s | 0 ms | 0.000 |
| Canada poster studio | 100 | 100 | 100 | 100 | 0.24 s | 0.32 s | 0 ms | 0.000 |
| World poster studio | 100 | 100 | 100 | 100 | 0.34 s | 0.48 s | 0 ms | 0.000 |
| Poster page | 100 | 100 | 100 | 100 | 0.25 s | 0.39 s | 0 ms | 0.000 |
| Guides page | 100 | 100 | 100 | 100 | 0.30 s | 0.38 s | 0 ms | 0.000 |
| A guide (how to make a map) | 100 | 100 | 100 | 100 | 0.29 s | 0.37 s | 0 ms | 0.000 |
| Countries checklist guide | 100 | 100 | 100 | 100 | 0.28 s | 0.36 s | 0 ms | 0.000 |
| World Heritage Sites guide | 100 | 100 | 100 | 100 | 0.24 s | 0.32 s | 0 ms | 0.000 |
| Largest cities guide | 100 | 100 | 100 | 100 | 0.24 s | 0.32 s | 0 ms | 0.000 |
| Data and methods | 100 | 100 | 100 | 100 | 0.25 s | 0.33 s | 0 ms | 0.000 |

Google's "good" thresholds for Core Web Vitals are a largest paint within 2.5 s and a layout shift
of 0.1 or less. Every page is inside both in the laboratory. The third vital, responsiveness to
input, can only be measured with real visitors; the blocking times above are its laboratory
stand-in.

### What each page sends before anyone touches it

Compressed sizes, counting the page, its styles, and every script it loads straight away.

| Page | Page | Styles | Scripts | Total |
|---|---|---|---|---|
| About, Contact, Privacy, Terms, How it works, Data and methods, Poster page | 3 to 8 KB | 5 to 6 KB | none | 9 to 13 KB |
| The eleven guides | 10 to 21 KB | 6 KB | none | 16 to 27 KB |
| Guides page, Maps chooser | 20 to 21 KB | 6 KB | none | 26 to 27 KB |
| Home | 40 KB | 13 KB | 8 KB | 62 KB |
| Canada map | 15 KB | 11 KB | 78 KB | 104 KB |
| Canadian cities map | 13 KB | 11 KB | 74 KB | 99 KB |
| World map | 23 KB | 11 KB | 101 KB | 136 KB |
| Canada poster studio | 9 KB | 11 KB | 90 KB | 109 KB |
| Canadian cities poster studio | 9 KB | 11 KB | 86 KB | 106 KB |
| World poster studio | 9 KB | 11 KB | 113 KB | 133 KB |

A guide's page is about 10 KB when it leads to the Canada or cities map and about 20 KB when it
leads to the world map, because the small world map drawn at its foot is part of the page. The
countries checklist, with 237 names in it, is 21 KB. The guides page shows one picture for each
of its three shelves, however many guides a shelf holds, so it stays at 21 KB as guides are added.

The places level and the colour scale together added about 8 KB of script to the Canada map (the
list of 178 places, the panel that shows it, and the scale) and about 4 KB to the other two maps,
which share the map's code but have no places to show. The seven guides added on 11 October
added no script anywhere and under 1 KB of styles to every page (the checklist, the box of files
to print, and the print layout). The whole built site is 127 files and 6.2 MB, most of it sample
poster images and the print-quality map shapes that load only when a poster is made. The four
printable checklists are about 80 KB each and are fetched only when a visitor asks for one.

### Why it is fast

- Every page is plain HTML made ahead of time. Twenty of the 27 pages load no script file,
  and that includes all eleven guides.
- The maps and the poster studio are the only interactive parts, and each loads on its own page.
  The map on the home page loads when a visitor scrolls near it.
- Map shapes are projected and simplified when the site is built, so no mapping library runs in
  the browser. A map script is mostly the map itself: about 60 KB for the world, 27 KB for Canada.
- The poster engine fetches its font library and typefaces only after a studio is open, and the
  print-quality shapes only when a file is made.
- Fonts are cut down to the alphabets needed (Latin for the site; Greek and Cyrillic as well for
  posters) and served from the site itself.
- Images carry their sizes, and each interactive part has a stand-in of the same size, so nothing
  moves while it loads. The browser tests check this on every tool page.

### Limits enforced by the tests

`npm run test:site` fails if any of these is exceeded (compressed sizes):

| Rule | Limit |
|---|---|
| Script on reading pages | under 6 KB |
| Page HTML, any page | under 45 KB |
| Styles, any page | under 30 KB |
| Home page script before the map loads | under 12 KB |
| Canada map and cities map script | under 80 KB |
| World map script | under 110 KB |
| Canada and cities poster studio script | under 95 KB |
| World poster studio script | under 125 KB |
| Social images | under 400 KB each |
| Printable checklists (PDF) | under 150 KB each |
| The font library | never loaded by a page that is not a poster studio |

The page closest to its limit is the Canada map: 78 KB of the 80 KB allowed. The next thing
added to that page should load on demand, or the limit should be raised on purpose. The natural
candidate is the detail of the places (names, other names and notes), which is only needed once
a visitor opens a province's list; the counts need far less.

### Notes on the audit

- **Two Lighthouse "insights" are flagged on every page** although the scores are 99 to 100:
  "Render-blocking requests" and "Network dependency tree". Both point at the same thing: each
  page loads between two and seven small stylesheets (13 KB or less in total) before it paints.
- **Putting the styles inside each page was tried and rejected.** In the same test, reading pages
  painted 0.14 to 0.24 s sooner, but the map and poster pages measured 0.3 to 0.6 s later under
  Lighthouse's simulated connection. With a mixed result on pages that already score 99 to 100,
  the build was left as it is. It is one line to revisit (`inlineStylesheets` in
  `astro.config.mjs`) once there is field data to judge it by.
- **The map pages show 50 to 190 ms of blocking time** on the slowed phone processor, from drawing
  the map. The Canada map went from about 80 ms to about 120 ms with the places level, which adds
  a line to each of its 13 rows. Lighthouse counts anything under 200 ms as good.
- **The Canada map is the page to watch.** Its script did not change with the guides, yet three
  sets of runs on this build gave 131, 192 and 176 ms of blocking time, against 117 ms the day
  before on the same code. That is the test machine varying, and it is also close to the 200 ms
  line. With its script at 78 KB of an 80 KB limit, this is the page where the next addition
  should load on demand. Field data after launch will say whether it matters to real phones.
- **Three smaller notes do not affect a score.** "Reduce unused JavaScript" on the poster studios
  (about 25 KB: the font library is loaded whole and a poster uses part of it). "Legacy
  JavaScript" on the same pages in some runs (about 7 KB, also in the font library). "Improve
  image delivery" on the poster page and the desktop home page: the example posters come in two
  widths, 540 and 1,080 pixels, and where one is shown smaller than 540 the browser has nothing
  smaller to pick, about 90 KB more than needed on the poster page. A third, 360-pixel version of
  each example would remove it.
- **Map-page scores move by a point or two between runs** on this shared test machine. In three
  sets of runs on 11 October the Canadian cities map scored 98, 100 and 99 on the phone profile,
  and its largest paint ranged from 1.35 s to 2.07 s. The first two sets were on the very same
  build, so the spread is the machine and not the page. The tables give the last set for each
  page, taken on the final build.

## Accessibility

### Automated checks

- **axe-core, WCAG 2.2 A and AA:** no violations on any of the 27 pages in the sitemap, the "page
  not found" page, and nine states in use: a map with places marked, a bucket list and
  achievements; the world map with every continent open; the "start over" confirmation; the share
  dialog; a shared map with the comparison view; the poster studio with every field filled and a
  file made; a search with no results; the list of places inside a province, with some ticked;
  and the Canada map with its provinces coloured by percentage. Each was checked at desktop and
  phone size.
- **Lighthouse accessibility:** 100 on all fourteen pages audited, at both sizes.

### Behaviour that is tested in a real browser

| What | How it is checked |
|---|---|
| The map works without a mouse | Tab reaches it; arrow keys move between places; Space marks; plus, minus and zero zoom. A test reaches all 13 provinces and territories by arrow keys alone |
| The map is not the only way | A searchable checklist does everything the map does. The two are tested to always agree |
| Places inside a province | The list is a dialog of labelled checkboxes under four headings, with a search box. It closes with Escape and returns focus to the line that opened it. Each tick is announced with the new count for that province. At 320 pixels wide nothing in it overflows |
| Colour by percentage | The tone of a province is never the only place its percentage is given: the same figure is in the list, in the results and in the name each shape announces. The map key shows the scale and says what it means. The tones are checked in the browser to run from light to dark in the order of the percentages |
| Names and roles | The map is a labelled group of checkboxes, each with its name and state. Progress is a progress bar with a readable value. Every field in the poster studio has a label. The poster preview describes itself in words |
| Announcements | Changes to the count are announced politely to assistive technology |
| Focus | A visible outline at least 2 pixels wide on every element reached with Tab. Dialogs close with Escape and return focus to the button that opened them. The first Tab offers "skip to content" |
| Touch | Every button and control on the map page is at least 24 × 24 CSS pixels at phone size |
| Motion | With "reduce motion" on, nothing animates and scrolling does not glide (checked on the home page; the rule is site-wide) |
| Zoom | At 200% text size, four key pages lose no content and do not scroll sideways |
| Small screens | At 320 pixels wide, eight key pages do not scroll sideways |
| Without scripts | Pages still read well, the questions and answers still open, and the map says what it needs |
| Tables in the guides | A heading wraps onto a second line before a table is made to scroll. A table that still does not fit (five columns on a phone) scrolls inside its own labelled region, and only then can that region take keyboard focus, so there is no pointless stop. The ranking of 41 cities is checked to fit a phone without scrolling |
| Checklists in the guides | Each is an ordinary list of 195, 42 or 49 items, so a screen reader announces the count and reads the names. The tick box is drawn and is not a control: on screen the ticking happens on the maps, and this list is for paper |
| Printing a guide | With the print stylesheet on, the header, footer, buttons and file links are gone, the checklist is set in four columns, and each source's address is printed after its name |
| When something fails | If the interactive part cannot load, the page says so and offers a reload |

### Colour contrast

WCAG AA asks for 4.5 to 1 for normal text. The pairs the design uses:

| Use | Colours | Ratio |
|---|---|---|
| Body text | navy `#101B2D` on ivory `#F8F6F0` | 16.0 : 1 |
| Secondary text | slate `#4F5B6B` on ivory | 6.4 : 1 |
| Small notes | slate `#5B6676` on ivory | 5.4 : 1 |
| Text on the dark hero | ivory on navy | 16.0 : 1 |
| Secondary text on navy | `#A9B3C1` on navy | 8.1 : 1 |
| Main button | navy on antique gold `#C6A66B` | 7.5 : 1 |
| Forest green button | ivory on `#315C4C` | 7.0 : 1 |
| Dark gold text on ivory | `#7E6431` on ivory | 5.2 : 1 |

The automated checks found no text below the required ratio on any page or state tested. On the
maps, explored places have a much darker fill than unexplored ones, so the difference does not
depend on telling two hues apart. Where provinces are coloured by percentage, the lightest tone
(a marked province with nothing ticked) is kept at least 1.5 to 1 from unmarked land, and the
short name written on a province is switched between light and dark so that it reaches 4.5 to 1
on every tone. Both rules are unit-tested across the whole scale, for the map and for all 20
colour schemes of the posters. "Want to go" places are hatched, and a friend's places in a
comparison are hatched the other way. Every state is also given as text in the checklist.

## Tests that were run

All on 11 October 2026, in this order, on a fresh build. `npm run test:all` runs the same steps.

| Step | Command | What it covers | Result |
|---|---|---|---|
| Types | `npm run check` | Astro and TypeScript, strict settings | 163 files, 0 errors, 0 warnings, 1 hint (a deliberate fallback for browsers without the modern clipboard) |
| Unit | `npm test` | Counting, percentages, achievements, saving, share links, search, keyboard movement, the poster engine, the data itself, the list of places, the colour scale, the guides against the data, the printable checklists | 407 passed in 15 files |
| Build | `npm run build` | Produces the site | 28 pages: the 27 in the sitemap and the "page not found" page, plus three short redirect addresses |
| Built files | `npm run test:site` | Titles, descriptions, one main heading per page, canonical addresses, social tags, structured data, every internal link, sitemap, robots, host files, page weight, and how the guides are shelved, linked and offered as files | 422 passed |
| Browser | `npm run test:e2e` | The site used as a visitor would, at two screen sizes | 450 passed, 16 skipped, 0 failed, in 10.0 minutes |

Unit tests by file:

| File | Tests | Subject |
|---|---|---|
| `poster.test.ts` | 147 | Four designs × three maps, what a poster shows, the percentage it leads with once places are ticked, provinces coloured by percentage and their labels staying readable, the list never overlapping itself or the large figure, SVG, PDF structure, sizes, print resolution, text limits |
| `data.test.ts` | 48 | 195 countries and 42 territories, 13 provinces and territories, 45 cities, map shapes, frozen share order |
| `guides.test.ts` | 34 | Every list and table inside a guide is exactly what the data produces; the sentences that quote a total; continents, territories by state, the 37 + 11 national parks, the 22 World Heritage Sites tied to places on the map, 41 city populations adding up to the published total, the land-area examples; titles, dates, sources, and each guide linked from at least two others |
| `share-codec.test.ts` | 26 | Packing places into a link and reading them back, damaged links, names |
| `checklists.test.ts` | 23 | The two printable checklists on Letter and A4: every name on the sheet once, a box for each, nothing past the margins or into the footer, type never below a readable size, a valid one-page PDF with each letter shape stored once, and the files in `public/downloads/` matching today's data |
| `places.test.ts` | 24 | The 178 places: four kinds, national parks counted per province against the source, all 22 World Heritage Sites accounted for, one province per place, the percentages, saving, and that the page text quotes the real totals |
| `shade.test.ts` | 18 | The colour scale: lightest for nothing ticked, the full colour for everything, deeper with every place, the same hue throughout, apart from unmarked land, readable labels; the map's colours matching the stylesheet |
| `stats.test.ts` | 18 | Counts, honest percentages, coverage against land area |
| `achievements.test.ts` | 17 | Every achievement's rule |
| `store.test.ts` | 14 | Saving on the device, cleaning bad data, suggestions between maps |
| `painter.test.ts` | 12 | Measuring and fitting text |
| `search.test.ts` | 10 | Finding places by everyday names, accents, abbreviations |
| `csp.test.ts` | 6 | The Content Security Policy for each analytics setting |
| `spatial.test.ts` | 6 | Arrow-key movement between places |
| `site.test.ts` | 4 | Link building, including the relative preview copy |

Browser tests by file (desktop passed / phone passed):

| File | Desktop | Phone | Subject |
|---|---|---|---|
| `site.spec.ts` | 53 | 53 | Every page loads cleanly and fits; navigation; 404 and redirects; home page; a visit makes no request to another site; "delete everything" really deletes; private browsing; no scripts; failure messages |
| `accessibility.spec.ts` | 43 | 43 | The checks in the section above |
| `guides.spec.ts` | 11 | 11 | The three shelves, six guides on the home page, guides listed on their map's page, the answer before the first heading, tables that wrap and then scroll, sources with the date checked, a box for each of 237 names, the two PDFs served as PDFs, and the print layout |
| `loading.spec.ts` | 20 | 20 | Nothing moves while a tool loads, for new and returning visitors and for shared maps |
| `map-canada.spec.ts` | 19 | 16 | Marking each of the 13 exactly once, list and map agreeing, undo, start over, reload, bucket list, coverage against land area, achievements, 100% only when complete, zoom, damaged saved data, keyboard |
| `poster.spec.ts` | 19 | 19 | The four designs, every text field, limits, typed markup shown as plain text, other alphabets; PNG and PDF files opened and measured: pixel sizes, print resolution, page sizes, 3 mm bleed, title and author |
| `places.spec.ts` | 24 | 24 | Opening a province's places, "only Toronto" giving 3% of Ontario, a province never ticking its own places, the result for each province and for Canada, a city being one mark on both maps, search by another name, Start over and Undo; provinces coloured from light to dark in the order of their percentages, the key, one colour until a place is ticked, a friend's shared map never shaded; the percentages and the colouring on the poster, with their switches; no layout shift, 320-pixel screens |
| `share.spec.ts` | 17 | 17 | Share links, nothing sent anywhere, read-only shared view, names that try to inject markup, unreadable links, challenge and comparison |
| `map-world-cities.spec.ts` | 15 | 14 | Counting out of 195, territories kept separate, everyday names, very small countries, zoom; 45 cities; maps stay separate and only suggest each other |
| `analytics.spec.ts` | 6 | 6 | Each of the ten events fires once at the right moment and carries no name, place or link content; no analytics script without a provider |

Each of the sixteen skipped tests belongs to the other screen size. Keyboard tests and the 200% zoom
check run only on the desktop. The menu button, touch-target and 320-pixel checks run only on the
phone. One test that clicks the smallest country markers runs only on the desktop, because on a
phone those markers appear after zooming in.

Also run by hand, outside the automated suites:

- **The relative preview copy** (`npm run preview:build`) inside a sandboxed frame with a strict
  policy: fourteen steps from the home page through marking a map, ticking two places in Ontario,
  checking the colours on the map and its key, opening the studio, making a PNG and a PDF, the
  guides page with its three shelves, a guide with its table of 41 cities, the countries
  checklist with its 237 boxes and its PDF, and back, at desktop and phone size. All passed.
- **The four checklist PDFs** checked with `qpdf --check` (no errors) and rendered with Poppler,
  then read at full size: every name, box, heading and footnote in place on Letter and on A4.
- **A clean copy**, unpacked from the project archive into an empty folder: `npm ci`, the type
  checks, the 407 unit tests, the build, the 422 checks on the built files and the guide browser
  tests all passed there, `npm run guides:sync -- --check` reported every guide up to date, and
  `npm run checklists:build` rebuilt the four PDFs and their pictures to the same bytes.
- **`npm audit`**: 0 known vulnerabilities, with and without development packages.
- **Every page looked at** in Chromium at phone and desktop widths during development.

Faults found by these runs and fixed before hand-over:

- **The "share" event** was reported after the clipboard had answered instead of when the
  visitor chose to copy, so on a slow machine it could arrive late. It now fires at the moment of
  the choice, like the other share events.
- **A message covered part of the map on phones.** The first version of the places level showed a
  pop-up message after a province was marked, offering its places. On a phone it sat over the
  bottom of the map and swallowed the next taps. It was replaced by a line under the map that is
  always there, so nothing moves and nothing is covered.
- **Poster list lines ran into each other** once a percentage followed a long name
  ("Newfoundland and Labrador 14%"). The columns now take the width each one needs. A unit test
  checks every design and shape with "100%" beside all thirteen names.
- **The large figure could reach the list beside it.** "100%" is far wider than "7". The figure
  is now set smaller, step by step, until it fits its own column, and the same test checks that
  nothing beside the list crosses into it. The rule also applies to the world poster, where
  "195" at its largest sizes now sits a little further from the list than before.
- **A button's spoken name did not begin with the words on it.** On the Canada map each province
  has a button reading "0 of 31 places". Its accessible name began "Places in Ontario", so someone
  using voice control could not say what they saw. Lighthouse listed this without counting it in
  the score, and it had been missed. The name now begins with the visible words.
- **A checklist PDF of 237 names came to 836 KB** when it was written the way posters are, with
  every letter of every name as its own outline. The checklists now have their own writer, which
  stores each letter shape once and places it wherever it is used: the same sheet is 80 KB, and
  still needs no fonts to print.
- **A draft line in the provinces guide called the Northwest Territories larger than Quebec.** It
  is not (1,346,106 km² against 1,542,056 km²). The line now reads "Only Nunavut is larger, and
  it is a territory", which the table on the same page bears out.
- **Tables in the guides scrolled sideways on a desktop** when their headings were long, because
  headings were never allowed to wrap. They wrap now, and the ranking of cities fits a phone.
- **The countries checklist was one long column on a phone**, 237 rows deep. It is two columns
  there now, three on a desktop and four on paper.

## What a person still has to check

None of these could be done from the build environment. Tick them off on the live site.

**Real devices and browsers**

- [ ] iPhone, Safari: mark places by touch on each map; pinch to zoom; make a poster; the PNG
      reaches Photos through the share sheet; the PDF opens in Files
- [ ] On a phone, Canada map: mark a province, press "Choose places" under the map, tick a few,
      and check the percentage on its line, in the results and on the poster
- [ ] Android phone, Chrome: the same; "Share image" opens the share sheet with the picture attached
- [ ] Safari and Firefox on a computer: maps, poster studio, both downloads
- [ ] A tablet in both orientations

**Assistive technology**

- [ ] VoiceOver on iPhone or Mac, and NVDA or JAWS on Windows: the map is read as a group of
      checkboxes with names and states; marking a place announces the new count; dialogs keep
      focus inside and give it back; the poster preview's description is read
- [ ] TalkBack on Android: the same on the checklist
- [ ] With any screen reader: the list of places inside a province is read as four groups of
      checkboxes, and each tick announces the new count
- [ ] Windows high-contrast mode: marked and unmarked places can still be told apart
- [ ] Colour vision: look at the shaded Canada map through a simulator (in Chrome: DevTools,
      Rendering, "Emulate vision deficiencies"). The tones should still step from light to dark

**Print**

- [ ] Print the 18 × 24 in PDF at a print shop, once with bleed and once without
- [ ] Print Midnight Atlas in particular: large dark areas are the hardest for printers
- [ ] Print one poster with "Colour by percentage" on: pale tones are the first to shift on paper,
      so check that a province with a low percentage still stands apart from one that is not marked
- [ ] Open a PDF in Adobe Acrobat and in Preview; check the title and author under Properties
- [ ] Print the countries checklist and the national parks checklist on real paper, Letter or A4,
      at "actual size". The names are set at about 7 points on the countries sheet: check that
      they read comfortably from your printer
- [ ] Open a checklist PDF on an iPhone and an Android phone, and in Acrobat and Preview. It was
      checked here with qpdf and Poppler only
- [ ] Print a guide straight from Safari and Firefox (the print layout was checked in Chromium)

**Sharing, on the real domain**

- [ ] Paste a share link into WhatsApp, iMessage, Facebook and LinkedIn: the preview shows the
      site's picture and title
- [ ] Open a challenge link on a second device and complete the comparison

**Hosting**

- [ ] `curl -I https://worldtripmap.com/` shows the security headers from `public/_headers`
- [ ] A made-up address returns status 404, not 200
- [ ] `http://` and `www.` both end at `https://worldtripmap.com/`

**Services you turn on**

- [ ] Contact: the mailbox receives mail. If you set a form service, send one real message and
      one that looks like spam
- [ ] Analytics: events appear in the provider's dashboard. With Google Analytics, confirm in the
      browser's network panel that nothing loads before "Allow analytics"

**Words**

- [ ] Read Privacy and Terms, add the operator's legal name and governing law, and have them reviewed

**The list of places**

- [ ] Read the 68 "well-known places" on the Data and methods page or in
      `src/data/definitions/canada-places.ts`. They are our own selection, and every percentage
      depends on them. Add, remove or rename anything you disagree with, then run `npm test`
- [ ] Once a year, check the two official lists for changes: national parks and reserves (Parks
      Canada) and World Heritage Sites (UNESCO adds sites at its committee's yearly meeting).
      After a change to the data, run `npm run guides:sync` and `npm run checklists:build`

**The guides**

- [ ] Read the seven guides added on 11 October as a reader would. Every figure in them was
      checked against the source named beside it on that day, but they have had one author and
      no second reader
- [ ] Read "Is Greenland a country?" with care. It describes the status of 42 places from the
      official pages of the states responsible for them and takes no side on the disputed ones.
      If the site's audience includes people from those places, ask one of them to read it
- [ ] On 10 February 2027, when Statistics Canada is due to publish the first 2026 Census counts,
      update the 41 city populations and the two guides that quote them

## Known limitations

**By design**

1. **No accounts and no cloud copy.** A map lives in one browser on one device. Clearing the
   browser's site data deletes it. A share link is the way to move a map to another device.
2. **A share link cannot be recalled.** The marks travel inside the link and nothing is stored
   on a server, so there is nothing to delete later. Anyone who has the link can open it. The
   optional name in a link is limited to 40 characters.
3. **Link previews show the site's picture, not the visitor's own map.** Making a personal preview
   would need a server that stores maps. The "Share image" button makes the picture to post instead.
4. **Countries, provinces and cities are counted separately.** Marking a city offers its province,
   and a province offers Canada, but nothing is added without the visitor's say. The one step
   that follows by itself: ticking a place inside a province's own list marks that province,
   because that is what the visitor has just said. Marking a province never ticks a place.

**Scope of this release**

5. **Three maps are live:** the world, Canada, and 45 Canadian cities. The United States,
   Bangladesh, world cities and city neighbourhoods are shown as "Coming soon" and are not linked.
6. **Cities are the 41 census metropolitan areas plus four capitals**, drawn as points. Smaller
   towns are not on the list.
7. **English only.** There is no French or Bengali version yet.

**Guides and printable checklists**

8. **The checklist PDFs cannot be searched or read aloud.** Like the posters, they are drawings:
   every letter is an outline, which is what makes them print the same everywhere. The guide
   page is the version to search, to copy from, or to use with a screen reader, and it has the
   same list.
9. **City populations are from the 2021 Census**, the latest full count. Cities have grown since;
   the guide says so, quotes Statistics Canada's 2025 estimate for the 41 together, and names
   the day the 2026 counts are due.
10. **"Largest city" means metropolitan area.** The guide ranks the 41 census metropolitan areas
    and explains why. It has no ranking by city limits and none by land area.
11. **Land areas are the World Bank's**, for 2022, and leave out lakes and rivers. The guide's
    percentages of "the world's land" are shares of the World Bank's world total. Only the 26
    countries used in the worked examples have a figure on file: the map does not show land area.
12. **The reading time on a guide is an estimate** set by hand, at the pace of the first four.
13. **The answers are only as current as their sources.** Each guide shows the day its sources
    were checked. Parks, World Heritage Sites, census counts and political arrangements change.

**Places inside a province (Canada only)**

14. **The percentages are shares of a list, not of the land.** A province's figure is its ticked
   places out of the places listed for it. Canada's figure is every ticked place out of all 178.
   The site, the dialog and the poster each say so.
15. **The list is a selection.** The 45 cities, 49 national parks and 16 World Heritage Sites
   follow official lists. The 68 "well-known places" are an editorial choice, labelled as such.
   Reaching 100% means every listed place, not every corner of a province.
16. **Lists differ in length**, from 6 places for Prince Edward Island to 31 for Ontario. One tick
    is 17% of the first and 3% of the second, and in the figure for Canada a province with a
    longer list weighs more. A different rule (the average of the 13 percentages, say) would give
    different numbers; the rule is one function in `src/lib/maps/places.ts`.
17. **Places are ticked in a list, not on the map.** There are no pins for parks or landmarks. The
    45 cities do appear as points, on the Canadian cities map.
18. **Share and challenge links carry provinces only.** The percentages travel on the poster and
    on "Share as a picture", not inside a link, and a comparison with a friend compares provinces.
19. **One province per place.** A place that lies in two is listed in one: Wood Buffalo under
    Alberta, Pimachiowin Aki under Manitoba, the Confederation Bridge under Prince Edward Island,
    Cypress Hills under Saskatchewan, Ottawa–Gatineau under Ontario. Each entry names the other
    province, except Ottawa–Gatineau, whose name already does.
20. **Places can only be ticked as visited.** There is no bucket list at this level, and the world
    map has no places inside its countries yet.
21. **The colour of a province is a guide, not a measurement.** The scale takes larger steps at the
    low end, so that the first few places show: a province at 25% is drawn halfway between the
    lightest tone and the full colour. Two provinces a few points apart (16% and 20%) look much
    alike. The exact figure is always written beside the name.
22. **Colouring starts with the first place ticked.** Until then every marked province has the one
    colour it always had. After that, a marked province with nothing ticked is the palest, which
    can look like a step back to someone who marks provinces only. On a poster the "Colour by
    percentage" switch turns it off; the map has no such switch.
23. **Pale accent colours leave less room for a scale.** With the gold accents on cream paper the
    lightest and the full tone are close, and the lightest sits only 1.5 to 1 from unmarked
    land. A darker accent shows the differences better, on screen and in print.

**Maps**

24. **Borders are generalised for display** from Natural Earth and are not for navigation or legal
    use. How disputed areas are drawn is stated on the Data and methods page.
25. **Very small countries are hard to tap on a phone** until the map is zoomed in. The checklist
    and search reach every place and are the dependable way.

**Posters**

26. **PDFs use RGB colour.** Print shops convert to their own inks, and colours can shift
    slightly. Ask for a proof if exact colour matters.
27. **The largest PNG is about 16 million pixels** (3456 × 4608, which is 288 dpi at 12 × 16 in),
    the most that older phones can draw. For 18 × 24 in and larger, use the PDF, which is vector
    and sharp at any size.
28. **Text in alphabets the bundled typefaces lack** (Bengali, Arabic, Chinese and others) is
    drawn with the device's own fonts and placed in the PDF as a picture. It prints well at normal
    sizes but is not vector.

**Not verified against the real thing**

29. **Analytics providers.** The site's events are tested, and Plausible and Google Analytics are
    wired in the standard way, but neither was tested with a real account.
30. **The contact form.** It needs a form service you choose. Without one, the page shows the
    email address only. Its spam checks (a hidden field, and a three-second minimum before
    sending) are simple; the form service's own filtering does the real work.
31. **Other browsers and devices**, as listed in the section above.

**Housekeeping**

32. **Three dependencies have a newer major version** than the one used: TypeScript 7 (the Astro
    checker does not support it yet), Preact 11 and opentype.js 2 (not yet tested with this
    code). All have no known vulnerabilities at their current versions.
33. **Browser tests started by a coding agent** need the `--ignore-lock` flag that is already in
    `playwright.config.ts`, because Astro otherwise moves its preview server to the background.

## Running it all again

```bash
npm install
npx playwright install chromium     # once
npm run test:all                    # types, unit tests, build, built-file checks, browser tests
```

For Lighthouse, serve `dist/` with any static server that compresses text, then run Lighthouse
against it from Chrome's DevTools or the command line. After launch, PageSpeed Insights
(https://pagespeed.web.dev/) measures the live site and adds real-visitor data once Google has
enough of it.
