# Content and organic marketing plan

How WorldTripMap gets found without paid ads: in search, in AI answers, on Pinterest and in short
video. It covers what the site already does, the articles worth writing next, and a 30-day
calendar that one person can keep.

It makes no promise about rankings, traffic or placement in any AI product. Nobody can make that
promise honestly, and the guidance quoted below says why.

The evidence codes (A1, S3, P2, G1 and so on) refer to
[keyword-research.md](keyword-research.md), where the raw data is.

## 1. Search and AI answers

### What the companies themselves say

Read on 10 October 2026.

- **Google**, "AI features and your website" (last updated 10 December 2025): "There are no
  additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations
  necessary." It adds: "You don't need to create new machine readable files, AI text files, or
  markup to appear in these features", and "There's also no special schema.org structured data
  that you need to add." The one technical condition is that "a page must be indexed and eligible
  to be shown in Google Search with a snippet". Being eligible is not a guarantee of being shown.
- **Google**, documentation updates of 8 May and 15 June 2026: the FAQ rich result "will no longer
  appear in Google Search starting May 7, 2026".
- **OpenAI**, crawler documentation: three separate crawlers. "OAI-SearchBot is used to surface
  websites in search results in ChatGPT's search features." GPTBot gathers material that may be
  used for training. ChatGPT-User fetches a page when a person asks for it. "Each setting is
  independent of the others", and "Sites that are opted out of OAI-SearchBot will not be shown in
  ChatGPT search answers."

So the work for AI answers is the same work as for search: pages that are indexed, that answer a
question plainly, and that can be trusted. The plan below is that and nothing more.

### What the site already does

| Practice | Where |
|---|---|
| The answer comes first | Each guide opens with the answer in its first paragraph. Each map page says what it counts before anything else |
| Every figure has a source | Guides list their sources at the end; Data and methods links every dataset and counting rule |
| Figures agree with the data | The totals (195, 13, 45) are counted from each map's data, and tests fail if a map's own description or the catalogue of maps quotes a different number. The lists inside the guides (195 countries, 42 territories, 48 national parks, 22 World Heritage Sites, 41 cities) are written into the articles from the same data by `npm run guides:sync`, and a test fails when a guide falls behind |
| Dates are real | Guides show their publication date, and an update date once they have changed. Each source line says when it was checked. The sitemap's dates change only when a page changes |
| The words are in the page | Pages are built to static HTML, so the text is readable without running scripts. Only the map and the poster studio need scripts |
| Pages are easy to quote | One main heading, descriptive headings below it, tables for lists, short paragraphs |
| It is clear who is speaking | About, Contact and Data and methods are linked from every page |
| Structured data is limited to what is true | Organization, WebSite, BreadcrumbList and Article. No ratings, no reviews, no FAQ markup |
| Nothing is blocked | `robots.txt` allows every crawler and names the sitemap. No page in the sitemap carries `noindex` or `nosnippet` (the "page not found" page and the three short redirect addresses do carry `noindex`, as they should) |

### What was deliberately left out

- **No `llms.txt` and no "AI" schema.** Google says neither is needed, and no search or AI company
  has documented using them for ranking.
- **No FAQ structured data.** The feature it fed is gone. The questions and answers remain on the
  pages because readers use them.
- **No pages written to match keywords.** Each page exists because it does or explains something.

### One decision that is yours: AI training crawlers

`robots.txt` currently allows everything. That keeps the site eligible for ChatGPT search and for
Google's AI features. Whether your pages may also be used to **train** models is a separate
choice, and blocking training does not remove you from search:

```text
# Optional. Add in src/pages/robots.txt.ts if you do not want the site used for model training.
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /
```

Do not block `OAI-SearchBot` or `Googlebot` unless you want to disappear from those results.

### How every new page is written

There is no bulk generation in this plan. One article at a time, by a person, to this standard:

1. **One question per page.** Take it from the wording people type (Appendix A of the keyword
   research), and check the site does not already answer it.
2. **Answer in the first paragraph**, in plain words, with the number or the name in it.
3. **Then the follow-up questions as headings**, in the order people ask them.
4. **Every fact from a primary source**, linked, with the date you read it. Where sources
   disagree, say so and say which one the site follows.
5. **Something only this site has**: its own map, a poster made here, its counting rule, a table
   built from its data.
6. **A link to the tool the page serves**, and to the one or two guides nearest to it.
7. **Read it aloud before publishing.** Cut anything you would not say to a friend.
8. **Set `published` and `updated` honestly.** Change `updated` only when the content changes.

A page that cannot meet points 4 and 5 is not worth publishing.

### How to tell whether it is working

- **Search Console, Performance report.** Google counts visits from AI Overviews and AI Mode in
  this report, under the "Web" search type. Watch impressions per page and the queries behind them.
- **Referrers in your analytics**, if you turn analytics on: visits that arrive from AI assistants
  appear there when the assistant passes a referrer.
- **The site's own events** (`map_started`, `png_downloaded`, `share_initiated` and the rest):
  whether visitors who arrive actually make something.

Give it three months before judging a page. Be wary of any service that sells "AI ranking".

## 2. How pages link to each other

This is how the built site is linked today. New pages should follow the same pattern.

| From | Links to |
|---|---|
| Every page (header and footer) | Maps, the three live maps, the poster page, guides, How it works, Data and methods, About, Contact, Privacy, Terms |
| Home | The three maps, the poster page, How it works, six guides (two from each shelf of the guides page), the guides page, Data and methods |
| Guides page | All eleven guides, on three shelves: the world, Canada, making and printing |
| Each map page | Its poster studio, every guide written for it (a list under the questions), the other two maps, Data and methods |
| Each poster studio | Its map, the printing guide |
| Poster page | All three studios, the printing guide |
| Each guide | The tool it serves, at the start and the end; two or more other guides in its text; all ten others at the foot of the page, the same shelf first; About; Data and methods where a count is explained |

Rules for anything new:

1. A guide links to the tool it serves in its first screen and again at the end.
2. A tool page links to the guides written for it. This is automatic: a guide names its map in
   its front matter (`map:`), and the map page lists every guide that names it.
3. Every guide is linked from the text of at least two other guides. A test counts.
4. Link words say where the link goes ("Open the Canada map"), never "click here".
5. When a new map goes live, add it to the home page chooser, the maps page, the footer and at
   least one guide, in the same release.
6. Never link to a "Coming soon" map.

## 3. Articles: what is published, and what to write next

### Published

Eleven guides are live. Four went out with the site on 10 October 2026. Seven more followed on
11 October 2026, each researched and checked against its sources that day:

| Guide | Address | From the plan | Evidence |
|---|---|---|---|
| Countries Visited Checklist: All 195, by Continent | `/guides/countries-visited-checklist/` | 3.2, as planned, with a one-page PDF in Letter and A4 | A27, A18 |
| What Percentage of the World Have You Visited? | `/guides/what-percentage-of-the-world-have-you-visited/` | 3.3. Land areas are the World Bank's (from the FAO), which could be read country by country; five worked examples | A19; S15 |
| Is Greenland a Country? What Counts on a Travel Map | `/guides/what-counts-as-a-country/` | 3.6, rebuilt around the questions people type, which a second round of research found | A36, A37, A38 |
| Canada's National Parks: All 48, by Province (Checklist) | `/guides/canada-national-parks-checklist/` | 3.7, as planned, with a one-page PDF | A32, A34, A40 |
| UNESCO World Heritage Sites in Canada: All 22, by Province | `/guides/unesco-world-heritage-sites-in-canada/` | New. The Canada map already listed all 22; the searches are specific and factual | A33 |
| Largest Cities in Canada by Population: All 41 Metro Areas | `/guides/largest-cities-in-canada/` | New. The first guide for the cities map | A35, A14 |
| What Counts as Visiting a Country? Does an Airport Count? | `/guides/what-counts-as-visiting-a-country/` | New. Grew out of a section of the countries guide, which now links to it | A39 |

What each one has that a reader will not find put together elsewhere: a list or table built from
the site's own data and kept in step with it by a test, the official source for every figure
with the date it was read, and a map on which the list can be ticked.

**Keeping them true.** Three have a date built in. Re-read the sources when it passes, and change
`updated` only if the page changes:

- **10 February 2027:** Statistics Canada has scheduled the first results of the 2026 Census,
  the population and dwelling counts, for this day. Update the 41 figures in
  `src/data/definitions/canada-cities.ts`, the cities guide and the provinces guide.
- **Once a year, after UNESCO's World Heritage Committee has met:** it may add sites. Check
  Canada's page on the World Heritage Centre's site.
- **Whenever Parks Canada establishes a park:** add it to `canada-places.ts`, then run
  `npm run guides:sync` and `npm run checklists:build`. The tests say what else is out of date.

### To write next

Each is tied to evidence, has a different job from the pages that exist, and names what has to be
true before it is published. Titles are working titles. Outlines list questions to answer; the
facts must come from the sources named, read at the time of writing. The numbers are the ones
these articles have always had in this plan, so 3.2, 3.3, 3.6 and 3.7, now published, are missing
from the list.

### 3.1 A printable map of Canada's provinces and territories

- **Search it answers:** "map of canada provinces blank", "map of canada provinces and capitals",
  "map of canada provinces and territories and capitals" (A20). Intent: get a file.
- **Serves:** the Canada map and its poster studio.
- **Before publishing:** the poster engine needs a plain reference style with no counter or
  title, exported as PDF and PNG. That is a small addition to `src/lib/poster/templates.ts`. Do
  not publish the page until the files exist.
- **Outline**
  1. The files: blank, with names, with names and capitals. Letter and A4. What you may do with
     them (the shapes are public domain from Natural Earth)
  2. How the map is drawn: the projection and why Canada looks the way it does on it
  3. The 13 names and capitals as a table
  4. "Want to colour in the ones you have visited?" with a link to the Canada map
- **Links:** Canada map, Canada guide, printing guide.
- **Sources to read:** Natural Earth terms of use; Natural Resources Canada on the provinces and
  territories.

### 3.4 Scratch-off maps and their alternatives

- **Search it answers:** "scratch off map app", "scratch off map online" (A13). Gift searches lead
  to physical products (S6).
- **Serves:** the poster page.
- **Outline**
  1. What a scratch-off map is good at, said fairly
  2. Where it falls short: one fixed design, hard to correct, countries only
  3. Three alternatives: a pin map, an app, a printed digital map
  4. How to make the printed one here, in four steps, with a real example
- **Links:** poster page, printing guide, world map.
- **Rule:** no affiliate links unless you disclose them on the page; name products only to
  describe them.

### 3.5 A Canada bucket list, one idea for every province and territory

- **Search it answers:** "canada bucket list ideas", "canada bucket list places" (A17). Intent:
  inspiration.
- **Serves:** the "want to go" list on the Canada map.
- **Outline:** thirteen short sections, one per province and territory. Each has one place or
  experience, why it is worth the trip, the season, and the official tourism or Parks Canada page
  as its source. Ends with "Add them to your map as places you want to go".
- **Links:** Canada map, Canada guide, Canadian cities map.
- **Rule:** write from sources you can link, or from your own trips. No invented details.

### 3.8 The largest cities by land area, as a second table in the cities guide

- **Search it answers:** "largest cities in canada by area", "by land area" (A35).
- **Serves:** the cities guide. This is an addition to a page, not a new one.
- **Before publishing:** read a land-area figure for each of the 41 metropolitan areas from
  Statistics Canada and add it to `src/data/definitions/canada-cities.ts`, with a test.
- **Outline:** one table, the same 41, sorted by area; two sentences on why the order differs
  from the order by population.

### Considered and not planned

- **A separate page of Canada's capital cities** (A29). The provinces guide already has every
  capital. Add a small capitals map to that guide instead of a second page saying the same thing.
- **A page for each province.** Thin unless each has real, sourced content. Revisit after 3.5.
- **"Road map poster" and "travel map with pins" pages** (A6, A7). Different products.
- **Separate pages for Puerto Rico and Hong Kong** (A37, A38). Both are answered under their own
  headings in the Greenland guide. Split them only if Search Console shows that guide being found
  for those questions.
- **National park pass prices** (A34). They change every year and belong to Parks Canada.

## 4. Thirty days, day by day

Day 1 is the day the site goes live. The pace is one article a week, which is what one person can
research and check properly. If a day slips, move everything; do not skip the checking.

| Day | Task | Done when |
|---|---|---|
| **1** | Deploy. Run the ten-minute check in [deployment.md](deployment.md) on a phone and a computer | Every box is ticked |
| 2 | Search Console: verify, submit `sitemap.xml`, request indexing for the home page, the three maps and the guides you most want found first. The sitemap covers the rest | Sitemap status reads "Success" |
| 3 | Turn on analytics if you want it. Open a Pinterest business account; make three boards: *Travel map posters*, *Canada travel*, *Countries visited* | Boards exist, profile links to the site |
| 4 | Make pins 1 to 3 (section 5) in the poster studio's Pin shape and publish them | Three pins live, each linking to its page |
| 5 | Record video 1 (section 6) | Posted to one platform |
| 6 | Send the site to five people you know. Ask each to make a map and send you the challenge link | Five replies, with what confused them |
| 7 | Fix what those five stumbled on. Note anything about wording | Changes deployed |
| **8** | Article 3.1 (printable map of Canada): add the plain reference style to the poster engine and make the files | PDF and PNG open, in Letter and A4 |
| 9 | Article 3.1: write, check every name and capital against the data, read aloud | Draft done |
| 10 | Publish 3.1. It appears on the Canada map page and the guides page by itself; link it from the provinces guide | Live, in the sitemap |
| 11 | Pins 4 and 5. Record video 2 | Live |
| 12 | Post in one community (section 7), with the example most useful to that group | One post, honest about who made the tool |
| 13 | Search Console: check the Pages report. Fix anything not indexed for a stated reason | No unexplained exclusions |
| 14 | Rest, or catch up | |
| **15** | Article 3.4 (scratch-off alternatives): make the example poster and photograph a print if you have one | Example ready |
| 16 | Article 3.4: write and source | Draft done |
| 17 | Publish 3.4. Link it from the poster page | Live |
| 18 | Pins 6 and 7. Record video 3 | Live |
| 19 | Write to three Canadian travel writers or RV groups offering to make a poster of their own travels, free, no conditions | Three messages sent |
| 20 | Search Console: first look at queries. Compare with the keyword map | Notes taken |
| 21 | Rest, or catch up | |
| **22** | Article 3.5 (Canada bucket list): choose one place for each province and territory and read its official page | Thirteen sources open |
| 23 | Article 3.5: write | Draft done |
| 24 | Publish 3.5. Link it from the provinces guide | Live |
| 25 | Pins 8 to 10. Record video 4 | Live |
| 26 | Second community post, a different group | One post |
| 27 | Improve one existing page using what people typed: adjust a title or add a missing answer | Change deployed, `updated` date changed |
| 28 | Review: which pages got impressions, which pins got saves, which events fired | A half-page of notes |
| 29 | Decide the next month: the United States map, addition 3.8, or whatever the queries in Search Console ask for | A dated list |
| 30 | Check every source link in the guides still works | All open |

What this calendar does not include: buying links, posting the same comment in many places, or
publishing articles nobody checked. Those cost more than they return.

## 5. Pinterest pins

Make each one in the poster studio using the **Pin** shape (2:3, saved at 1000 × 1500). Use real
maps. A pin that shows example data says so in its description.

| # | Picture | Words on the pin | Description | Links to |
|---|---|---|---|---|
| 1 | Canada in Midnight Atlas, seven provinces marked | "How much of Canada have you explored?" | A free map of all 13 provinces and territories that you fill in yourself. Example map shown | `/maps/canada/` |
| 2 | World in Nordic Explorer | "Every country you've visited, on one poster" | Mark countries on the map, then download a poster to print. Free, no account. Example map shown | `/maps/world/` |
| 3 | The four designs side by side | "Four travel map posters you can make yourself" | Midnight Atlas, Nordic Explorer, Modern Cartographer and Travel Journal. Choose one, add your title, download | `/travel-map-poster/` |
| 4 | The printable checklist (the PDF's page, saved as a picture) | "195 countries: the printable checklist" | A one-page list by continent, matching the map. Free PDF in Letter and A4 | `/guides/countries-visited-checklist/` |
| 5 | Canada in Travel Journal with a handwritten-style title | "Coast to coast to coast" | A poster of the provinces and territories you have been to. Example map shown | `/maps/canada/poster/` |
| 6 | Two small maps of the same trips, labelled "by countries" and "by land area" | "What percentage of the world have you seen?" | It depends how you count. Both ways explained | `/guides/what-percentage-of-the-world-have-you-visited/` |
| 7 | Table of Canada's 13 capitals beside the map | "Canada's 10 provinces and 3 territories" | Names, capitals and the difference between a province and a territory | the Canada guide |
| 8 | A framed print on a wall (your own photo) | "From screen to wall: printing a travel map" | Sizes, resolution and paper, in one guide | the printing guide |
| 9 | Canadian cities map, capitals highlighted | "45 Canadian cities. How many have you seen?" | Every capital and every large city, on one map. Example map shown | `/maps/canada-cities/` |
| 10 | A scratch-off map beside a printed digital map (your own photo) | "A scratch map you can correct" | Paper scratch maps and three alternatives | the scratch-off article |
| 11 | A Canada poster with a percentage beside each province | "How much of each province have you seen?" | Tick the cities, parks and landmarks you have been to in each province and get a percentage for each. Example map shown | `/maps/canada/` |
| 12 | The national parks checklist (the PDF's page, saved as a picture) | "Canada's 48 national parks: the checklist" | Every national park and reserve by province, on one page to print | `/guides/canada-national-parks-checklist/` |
| 13 | The Canada map with Alberta, Newfoundland and Labrador and Nova Scotia marked | "Canada has 22 World Heritage Sites. Alberta has six" | All 22, the year each was listed, and the province it is in | `/guides/unesco-world-heritage-sites-in-canada/` |
| 14 | The world map with Greenland marked in the territory colour | "Is Greenland a country?" | What Greenland, Puerto Rico and Hong Kong are, and how to count them on a travel map | `/guides/what-counts-as-a-country/` |

Pin 10 waits for its article. Do not pin to a page that does not exist yet. Pin 11 can go out in
the first week in place of pin 3, and pins 4 and 12 are the easiest to make: the picture is the
checklist itself.

## 6. Short videos

Vertical, 15 to 30 seconds, recorded from a phone screen or over the shoulder. No stock footage.
The **Story** shape (9:16, 1080 × 1920) makes a clean end card.

| # | Opening line | What happens | Ends with | Links to |
|---|---|---|---|---|
| 1 | "How many provinces have you actually been to?" | Tap provinces on the Canada map; the counter climbs; stop on the number | The count and "Try yours" | `/maps/canada/` |
| 2 | "I made this in under a minute" | From marked map to poster studio; switch through the four designs; download | The finished poster | `/maps/canada/poster/` |
| 3 | "My friend said she'd been to more countries than me" | Make a challenge link; open it; the comparison view shows both | "Send it to someone who thinks they've travelled more" | `/maps/world/` |
| 4 | "Is it 193 countries or 195?" | Fifteen seconds to camera with the answer, map behind | "195 on this map, and here's why" | the countries guide |
| 5 | "Printing a poster? Check this first" | The size table from the printing guide; zoom into a sharp print and a blurry one | "The PDF stays sharp at any size" | the printing guide |
| 6 | "Everyone forgets the third territory" | Tap Yukon, Northwest Territories, Nunavut; the North of Sixty achievement appears | The achievement | `/maps/canada/` |
| 7 | "This is every capital city in Canada" | Tick the 14 capitals on the cities map; Capital Collector appears | The achievement | `/maps/canada-cities/` |
| 8 | "I printed it" | Unrolling or framing a real print | The print on the wall | `/travel-map-poster/` |
| 9 | "I've been to Ontario. Well, I've been to Toronto" | Mark Ontario; open its places; tick Toronto: 3%. Add Niagara Falls and the CN Tower and watch it climb | "How much of your province have you really seen?" | `/maps/canada/` |
| 10 | "Does a layover count as visiting a country?" | Fifteen seconds to camera: one club says yes if you got off the plane, another says never | "Pick a rule and keep to it" | `/guides/what-counts-as-visiting-a-country/` |

Videos 1 to 4 are in the calendar. Keep 5 to 8 for the second month. Video 9 is the strongest
single idea here, because everyone has a province they have "been to" on the strength of one
city: use it in place of video 2 if you only make four.

## 7. Where to talk about it

Go where the people already are, say who you are, and offer something useful to that group.

- **RV and road-trip communities.** The sampled results for "visited states map" included an RV
  magazine article and a forum thread titled "Visited States or Provinces Map" (S10). People who
  travel by road keep these maps. Show the Canada map and say the United States is planned.
- **Canadian travel groups and subreddits.** Share your own filled-in map and ask for theirs.
  Read each group's rules about self-promotion first, and follow them.
- **Teachers and home educators.** Once article 3.1 exists, the printable maps are useful in a
  classroom. Offer the files, not the tool.
- **Travel writers.** Offer to make a poster of their travels. Ask for nothing in return.
- **Your own circle.** The challenge link exists for this. Five people who each send it to one
  friend is how this kind of tool spreads.

Never post the same message to many places, never reply to old threads just to add a link, and
never ask for or write reviews you did not earn.

## 8. What to record each month

| Question | Where to look |
|---|---|
| Are the pages indexed? | Search Console, Pages |
| Which searches show the site, and for which page? | Search Console, Performance, by page then by query |
| Do visitors start a map? | `map_started` against page views of the map pages |
| Do they make something? | `png_downloaded`, `pdf_downloaded` |
| Do they pass it on? | `share_initiated`, `challenge_link_opened`, `challenge_completed` |
| Which pins and videos send people? | Referrers in analytics; Pinterest's own analytics |

Write the numbers down with the date. After three months you will have your own data, which is
worth more than any estimate that could have been put in this document.

## Sources

- Google Search Central, "AI features and your website" (last updated 10 December 2025):
  https://developers.google.com/search/docs/appearance/ai-features
- Google Search Central documentation updates, 8 May 2026 and 15 June 2026, on the FAQ rich result:
  https://developers.google.com/search/docs/appearance/structured-data/faqpage
- OpenAI, crawler documentation: https://developers.openai.com/docs/bots
- The evidence behind every code in this document: [keyword-research.md](keyword-research.md)
