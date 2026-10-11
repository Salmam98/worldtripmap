import type { MapId } from '../lib/maps/types';

/**
 * Words for the map pages and poster pages: titles, descriptions, headings and the questions each
 * page answers. Kept in one place so every page has a unique title and description, and so the
 * copy can be edited without touching layout code.
 */
export interface MapPageCopy {
  title: string;
  description: string;
  h1: string;
  lede: string;
  image: string;
  /** Short name used in breadcrumbs and links. */
  crumb: string;
  about: { heading: string; body: string[] };
  faq: { q: string; a: string }[];
  poster: {
    title: string;
    description: string;
    h1: string;
    lede: string;
  };
}

export const MAP_PAGES: Record<MapId, MapPageCopy> = {
  world: {
    title: 'Visited Countries Map: Mark All 195 | WorldTripMap',
    description:
      'Mark the countries you have been to on an accurate world map. See your count out of 195, the continents you have reached, and turn it into a poster. Free, no account.',
    h1: 'Visited countries map',
    lede: 'Mark every country you have explored and see your count out of 195. Small countries are easier to tick in the list under the map than to hit on it.',
    image: '/og/world.png',
    crumb: 'World',
    about: {
      heading: 'How this map counts countries',
      body: [
        'The number at the top is out of <strong>195</strong>: the 193 member states of the United Nations, plus the Holy See and the State of Palestine, which hold permanent observer status at the UN.',
        'You can also mark <strong>42 territories and other areas</strong> that have their own international code but are not UN members or observers, such as Greenland, Hong Kong, Puerto Rico, Taiwan and Kosovo. They appear as “plus 3 territories” beside your total and are never mixed into the 195.',
        'Your percentage is your count divided by 195. It is a share of countries, not of the world’s land or population: marking Russia and marking Malta each add exactly one.',
        'The map uses the Equal Earth projection, which keeps the relative sizes of countries true, so Africa is not shrunk and Greenland is not inflated the way they are on most web maps.',
      ],
    },
    faq: [
      {
        q: 'How many countries have I been to?',
        a: '<p>Tick the countries in the list under the map, continent by continent, and the total appears at the top with your percentage of 195. Going through the list is more reliable than clicking around the map, because it prompts you for places you might forget.</p>',
      },
      {
        q: 'Why 195 and not 193 or 197?',
        a: '<p>193 is the number of UN member states. Adding the two UN observer states, the Holy See and Palestine, gives 195, the figure most atlases use. Other lists add places with partial recognition or self-government. We keep those available to mark, on a separate line. <a href="/guides/how-many-countries-are-there/">Why travel maps disagree</a>.</p>',
      },
      {
        q: 'How do I mark very small countries?',
        a: '<p>Use the search box above the list: typing “mona” finds Monaco. On the map itself, small countries have a round marker you can tap, and you can zoom in up to fourteen times with the plus button, a pinch, or Ctrl and the scroll wheel.</p>',
      },
      {
        q: 'Does visiting Hawaii or French Guiana count separately?',
        a: '<p>No. Hawaii is part of the United States and French Guiana is part of France, so each belongs to its country’s single entry. Searching for “Hawaii” or “French Guiana” in the list takes you to the right country.</p>',
      },
      {
        q: 'How are disputed borders drawn?',
        a: '<p>Boundaries come from Natural Earth, a public-domain dataset, and countries are counted on the United Nations’ basis. Where the two differ we follow the UN position; for example, Crimea is drawn as part of Ukraine. Drawing a line on this map is not a statement about any territorial claim. Details are on the <a href="/methodology/">data and methods page</a>.</p>',
      },
    ],
    poster: {
      title: 'Countries Visited Poster Maker | WorldTripMap',
      description:
        'Turn the countries you have visited into a world map poster. Choose from four designs, add your title, and download a PNG or a print-ready vector PDF. Free.',
      h1: 'World poster studio',
      lede: 'Design a poster of the countries you have explored. The preview is the file: what you see is exactly what downloads.',
    },
  },
  canada: {
    title: 'Visited Provinces Map of Canada: All 13 | WorldTripMap',
    description:
      'Mark the provinces and territories of Canada you have explored, tick the places you saw in each, and see how much of Canada that is. Free, no account.',
    h1: 'Visited provinces map of Canada',
    lede: 'Mark the provinces and territories you have explored, then tick the cities, parks and landmarks you saw in each one to see how much of it you have covered.',
    image: '/og/canada.png',
    crumb: 'Canada',
    about: {
      heading: 'How this map counts',
      body: [
        'Canada has <strong>10 provinces and 3 territories</strong>, and each is one place on this map. Your count and percentage are out of those 13.',
        'That percentage is a share of provinces and territories. It is not a share of Canada’s land: Nunavut alone is a fifth of the country by area, and it counts for one thirteenth here.',
        'To show how much of each one you have seen, open it in the list and tick the places you have been to. There are <strong>178 places</strong> across the country: the 45 largest cities, every national park, the World Heritage Sites and a short list of well-known attractions. Each province and territory then shows its own percentage, and together they give one for Canada.',
        'Those percentages are shares of the places on our list. Someone who has only been to Toronto has ticked 1 of Ontario’s 31 places, which is 3%. The list is a selection, so 100% means every place on it, not every corner of the province.',
        'The map shows the same thing in colour. Once you have ticked a place, each province and territory you have marked is shaded by its percentage: the darker the green, the more of its places you have ticked. One with nothing ticked yet is the palest.',
        'Once you have marked something, the panel also shows how much of Canada’s total area lies inside the provinces and territories you have marked, clearly labelled as a separate figure.',
        'The map is drawn in the Lambert conformal conic projection that Statistics Canada and Natural Resources Canada use for national maps, which is why it looks like the Canada you know from an atlas rather than the stretched version on most web maps.',
      ],
    },
    faq: [
      {
        q: 'How many provinces and territories does Canada have?',
        a: '<p>Thirteen: 10 provinces and 3 territories. The territories are Yukon, the Northwest Territories and Nunavut. <a href="/guides/canada-provinces-and-territories/">The full list, with capitals and sizes</a>.</p>',
      },
      {
        q: 'Prince Edward Island is tiny. How do I select it?',
        a: '<p>Tick it in the list beside the map, which works at any size. On a phone, Prince Edward Island also gets a round marker on the map that is easy to tap, and you can zoom in with the plus button or a pinch.</p>',
      },
      {
        q: 'What do I get for marking all 13?',
        a: '<p>The Complete Explorer achievement, which you can add to your poster as a seal. There are others along the way, including Coast to Coast to Coast for reaching the Pacific, the Atlantic and the Arctic. Each one lists its exact rule.</p>',
      },
      {
        q: 'Does a stopover or a drive through count?',
        a: '<p>That is your call. There is no official rule for what counts as visiting a place. Pick one, such as “I got out of the car and did something”, and apply it to every province and territory.</p>',
      },
      {
        q: 'I have only been to one city in a province. How do I show that?',
        a: '<p>Mark the province, then open it in the list (the line under its name that reads “0 of 31 places”) and tick only the places you have been to. The province then shows its own percentage: one city out of Ontario’s 31 listed places is 3%. Marking a province never ticks its places for you.</p>',
      },
      {
        q: 'What does the percentage for a province, and for Canada, mean?',
        a: '<p>A province’s percentage is the share of the places we list for it that you have ticked. The figure for Canada is every ticked place out of all 178, so each place counts the same wherever it is. Neither is a share of land area, and the list is a selection, not everything there is to see. On your poster the figure for Canada is the large number and each province’s percentage is written beside its name. <a href="/methodology/#places">How the list is made</a>.</p>',
      },
      {
        q: 'Why are some provinces a darker green than others?',
        a: '<p>The colour follows the percentage. Once you have ticked a place, every province and territory you have marked is shaded by how many of its listed places you have ticked: pale for a few, the full green for all of them. A marked province with nothing ticked yet is the palest, and the key under the map shows the scale. Before you tick any place, all marked provinces are the same green. Your poster uses the same scale, and one switch in the poster studio turns it off.</p>',
      },
      {
        q: 'Can I track cities as well?',
        a: '<p>Yes. Each province’s list includes its major cities, and the same 45 cities are on the <a href="/maps/canada-cities/">Canadian cities map</a>: a city ticked in one place is ticked in the other. Marking a province does not mark its cities. If your cities imply a province you have not marked, the page will offer to add it, and nothing changes unless you agree.</p>',
      },
    ],
    poster: {
      title: 'Canada Travel Map Poster Maker | WorldTripMap',
      description:
        'Make a poster of the Canadian provinces and territories you have explored. Four designs, your own title and colours, PNG or print-ready vector PDF. Free.',
      h1: 'Canada poster studio',
      lede: 'Design a poster of the provinces and territories you have explored. If you ticked places inside them, it leads with how much of Canada that comes to. The preview is the file: what you see is exactly what downloads.',
    },
  },
  'canada-cities': {
    title: 'Canadian Cities Visited Map: 45 Major Cities | WorldTripMap',
    description:
      'Mark the Canadian cities you have explored, from Victoria to St. John’s. 45 major cities including every capital, with your progress and a poster to print or share.',
    h1: 'Canadian cities you have explored',
    lede: 'Mark the cities you have been to and see your progress out of 45. Cities sit close together in the south, so zoom in or use the list.',
    image: '/og/canada-cities.png',
    crumb: 'Canadian cities',
    about: {
      heading: 'Which cities are on this map',
      body: [
        'The map has <strong>45 cities</strong>, chosen by a fixed rule rather than by taste: all 41 census metropolitan areas from Statistics Canada’s 2021 Census, plus the four capitals that are not metropolitan areas (Charlottetown, Whitehorse, Yellowknife and Iqaluit). That covers Ottawa and every provincial and territorial capital.',
        'A census metropolitan area is a city together with the communities around it, so “Toronto” here includes places such as Mississauga and Brampton, and a few entries carry the paired names Statistics Canada uses, like Kitchener–Cambridge–Waterloo.',
        'Your percentage is a share of these 45 cities. Canada has thousands of other cities, towns and villages that are not on the list, so this is not a measure of how much of the country you have seen.',
        'City progress is separate from the provinces you have marked: nothing here marks a province unless you choose to add a suggested one. The cities you mark do count toward each province’s percentage of places on the <a href="/maps/canada/">Canada map</a>, where the same 45 cities are listed.',
      ],
    },
    faq: [
      {
        q: 'Why is my town not on the map?',
        a: '<p>To keep the list fair, the map uses Statistics Canada’s census metropolitan areas, which have at least 100,000 residents, plus the capitals. If your town is part of a larger metropolitan area it is included under that name: search for it in the list and you may find it.</p>',
      },
      {
        q: 'The cities in southern Ontario overlap. How do I pick one?',
        a: '<p>Zoom in with the plus button or a pinch and the dots separate, or use the list, which is grouped by region and searchable. Typing “Niagara” finds St. Catharines–Niagara.</p>',
      },
      {
        q: 'Are neighbourhoods or districts inside a city available?',
        a: '<p>Not yet. Neighbourhood maps need reliable, openly licensed boundary data for each city, and we will only publish one when that data checks out. It is listed as coming soon on the <a href="/maps/">maps page</a>.</p>',
      },
    ],
    poster: {
      title: 'Canadian Cities Poster Maker | WorldTripMap',
      description:
        'Make a poster of the Canadian cities you have explored, with each city named on the map. Four designs, PNG or print-ready vector PDF. Free.',
      h1: 'Canadian cities poster studio',
      lede: 'Design a poster of the cities you have explored. The preview is the file: what you see is exactly what downloads.',
    },
  },
};
