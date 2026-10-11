# WorldTripMap

Interactive travel maps and print-ready travel posters, for **worldtripmap.com**.

Visitors mark the countries, provinces and cities they have explored, see their progress, and turn
it into a poster they can download as a PNG or a vector PDF, or share as a link. There are no
accounts and no server: everything a visitor creates stays in their own browser.

## What is in this release

| Map | What it counts | Status |
|---|---|---|
| World | 195 countries (193 UN members and 2 observer states). 42 territories can be marked and are counted on a separate line | Live |
| Canada | 10 provinces and 3 territories. Inside each, places to tick (178 in all: cities, national parks, World Heritage Sites, well-known attractions), which give a percentage for each province and for Canada | Live |
| Canadian cities | 45 major cities: the 41 census metropolitan areas and four more capitals | Live |
| United States, Bangladesh, world cities, city neighbourhoods | | Listed as "Coming soon", never linked |

Each live map has:

- **A map page** (`/maps/world/`, `/maps/canada/`, `/maps/canada-cities/`): click, tap or use the
  keyboard to mark places as *explored* or *want to go*; a searchable checklist; a count, an
  honest percentage and progress by region; achievements with stated rules; undo and start over;
  marks saved on the device.
- **On the Canada map, a second level.** Open a province and tick where you have been in it.
  Someone who has only been to Toronto sees "1 of 31 places · 3%" for Ontario, and every
  province's places add up to a percentage for Canada. The results panel lists each province's
  percentage with the one for Canada, the map shades each marked province by its percentage
  (darker for more), and the poster leads with "16% of Canada explored", writes each province's
  percentage beside its name and uses the same shading. To change the list of places, edit
  `src/data/definitions/canada-places.ts`. The percentages, the poster and the Data and methods
  page follow from it; `npm test` then names the few sentences and checks that still quote the
  old totals.
- **A poster studio** (`/maps/<map>/poster/`): four designs (Midnight Atlas, Nordic Explorer,
  Modern Cartographer, Travel Journal), your own title, name, dates and caption, a choice of
  colour and lettering, and seven shapes from a 4:5 social post to an 18 × 24 in print. The
  preview is the file. PNG and vector PDF downloads are made in the browser.
- **Share and challenge links** that carry the marks inside the link, with a comparison view
  ("both of you", "only you", "only them") for the person who opens one.

Around them: a home page, eleven guides with sources, a poster landing page, How it works, Data
and methods, About, Contact, Privacy and Terms.

**The guides** (`/guides/`) each answer one question in their first paragraph and list their
sources with the date they were checked:

| Shelf | Guides |
|---|---|
| The world, and how to count it | How many countries are there · Countries visited checklist (all 195, with a one-page PDF) · What percentage of the world have you visited · Is Greenland a country (and Puerto Rico, Hong Kong and 39 more) · What counts as visiting a country |
| Canada, province by province | The 10 provinces and 3 territories · National parks checklist (all 48, with a one-page PDF) · The 22 UNESCO World Heritage Sites · The largest cities (all 41 metropolitan areas) |
| Making your map and printing it | How to make a map of places you have visited · How to print a travel map poster |

The lists and tables inside them are not typed by hand. `npm run guides:sync` writes them from the
same definitions the maps use, `npm run checklists:build` makes the PDFs from them too, and
`npm test` fails if a guide or a PDF falls behind the data. To add a guide, add a Markdown file to
`src/content/guides/`: it appears on the guides page, on the page of the map it names, in the
sitemap and at the foot of every other guide by itself.

## Quick start

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev        # http://localhost:4321, reloads as you edit
npm run build      # the site, as static files, in dist/
npm run preview    # serves dist/ at http://localhost:4321
```

Nothing else is needed. The map data, fonts and images are already in the repository, and every
setting has a working default. To change one, copy `.env.example` to `.env`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run check` | Type checks: Astro files and TypeScript |
| `npm test` | Unit tests: counting, sharing, saving, search, the poster engine, data integrity, and that the guides and printable checklists match the data |
| `npm run test:site` | Checks on the built files in `dist/`: SEO tags, links, structured data, page weight |
| `npm run test:e2e` | Browser tests on desktop and phone sizes, including accessibility |
| `npm run test:all` | All of the above, in order, with a fresh build |
| `npm run geo:fetch` / `geo:build` | Download the pinned Natural Earth files, then rebuild the map shapes |
| `npm run assets:build` | Re-render sample posters, social images and icons |
| `npm run guides:sync` | Rewrite the lists and tables inside the guides from the map data. Add `-- --check` to report without writing |
| `npm run checklists:build` | Rebuild the printable checklists (PDF, Letter and A4) and the pictures of them in `public/downloads/` |
| `npm run fonts:build` | Rebuild the font files (needs Python with `fonttools` and `brotli`) |
| `npm run preview:build` | A relative copy of the site in `dist-preview/`, for hosted previews. Not for production |

Browser tests use Playwright's Chromium. Install it once with `npx playwright install chromium`.
If you already have a Chromium that Playwright should use, point to it:
`CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Settings

All optional. Set them in `.env` locally or in your host's dashboard. Only names that begin with
`PUBLIC_` reach the browser, and none of them is a secret.

| Variable | Default | Purpose |
|---|---|---|
| `SITE_URL` | `https://worldtripmap.com` | The site's address, without a trailing slash. Used for canonical addresses, the sitemap and social tags |
| `PUBLIC_CONTACT_EMAIL` | `hello@worldtripmap.com` | Shown on Contact, Privacy and Terms. **Create this mailbox, or change the address, before launch** |
| `PUBLIC_CONTACT_ENDPOINT` | empty | Where the contact form posts JSON (Formspree, Web3Forms or similar). Empty means no form, only the email address |
| `PUBLIC_ANALYTICS` | `none` | `none`, `plausible` or `ga4` |
| `PUBLIC_PLAUSIBLE_DOMAIN` | empty | The domain registered with Plausible |
| `PUBLIC_PLAUSIBLE_SRC` | Plausible's script | Change only if you self-host or proxy Plausible |
| `PUBLIC_GA4_ID` | empty | Google Analytics 4 measurement id. Loads only after a visitor accepts |
| `PUBLIC_GSC_VERIFICATION` | empty | Google Search Console HTML-tag code (the `content` value only) |
| `PUBLIC_CSP` | `on` | Content Security Policy. Set to `off` only if you add a service it would block |

## Documents

| Document | What is in it |
|---|---|
| [docs/deployment.md](docs/deployment.md) | Exact steps to put the site live, settings, Search Console, and the checklist for after launch |
| [docs/architecture.md](docs/architecture.md) | How the code is organised, how the maps and posters work, and how to add a new map |
| [docs/keyword-research.md](docs/keyword-research.md) | What people search for, who answers it today, the evidence with dates, and the keyword-to-page map |
| [docs/content-plan.md](docs/content-plan.md) | The plan for search and AI answers, a 30-day calendar, Pinterest and short-video ideas |
| [docs/quality-report.md](docs/quality-report.md) | Performance and accessibility audit, every test that was run, the manual checklist, and known limits |

## How it is built

Astro builds every page to static HTML. The maps and the poster studio are Preact components that
load only on their own pages. Map shapes are prepared ahead of time from Natural Earth data, so
no mapping library runs in the browser. Posters are drawn by the site's own engine, which makes
the preview, the PNG and the PDF from one description. There is no database, no authentication
and no paid service, because no feature needs one. Details are in
[docs/architecture.md](docs/architecture.md).

The brief suggested Next.js or another suitable framework. Astro was chosen because the site is
mostly content with three islands of interaction: reading pages ship no framework code, and the
output runs on any static host, including Vercel.

## Data and licences

| What | Source | Licence |
|---|---|---|
| Country, province and lake shapes; city locations | [Natural Earth](https://www.naturalearthdata.com/) 5.1.2 | Public domain |
| Which countries are counted | United Nations: member states and non-member observer states; UN M49 regions | Reference |
| Canada's regions, areas and populations | Government of Canada (*Discover Canada*), Natural Resources Canada, Statistics Canada 2021 Census | Reference |
| The 41 census metropolitan areas and their populations | Statistics Canada, *The Daily*, 9 February 2022 (2021 Census) | Reference |
| Land area of countries, quoted in one guide | World Bank indicator AG.LND.TOTL.K2, from the Food and Agriculture Organization | CC BY 4.0 |
| National parks and reserves listed as places | Parks Canada, as summarised in Wikipedia's "List of national parks of Canada" | Reference |
| World Heritage Sites listed as places | UNESCO World Heritage Centre, States Parties: Canada | Reference |
| Well-known places | Chosen by WorldTripMap. An editorial selection, labelled as such on the site | Own work |
| Typefaces: Manrope, DM Serif Display, Caveat | Google Fonts | SIL Open Font License 1.1 (texts in `src/assets/fonts/licenses`) |

Every source is linked from the site's Data and methods page, and each guide lists its own.

## Before launch

Three things need a person. They are also at the top of [docs/deployment.md](docs/deployment.md).

1. **Contact address.** Create `hello@worldtripmap.com` or set `PUBLIC_CONTACT_EMAIL`.
2. **Legal pages.** Privacy and Terms are written in plain language and describe what the site
   actually does, but they are not legal advice. Add the operator's legal name and the governing
   law, and have them reviewed.
3. **Hosting plan.** Vercel's free Hobby plan is for personal, non-commercial use. If the site
   will earn money, use Vercel Pro or a host whose free plan allows it. See the deployment guide.
