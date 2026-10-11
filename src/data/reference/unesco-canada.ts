/**
 * Canada's UNESCO World Heritage Sites: the 22 properties on the World Heritage List.
 *
 * Source: UNESCO World Heritage Centre, "States Parties: Canada" (10 cultural, 11 natural and
 * 1 mixed property, with the years of inscription), and the page of each property for what it is
 * and where. Pimachiowin Aki's location is from its own site, pimaki.ca. Read 11 October 2026.
 *
 * `places` ties each property to the Canada map: sixteen have an entry of their own there, and
 * six are made up of national parks that are already listed (see canada-places.ts). A test keeps
 * the two in step.
 */
export type HeritageKind = 'cultural' | 'natural' | 'mixed';

export interface HeritageProperty {
  /** The name on the World Heritage List. */
  name: string;
  kind: HeritageKind;
  /** Year of inscription, then of any extension. */
  years: number[];
  /** Provinces and territories the property lies in. The first is where the Canada map counts it. */
  provinces: string[];
  /** Ids of the places on the Canada map that stand for it. */
  places: string[];
  /** The other country, when the property crosses the border. */
  sharedWith?: string;
  /** One line on what it is, kept to what UNESCO's description says. */
  about: string;
}

// prettier-ignore
export const HERITAGE_CANADA: HeritageProperty[] = [
  // Cultural
  { name: 'Head-Smashed-In Buffalo Jump', kind: 'cultural', years: [1981], provinces: ['CA-AB'], places: ['head-smashed-in'],
    about: 'A cliff where peoples of the plains hunted bison for nearly 6,000 years.' },
  { name: 'Historic District of Old Québec', kind: 'cultural', years: [1985], provinces: ['CA-QC'], places: ['old-quebec'],
    about: 'The only North American city to have preserved its ramparts.' },
  { name: 'L’Anse aux Meadows National Historic Site', kind: 'cultural', years: [1978], provinces: ['CA-NL'], places: ['lanse-aux-meadows'],
    about: 'The remains of an 11th-century Viking settlement at the northern tip of Newfoundland, evidence of the first European presence in North America.' },
  { name: 'Landscape of Grand Pré', kind: 'cultural', years: [2012], provinces: ['CA-NS'], places: ['grand-pre'],
    about: 'Farmland made with dykes and wooden sluices by the Acadians from the 17th century, and a memorial to their deportation.' },
  { name: 'Old Town Lunenburg', kind: 'cultural', years: [1995], provinces: ['CA-NS'], places: ['old-town-lunenburg'],
    about: 'The best surviving example of a planned British colonial settlement in North America, founded in 1753.' },
  { name: 'Red Bay Basque Whaling Station', kind: 'cultural', years: [2013], provinces: ['CA-NL'], places: ['red-bay'],
    about: 'A station used by Basque whalers for some 70 years in the 16th century, on the coast of Labrador.' },
  { name: 'Rideau Canal', kind: 'cultural', years: [2007], provinces: ['CA-ON'], places: ['rideau-canal'],
    about: 'A canal of 202 km along the Rideau and Cataraqui rivers, the best-preserved slackwater canal in North America.' },
  { name: 'SGang Gwaay', kind: 'cultural', years: [1981], provinces: ['CA-BC'], places: ['sgang-gwaay'],
    about: 'A Haida village with the remains of houses and carved mortuary and memorial poles.' },
  { name: 'Tr’ondëk-Klondike', kind: 'cultural', years: [2023], provinces: ['CA-YT'], places: ['trondek-klondike'],
    about: 'Sites along the Yukon River, in the homeland of the Tr’ondëk Hwëch’in, that record the changes the Klondike Gold Rush brought.' },
  { name: 'Writing-on-Stone / Áísínai’pi', kind: 'cultural', years: [2019], provinces: ['CA-AB'], places: ['writing-on-stone'],
    about: 'Engravings and paintings on the sandstone walls of the Milk River valley, a landscape sacred to the Blackfoot people.' },
  // Natural
  { name: 'Anticosti', kind: 'natural', years: [2023], provinces: ['CA-QC'], places: ['anticosti'],
    about: 'Fossils that record the first mass extinction of animal life, 447 to 437 million years ago.' },
  { name: 'Canadian Rocky Mountain Parks', kind: 'natural', years: [1984, 1990], provinces: ['CA-AB', 'CA-BC'], places: ['banff', 'jasper', 'kootenay', 'yoho'],
    about: 'Banff, Jasper, Kootenay and Yoho national parks with three provincial parks, and the Burgess Shale fossil site.' },
  { name: 'Dinosaur Provincial Park', kind: 'natural', years: [1979], provinces: ['CA-AB'], places: ['dinosaur-provincial-park'],
    about: 'About 35 species of dinosaur, some 75 million years old, have been found here.' },
  { name: 'Gros Morne National Park', kind: 'natural', years: [1987], provinces: ['CA-NL'], places: ['gros-morne'],
    about: 'A rare example of the process of continental drift, where deep ocean crust and rocks of the earth’s mantle lie exposed.' },
  { name: 'Joggins Fossil Cliffs', kind: 'natural', years: [2008], provinces: ['CA-NS'], places: ['joggins-fossil-cliffs'],
    about: 'Sea cliffs of fossils from the Carboniferous period, 354 to 290 million years ago.' },
  { name: 'Kluane / Wrangell-St. Elias / Glacier Bay / Tatshenshini-Alsek', kind: 'natural', years: [1979, 1992, 1994], provinces: ['CA-YT', 'CA-BC'], places: ['kluane'], sharedWith: 'United States',
    about: 'Parks in Yukon, British Columbia and Alaska around the largest non-polar icefield in the world.' },
  { name: 'Miguasha National Park', kind: 'natural', years: [1999], provinces: ['CA-QC'], places: ['miguasha'],
    about: 'Fossils of the Devonian period, known as the Age of Fishes.' },
  { name: 'Mistaken Point', kind: 'natural', years: [2016], provinces: ['CA-NL'], places: ['mistaken-point'],
    about: 'The oldest known assemblages of large fossils anywhere.' },
  { name: 'Nahanni National Park', kind: 'natural', years: [1978], provinces: ['CA-NT'], places: ['nahanni'],
    about: 'Deep canyons and huge waterfalls along the South Nahanni River.' },
  { name: 'Waterton Glacier International Peace Park', kind: 'natural', years: [1995], provinces: ['CA-AB'], places: ['waterton-lakes'], sharedWith: 'United States',
    about: 'Waterton Lakes in Alberta and Glacier in Montana, joined in 1932 as the world’s first International Peace Park.' },
  { name: 'Wood Buffalo National Park', kind: 'natural', years: [1983], provinces: ['CA-AB', 'CA-NT'], places: ['wood-buffalo'],
    about: 'Home to North America’s largest population of wild bison, and the only breeding habitat of the whooping crane.' },
  // Mixed
  { name: 'Pimachiowin Aki', kind: 'mixed', years: [2018], provinces: ['CA-MB', 'CA-ON'], places: ['pimachiowin-aki'],
    about: 'Forest in the ancestral lands of the Anishinaabeg, on both sides of the Manitoba–Ontario border.' },
];

/** Properties on Canada's Tentative List, the candidates for future nomination, on the day the list was read. */
export const HERITAGE_TENTATIVE = 10;
