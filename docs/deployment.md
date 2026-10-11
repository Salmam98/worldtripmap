# Putting WorldTripMap live

The site is a folder of static files. Any static host can serve it; this guide gives exact steps
for three common ones, then covers the domain, Search Console, analytics and what to check after
launch. Facts about hosts and Google were checked against their own documentation on 10 October
2026; the links are at the end.

## Three things only you can do

1. **Contact address.** The Contact, Privacy and Terms pages show `hello@worldtripmap.com`.
   Create that mailbox, or set `PUBLIC_CONTACT_EMAIL` to an address you read.
2. **Legal pages.** Privacy and Terms describe what the site really does (no accounts, nothing
   uploaded, analytics off unless you turn it on). They are not legal advice. Add the operator's
   legal name and the governing law in `src/pages/privacy.astro` and `src/pages/terms.astro`, and
   have them reviewed before you run ads or sell anything.
3. **Choose a host and plan.** See the note on Vercel's free plan below.

## Before you deploy

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm run test:all                  # type checks, unit tests, a fresh build, site checks, browser tests
```

`npm run build` alone is enough to produce the site in `dist/`. The tests are there so you know
that what you are about to publish works.

## Settings

Set these in your host's dashboard (or in a local `.env` file). All are optional, and all are
read when the site is **built**, so change one and then redeploy.

| Variable | Use |
|---|---|
| `SITE_URL` | Only if the site will not live at `https://worldtripmap.com`. No trailing slash |
| `PUBLIC_CONTACT_EMAIL` | The address shown on Contact, Privacy and Terms |
| `PUBLIC_CONTACT_ENDPOINT` | Turns on the contact form. Any service that accepts a JSON POST, such as Formspree or Web3Forms. Leave empty to show the email address only |
| `PUBLIC_ANALYTICS` | `none` (default), `plausible` or `ga4` |
| `PUBLIC_PLAUSIBLE_DOMAIN` | With `plausible`: the domain you registered there |
| `PUBLIC_GA4_ID` | With `ga4`: the measurement id of a property created for this site |
| `PUBLIC_GSC_VERIFICATION` | Search Console HTML-tag code, if you verify that way (see below) |
| `PUBLIC_CSP` | Leave `on`. Set `off` only if you add a service the policy blocks, such as an ad network |

None of these is a secret. There are no API keys in this project.

## Option A: Cloudflare Pages

**From a Git repository** (rebuilds on every push):

1. Put the project in a GitHub repository.
2. In the Cloudflare dashboard open **Workers & Pages**, then **Create application**, the
   **Pages** tab, **Import an existing Git repository**. Choose the repository and
   **Begin setup**.
3. Under **Set up builds and deployments** enter:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build directory: `dist`
4. Add any settings from the table above as environment variables. The repository's `.nvmrc`
   asks for Node 22; if the build reports an older Node, add `NODE_VERSION` = `22`.
5. **Save and Deploy**.

**Without Git** (upload the built folder):

```bash
npm run build
npx wrangler pages deploy dist
```

or in the dashboard: **Workers & Pages**, **Create application**, **Get started**,
**Drag and drop your files**, then drop the `dist` folder (or the ready-built zip). Cloudflare's
documentation notes that a project created this way cannot be switched to Git later; you would
make a new project for that.

`public/_headers` and `public/_redirects` are picked up automatically: security headers, a
one-year cache for fingerprinted files, and the three short addresses (`/canada`, `/world`,
`/poster`).

## Option B: Netlify

1. Put the project in a Git repository and create a new Netlify site from it. (For a one-off
   upload without Git, Netlify also accepts the built `dist` folder dropped into its dashboard.)
2. Build command: `npm run build`. Publish directory: `dist`.
3. Add settings as environment variables in the site's configuration. `.nvmrc` sets Node 22.

Netlify reads the same `_headers` and `_redirects` files.

## Option C: Vercel

1. Put the project in a Git repository and import it at vercel.com/new. Vercel detects Astro and
   needs no changes. Or, from the project folder: `npm install -g vercel`, then `vercel`, and
   answer `N` when asked whether to override the settings.
2. Add settings as environment variables in the project's settings, then redeploy.

`vercel.json` in the repository already sets trailing slashes, the security headers, the cache
rule and the three redirects.

> **Vercel's free plan.** Vercel's documentation says the Hobby plan "restricts users to
> non-commercial, personal use only." If WorldTripMap will earn money (ads, affiliate links,
> selling prints), use Vercel Pro or one of the other hosts, and check that host's terms too.

## The domain

1. Add `worldtripmap.com` as a custom domain in the host's dashboard and follow its DNS
   instructions. All three hosts issue the HTTPS certificate themselves.
2. Add `www.worldtripmap.com` as well and set it to **redirect to** `worldtripmap.com`. The site's
   canonical addresses, sitemap and share links all use the address without `www`.
3. Check: `http://`, `https://www.` and `https://` should all end at `https://worldtripmap.com/`.

## After the first deploy: ten-minute check

Open the live site on a phone and on a computer.

- [ ] Home page loads, the headline reads "Your Travels. Your World. Your Map."
- [ ] `/maps/canada/`: tap three provinces, the count reads "3 of 13", reload, the three are still marked
- [ ] In the list beside the map, open Ontario's places and tick Toronto: the line reads "1 of 31 places · 3%"
- [ ] `/maps/world/`: search for "mona", tick Monaco, the count rises by one
- [ ] "Design my poster" opens the studio with the same places
- [ ] **Download PNG** saves a file that opens; **Download PDF** saves a file that opens
- [ ] "Share" copies a link; opened in a private window it shows the same map
- [ ] `/canada` redirects to `/maps/canada/`
- [ ] `/robots.txt` shows a `Sitemap:` line with your domain; `/sitemap.xml` lists 27 addresses
- [ ] A made-up address such as `/nope/` shows the site's "page not found" page
- [ ] The Contact page shows the right email address
- [ ] On `/guides/countries-visited-checklist/`, the "Letter size (PDF)" link opens a one-page
      checklist, and printing the page itself (Ctrl or Cmd + P) shows the list without the menus

## Google Search Console

**Verify ownership.** Either way works; the first covers every version of the address.

- **Domain property (recommended).** Add `worldtripmap.com` as a *Domain* property. Search
  Console gives you a TXT record; add it at your DNS provider with the host left blank or `@`.
  Google's help page says a manually added record can take "up to two or three days" to be served,
  and that DNS is the only way to verify a Domain property. Keep the record in place: "To stay
  verified, don't remove the DNS record from your provider, even after verification succeeds."
- **URL-prefix property with an HTML tag.** Add `https://worldtripmap.com/` as a *URL prefix*
  property and choose **HTML tag**. Search Console shows
  `<meta name="google-site-verification" content="…">`. Copy only the `content` value into
  `PUBLIC_GSC_VERIFICATION`, redeploy, check the tag is in the home page's source, and press
  **Verify**. The tag has to stay on the home page for the periodic re-checks.

**Submit the sitemap.** In **Sitemaps**, enter `sitemap.xml` and submit. The site's `robots.txt`
already points to it. A few things worth knowing, from Google's sitemap documentation:

- A sitemap is a hint, not a guarantee that pages will be crawled or indexed.
- Google ignores `<priority>` and `<changefreq>`; this sitemap does not include them.
- Google uses `<lastmod>` only if it is "consistently and verifiably" accurate. The site writes
  each guide's own `updated` date, and `SITE_UPDATED` in `src/lib/routes.ts` for the other pages.
  **Change those dates only when a page really changes.**

**Then, over the first weeks:**

- [ ] **Pages** report: the 27 addresses in the sitemap move to "Indexed". Use **URL inspection**
      and **Request indexing** for the home page, the three map pages and the guides you most
      want found first. Search Console limits how many requests you can make in a day, and the
      sitemap covers the rest
- [ ] **Core Web Vitals** and **HTTPS** reports show no problems once there is enough traffic
      for them to have data
- [ ] **Performance** report: note which queries bring impressions, and compare with
      [keyword-research.md](keyword-research.md). Google reports visits from AI Overviews and AI
      Mode inside this same report, under the "Web" search type
- [ ] Bing Webmaster Tools (optional): add the site and submit the same sitemap address

## Analytics (optional)

Analytics is **off** unless you turn it on. With it off, the site sets no cookies and contacts no
other company, and the Privacy page says so.

- **Plausible** (no cookies, no banner): set `PUBLIC_ANALYTICS=plausible` and
  `PUBLIC_PLAUSIBLE_DOMAIN=worldtripmap.com`. In Plausible, add the event names below as custom
  event goals so they appear in the dashboard.
- **Google Analytics 4**: create a new GA4 property for this site, then set
  `PUBLIC_ANALYTICS=ga4` and `PUBLIC_GA4_ID=G-…`. A consent banner appears, and the Google script
  loads only after a visitor chooses "Allow analytics". Do not reuse an id from another site.

Whichever you choose, the Privacy page updates itself to describe it, and the Content Security
Policy admits that one service and nothing else.

| Event | Sent when | Extra detail sent |
|---|---|---|
| `homepage_viewed` | The home page opens | none |
| `map_started` | The first place is marked on a map in this visit | map |
| `region_selected` | A place is marked as explored | map, running count |
| `map_completed` | Every countable place on a map is marked | map |
| `poster_customized` | The first change is made in a poster studio | map |
| `png_downloaded` | A PNG is saved | map, design, shape, size |
| `pdf_downloaded` | A PDF is saved | map, design, shape |
| `share_initiated` | A link is copied, the share sheet opens, or a share image is made | map, kind, method |
| `challenge_link_opened` | Someone opens a challenge link | map |
| `challenge_completed` | That person marks their own places and opens the comparison | map |

No event carries a name, the places that were marked, or the part of an address after `#`.

## Updating the site

1. Make the change and run `npm run test:all`.
2. If a page's content changed, update its date: `updated` in a guide's front matter, or
   `SITE_UPDATED` in `src/lib/routes.ts`.
3. Push (Git-connected hosts rebuild on their own), or build and upload `dist/` again.

To add a guide, add a Markdown file to `src/content/guides/` with the same front matter as the
existing ones, including its sources. It appears on the guides page, on its map's page and in the
sitemap by itself. To add a map, follow [architecture.md](architecture.md#adding-a-new-map).

When the data behind a map changes (a country renamed, a national park established, new census
counts), run these two before the tests. They rewrite what is derived from the data:

```bash
npm run guides:sync        # the lists and tables inside the guides
npm run checklists:build   # the printable PDFs and the pictures of them
npm run test:all
```

The tests then name any sentence that still quotes an old total.

## After launch: SEO checklist

**First week**

- [ ] Search Console verified, sitemap submitted, key pages requested for indexing
- [ ] Share one sample poster each on Pinterest and Instagram with a link to the matching map page
- [ ] Search `site:worldtripmap.com` after a few days and confirm the titles read well

**First month**

- [ ] Publish from the calendar in [content-plan.md](content-plan.md), at the pace you can keep
- [ ] In the Performance report, find queries where a page shows up but is rarely clicked, and
      improve that page's title and description to match what people typed
- [ ] Ask two or three people to use the site on their own phones and watch where they hesitate
- [ ] If a sharing preview looks wrong, re-test the address in the platform's own preview tool

**Ongoing**

- [ ] When a new map goes live, link to it from the home page chooser, the maps page and one guide
- [ ] Re-check every external source link in the guides twice a year
- [ ] On 10 February 2027 Statistics Canada is due to publish the first 2026 Census counts.
      Update the city populations then (see "Keeping them true" in the content plan)
- [ ] Keep dependencies current: `npm outdated`, update, then `npm run test:all`
- [ ] Never promise rankings or placement in AI answers. Google's guidance is that there are "no
      additional requirements" for its AI features beyond being indexed and eligible for a snippet

## Sources

- Cloudflare Pages, Astro guide: https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/
- Cloudflare Pages, Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Astro, deploy to Netlify: https://docs.astro.build/en/guides/deploy/netlify/
- Astro, deploy to Vercel: https://docs.astro.build/en/guides/deploy/vercel/
- Vercel, Hobby plan: https://vercel.com/docs/plans/hobby
- Google, verify your site ownership: https://support.google.com/webmasters/answer/9008080?hl=en
- Google, build and submit a sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google, AI features and your website: https://developers.google.com/search/docs/appearance/ai-features
