import type { PlaceDef, PlaceLayer } from '../../lib/maps/types';
import { CANADA_CITIES } from './canada-cities';

/**
 * Canada: the places inside each province and territory.
 *
 * Four kinds of place, each with its own rule for what is listed:
 *
 *  1. Cities: the 45 cities of the cities map (41 census metropolitan areas and four more
 *     capitals). Their marks are shared with that map, so a city is only ever marked once.
 *  2. National parks: every national park and national park reserve, 48 in all (Parks Canada
 *     counts 37 parks and 11 reserves), plus Rouge National Urban Park.
 *  3. World Heritage Sites: UNESCO lists 22 properties for Canada. Six of them are, or are made up
 *     of, national parks already listed above (the Canadian Rocky Mountain Parks, Gros Morne,
 *     Kluane, Nahanni, Waterton and Wood Buffalo); those parks carry a note instead of a second
 *     entry. The other 16 are listed here.
 *  4. Well-known places: a short list of each province's and territory's best-known attractions,
 *     chosen by WorldTripMap. This is an editorial selection, not an official list or a ranking.
 *
 * Sources, checked 10 October 2026:
 *  - National parks: Wikipedia, "List of national parks of Canada" (current to July 2024, with
 *    Pituamkek, established 6 August 2024, as the newest), which summarises Parks Canada.
 *  - World Heritage Sites: UNESCO World Heritage Centre, States Parties: Canada.
 *
 * A place is counted in exactly one province or territory. Where a place lies in two, it is
 * listed where most of it is, or where most visitors reach it, and the note names the other.
 */

type Entry = Omit<PlaceDef, 'kind'>;

// prettier-ignore
const PARKS: Entry[] = [
  // Newfoundland and Labrador
  { id: 'gros-morne', name: 'Gros Morne', within: 'CA-NL', note: 'World Heritage Site' },
  { id: 'terra-nova', name: 'Terra Nova', within: 'CA-NL' },
  { id: 'torngat-mountains', name: 'Torngat Mountains', within: 'CA-NL' },
  { id: 'mealy-mountains', name: 'Akami-Uapishkᵁ-KakKasuak-Mealy Mountains', within: 'CA-NL', note: 'Reserve', aliases: ['Mealy Mountains', 'Akami-Uapishku-KakKasuak'] },
  // Prince Edward Island
  { id: 'prince-edward-island-national-park', name: 'Prince Edward Island National Park', within: 'CA-PE', aliases: ['PEI National Park', 'Cavendish Beach', 'Greenwich', 'Brackley'] },
  { id: 'pituamkek', name: 'Pituamkek', within: 'CA-PE', note: 'Reserve', aliases: ['Hog Island', 'Sandhills'] },
  // Nova Scotia
  { id: 'cape-breton-highlands', name: 'Cape Breton Highlands', within: 'CA-NS', aliases: ['Cape Breton'] },
  { id: 'kejimkujik', name: 'Kejimkujik', within: 'CA-NS', aliases: ['Keji'] },
  { id: 'sable-island', name: 'Sable Island', within: 'CA-NS', note: 'Reserve' },
  // New Brunswick
  { id: 'fundy', name: 'Fundy', within: 'CA-NB', aliases: ['Bay of Fundy'] },
  { id: 'kouchibouguac', name: 'Kouchibouguac', within: 'CA-NB' },
  // Quebec
  { id: 'forillon', name: 'Forillon', within: 'CA-QC', aliases: ['Gaspé', 'Gaspe'] },
  { id: 'la-mauricie', name: 'La Mauricie', within: 'CA-QC', aliases: ['Mauricie'] },
  { id: 'mingan-archipelago', name: 'Mingan Archipelago', within: 'CA-QC', note: 'Reserve', aliases: ['Mingan'] },
  // Ontario
  { id: 'bruce-peninsula', name: 'Bruce Peninsula', within: 'CA-ON', aliases: ['Tobermory', 'The Grotto'] },
  { id: 'georgian-bay-islands', name: 'Georgian Bay Islands', within: 'CA-ON', aliases: ['Georgian Bay', 'Beausoleil Island'] },
  { id: 'point-pelee', name: 'Point Pelee', within: 'CA-ON' },
  { id: 'pukaskwa', name: 'Pukaskwa', within: 'CA-ON' },
  { id: 'thousand-islands', name: 'Thousand Islands', within: 'CA-ON', aliases: ['1000 Islands'] },
  { id: 'rouge', name: 'Rouge', within: 'CA-ON', note: 'National urban park', aliases: ['Rouge Park', 'Rouge Valley'] },
  // Manitoba
  { id: 'riding-mountain', name: 'Riding Mountain', within: 'CA-MB', aliases: ['Wasagaming', 'Clear Lake'] },
  { id: 'wapusk', name: 'Wapusk', within: 'CA-MB' },
  // Saskatchewan
  { id: 'grasslands', name: 'Grasslands', within: 'CA-SK' },
  { id: 'prince-albert-national-park', name: 'Prince Albert National Park', within: 'CA-SK', aliases: ['Waskesiu'] },
  // Alberta
  { id: 'banff', name: 'Banff', within: 'CA-AB', note: 'World Heritage Site' },
  { id: 'jasper', name: 'Jasper', within: 'CA-AB', note: 'World Heritage Site', aliases: ['Maligne Lake'] },
  { id: 'waterton-lakes', name: 'Waterton Lakes', within: 'CA-AB', note: 'World Heritage Site', aliases: ['Waterton'] },
  { id: 'elk-island', name: 'Elk Island', within: 'CA-AB' },
  { id: 'wood-buffalo', name: 'Wood Buffalo', within: 'CA-AB', note: 'World Heritage Site, also in the Northwest Territories' },
  // British Columbia
  { id: 'yoho', name: 'Yoho', within: 'CA-BC', note: 'World Heritage Site', aliases: ['Emerald Lake', 'Takakkaw Falls'] },
  { id: 'kootenay', name: 'Kootenay', within: 'CA-BC', note: 'World Heritage Site', aliases: ['Radium Hot Springs'] },
  { id: 'glacier', name: 'Glacier', within: 'CA-BC', aliases: ['Rogers Pass'] },
  { id: 'mount-revelstoke', name: 'Mount Revelstoke', within: 'CA-BC', aliases: ['Revelstoke'] },
  { id: 'pacific-rim', name: 'Pacific Rim', within: 'CA-BC', note: 'Reserve', aliases: ['Long Beach', 'West Coast Trail', 'Ucluelet'] },
  { id: 'gulf-islands', name: 'Gulf Islands', within: 'CA-BC', note: 'Reserve' },
  { id: 'gwaii-haanas', name: 'Gwaii Haanas', within: 'CA-BC', note: 'Reserve', aliases: ['Haida Gwaii', 'Queen Charlotte Islands'] },
  // Yukon
  { id: 'kluane', name: 'Kluane', within: 'CA-YT', note: 'Park and reserve, World Heritage Site', aliases: ['Haines Junction'] },
  { id: 'ivvavik', name: 'Ivvavik', within: 'CA-YT' },
  { id: 'vuntut', name: 'Vuntut', within: 'CA-YT' },
  // Northwest Territories
  { id: 'nahanni', name: 'Nahanni', within: 'CA-NT', note: 'Reserve, World Heritage Site', aliases: ['Virginia Falls'] },
  { id: 'naatsihchoh', name: 'Nááts’įhch’oh', within: 'CA-NT', note: 'Reserve', aliases: ['Naatsihchoh', "Naats'ihch'oh"] },
  { id: 'thaidene-nene', name: 'Thaidene Nëné', within: 'CA-NT', note: 'Reserve', aliases: ['Thaidene Nene'] },
  { id: 'tuktut-nogait', name: 'Tuktut Nogait', within: 'CA-NT' },
  { id: 'aulavik', name: 'Aulavik', within: 'CA-NT', aliases: ['Banks Island'] },
  // Nunavut
  { id: 'auyuittuq', name: 'Auyuittuq', within: 'CA-NU', aliases: ['Mount Thor', 'Akshayuk Pass'] },
  { id: 'sirmilik', name: 'Sirmilik', within: 'CA-NU', aliases: ['Bylot Island'] },
  { id: 'quttinirpaaq', name: 'Quttinirpaaq', within: 'CA-NU', aliases: ['Ellesmere Island'] },
  { id: 'ukkusiksalik', name: 'Ukkusiksalik', within: 'CA-NU', aliases: ['Wager Bay'] },
  { id: 'qausuittuq', name: 'Qausuittuq', within: 'CA-NU', aliases: ['Bathurst Island'] },
];

// prettier-ignore
const HERITAGE: Entry[] = [
  { id: 'lanse-aux-meadows', name: 'L’Anse aux Meadows', within: 'CA-NL', aliases: ["L'Anse aux Meadows", 'Vikings', 'Norse'] },
  { id: 'red-bay', name: 'Red Bay Basque Whaling Station', within: 'CA-NL', aliases: ['Red Bay'] },
  { id: 'mistaken-point', name: 'Mistaken Point', within: 'CA-NL' },
  { id: 'old-town-lunenburg', name: 'Old Town Lunenburg', within: 'CA-NS', aliases: ['Lunenburg', 'Bluenose'] },
  { id: 'grand-pre', name: 'Landscape of Grand Pré', within: 'CA-NS', aliases: ['Grand Pré', 'Grand Pre'] },
  { id: 'joggins-fossil-cliffs', name: 'Joggins Fossil Cliffs', within: 'CA-NS', aliases: ['Joggins'] },
  { id: 'old-quebec', name: 'Old Québec', within: 'CA-QC', aliases: ['Old Quebec', 'Vieux-Québec', 'Vieux Quebec', 'Château Frontenac', 'Chateau Frontenac', 'Historic District of Old Québec'] },
  { id: 'miguasha', name: 'Miguasha National Park', within: 'CA-QC', aliases: ['Miguasha'] },
  { id: 'anticosti', name: 'Anticosti', within: 'CA-QC', aliases: ['Anticosti Island', 'Île d’Anticosti'] },
  { id: 'rideau-canal', name: 'Rideau Canal', within: 'CA-ON' },
  { id: 'pimachiowin-aki', name: 'Pimachiowin Aki', within: 'CA-MB', note: 'Also in Ontario' },
  { id: 'head-smashed-in', name: 'Head-Smashed-In Buffalo Jump', within: 'CA-AB' },
  { id: 'dinosaur-provincial-park', name: 'Dinosaur Provincial Park', within: 'CA-AB' },
  { id: 'writing-on-stone', name: 'Writing-on-Stone / Áísínai’pi', within: 'CA-AB', aliases: ['Writing on Stone', 'Aisinaipi'] },
  { id: 'sgang-gwaay', name: 'SGang Gwaay', within: 'CA-BC', aliases: ['Ninstints', 'Anthony Island', 'SG̱ang Gwaay'] },
  { id: 'trondek-klondike', name: 'Tr’ondëk-Klondike', within: 'CA-YT', note: 'Dawson City and the Klondike', aliases: ['Dawson City', 'Dawson', 'Klondike', 'Trondek-Klondike'] },
];

// prettier-ignore
const SIGHTS: Entry[] = [
  // Newfoundland and Labrador
  { id: 'signal-hill', name: 'Signal Hill', within: 'CA-NL', aliases: ['Cabot Tower'] },
  { id: 'cape-spear', name: 'Cape Spear', within: 'CA-NL' },
  { id: 'twillingate', name: 'Twillingate', within: 'CA-NL', aliases: ['Iceberg Alley'] },
  { id: 'bonavista-peninsula', name: 'Bonavista Peninsula', within: 'CA-NL', aliases: ['Bonavista', 'Trinity', 'Elliston'] },
  { id: 'fogo-island', name: 'Fogo Island', within: 'CA-NL' },
  { id: 'cape-st-marys', name: 'Cape St. Mary’s', within: 'CA-NL', aliases: ["Cape St. Mary's"] },
  // Prince Edward Island
  { id: 'green-gables', name: 'Green Gables Heritage Place', within: 'CA-PE', aliases: ['Green Gables', 'Anne of Green Gables', 'Cavendish'] },
  { id: 'confederation-bridge', name: 'Confederation Bridge', within: 'CA-PE', note: 'Links PEI and New Brunswick' },
  { id: 'basin-head', name: 'Basin Head', within: 'CA-PE', aliases: ['Singing Sands'] },
  // Nova Scotia
  { id: 'peggys-cove', name: 'Peggy’s Cove', within: 'CA-NS', aliases: ["Peggy's Cove", 'Peggys Cove'] },
  { id: 'cabot-trail', name: 'Cabot Trail', within: 'CA-NS' },
  { id: 'fortress-of-louisbourg', name: 'Fortress of Louisbourg', within: 'CA-NS', aliases: ['Louisbourg'] },
  { id: 'halifax-citadel', name: 'Halifax Citadel', within: 'CA-NS', aliases: ['Citadel Hill'] },
  { id: 'pier-21', name: 'Pier 21 and the Halifax waterfront', within: 'CA-NS', aliases: ['Pier 21', 'Halifax waterfront', 'Canadian Museum of Immigration'] },
  // New Brunswick
  { id: 'hopewell-rocks', name: 'Hopewell Rocks', within: 'CA-NB', aliases: ['Flowerpot Rocks'] },
  { id: 'reversing-falls', name: 'Reversing Falls', within: 'CA-NB' },
  { id: 'saint-andrews', name: 'Saint Andrews', within: 'CA-NB', aliases: ['St. Andrews', 'St. Andrews by-the-Sea'] },
  { id: 'magnetic-hill', name: 'Magnetic Hill', within: 'CA-NB' },
  { id: 'kings-landing', name: 'Kings Landing', within: 'CA-NB' },
  // Quebec
  { id: 'old-montreal', name: 'Old Montréal', within: 'CA-QC', aliases: ['Old Montreal', 'Vieux-Montréal', 'Notre-Dame Basilica', 'Old Port'] },
  { id: 'mont-tremblant', name: 'Mont-Tremblant', within: 'CA-QC', aliases: ['Tremblant', 'Laurentians'] },
  { id: 'montmorency-falls', name: 'Montmorency Falls', within: 'CA-QC', aliases: ['Chute Montmorency'] },
  { id: 'perce-rock', name: 'Percé Rock', within: 'CA-QC', aliases: ['Perce Rock', 'Rocher Percé', 'Percé', 'Bonaventure Island'] },
  { id: 'ile-dorleans', name: 'Île d’Orléans', within: 'CA-QC', aliases: ["Ile d'Orleans", 'Island of Orleans'] },
  { id: 'charlevoix', name: 'Charlevoix', within: 'CA-QC', aliases: ['Baie-Saint-Paul', 'La Malbaie'] },
  { id: 'saguenay-fjord', name: 'Saguenay Fjord', within: 'CA-QC', aliases: ['Tadoussac', 'Fjord-du-Saguenay'] },
  { id: 'magdalen-islands', name: 'Magdalen Islands', within: 'CA-QC', aliases: ['Îles de la Madeleine', 'Iles de la Madeleine'] },
  // Ontario
  { id: 'niagara-falls', name: 'Niagara Falls', within: 'CA-ON', aliases: ['Horseshoe Falls', 'Clifton Hill'] },
  { id: 'cn-tower', name: 'CN Tower', within: 'CA-ON' },
  { id: 'parliament-hill', name: 'Parliament Hill', within: 'CA-ON', aliases: ['Parliament', 'Peace Tower'] },
  { id: 'algonquin', name: 'Algonquin Provincial Park', within: 'CA-ON', aliases: ['Algonquin Park'] },
  { id: 'niagara-on-the-lake', name: 'Niagara-on-the-Lake', within: 'CA-ON', aliases: ['NOTL'] },
  { id: 'muskoka', name: 'Muskoka', within: 'CA-ON', aliases: ['Gravenhurst', 'Huntsville', 'Bracebridge', 'Cottage country'] },
  { id: 'toronto-islands', name: 'Toronto Islands', within: 'CA-ON', aliases: ['Centre Island', 'Toronto Island'] },
  { id: 'blue-mountain', name: 'Blue Mountain', within: 'CA-ON', aliases: ['Collingwood', 'Blue Mountains'] },
  // Manitoba
  { id: 'the-forks', name: 'The Forks', within: 'CA-MB' },
  { id: 'museum-for-human-rights', name: 'Canadian Museum for Human Rights', within: 'CA-MB', aliases: ['CMHR', 'Human Rights Museum'] },
  { id: 'churchill', name: 'Churchill', within: 'CA-MB', aliases: ['Polar bears', 'Hudson Bay'] },
  { id: 'assiniboine-park', name: 'Assiniboine Park', within: 'CA-MB', aliases: ['Assiniboine Park Zoo', 'The Leaf'] },
  // Saskatchewan
  { id: 'wanuskewin', name: 'Wanuskewin Heritage Park', within: 'CA-SK', aliases: ['Wanuskewin'] },
  { id: 'rcmp-heritage-centre', name: 'RCMP Heritage Centre', within: 'CA-SK', aliases: ['Mounties', 'RCMP Depot'] },
  { id: 'cypress-hills', name: 'Cypress Hills', within: 'CA-SK', note: 'Also in Alberta', aliases: ['Fort Walsh'] },
  { id: 'tunnels-of-moose-jaw', name: 'Tunnels of Moose Jaw', within: 'CA-SK', aliases: ['Moose Jaw'] },
  { id: 'wascana-centre', name: 'Wascana Centre', within: 'CA-SK', aliases: ['Wascana Lake', 'Wascana Park', 'Legislative Building'] },
  // Alberta
  { id: 'lake-louise', name: 'Lake Louise', within: 'CA-AB', aliases: ['Moraine Lake'] },
  { id: 'columbia-icefield', name: 'Columbia Icefield', within: 'CA-AB', aliases: ['Athabasca Glacier', 'Icefields Parkway', 'Skywalk'] },
  { id: 'drumheller', name: 'Drumheller and the Royal Tyrrell Museum', within: 'CA-AB', aliases: ['Drumheller', 'Royal Tyrrell Museum', 'Badlands', 'Hoodoos'] },
  { id: 'west-edmonton-mall', name: 'West Edmonton Mall', within: 'CA-AB', aliases: ['WEM'] },
  { id: 'canmore-kananaskis', name: 'Canmore and Kananaskis', within: 'CA-AB', aliases: ['Canmore', 'Kananaskis', 'K-Country'] },
  // British Columbia
  { id: 'stanley-park', name: 'Stanley Park', within: 'CA-BC', aliases: ['Seawall'] },
  { id: 'whistler', name: 'Whistler', within: 'CA-BC', aliases: ['Whistler Blackcomb', 'Sea-to-Sky'] },
  { id: 'butchart-gardens', name: 'Butchart Gardens', within: 'CA-BC', aliases: ['The Butchart Gardens'] },
  { id: 'capilano', name: 'Capilano Suspension Bridge', within: 'CA-BC', aliases: ['Capilano'] },
  { id: 'tofino', name: 'Tofino', within: 'CA-BC', aliases: ['Clayoquot Sound'] },
  { id: 'okanagan-valley', name: 'Okanagan Valley', within: 'CA-BC', aliases: ['Okanagan', 'Penticton', 'Osoyoos', 'Vernon'] },
  { id: 'granville-island', name: 'Granville Island', within: 'CA-BC' },
  // Yukon
  { id: 'miles-canyon', name: 'Miles Canyon', within: 'CA-YT' },
  { id: 'carcross', name: 'Carcross', within: 'CA-YT', aliases: ['Carcross Desert', 'Emerald Lake'] },
  { id: 'tombstone', name: 'Tombstone Territorial Park', within: 'CA-YT', aliases: ['Tombstone', 'Dempster Highway'] },
  { id: 'ss-klondike', name: 'S.S. Klondike', within: 'CA-YT', aliases: ['SS Klondike'] },
  // Northwest Territories
  { id: 'great-slave-lake', name: 'Great Slave Lake', within: 'CA-NT' },
  { id: 'tuktoyaktuk', name: 'Tuktoyaktuk and the Arctic Ocean', within: 'CA-NT', aliases: ['Tuktoyaktuk', 'Tuk', 'Arctic Ocean', 'Pingos'] },
  { id: 'inuvik', name: 'Inuvik', within: 'CA-NT', aliases: ['Igloo Church'] },
  { id: 'alexandra-falls', name: 'Alexandra Falls', within: 'CA-NT', aliases: ['Twin Falls Gorge', 'Hay River', 'Louise Falls'] },
  // Nunavut
  { id: 'pond-inlet', name: 'Pond Inlet', within: 'CA-NU', aliases: ['Mittimatalik'] },
  { id: 'kinngait', name: 'Kinngait', within: 'CA-NU', note: 'Cape Dorset', aliases: ['Cape Dorset'] },
  { id: 'pangnirtung', name: 'Pangnirtung', within: 'CA-NU', aliases: ['Pang'] },
  { id: 'sylvia-grinnell', name: 'Sylvia Grinnell Territorial Park', within: 'CA-NU', aliases: ['Sylvia Grinnell'] },
];

/** The 45 cities, taken from the cities map so that the two never disagree. */
const CITIES: PlaceDef[] = CANADA_CITIES.map((city) => ({
  id: city.id,
  name: city.name,
  kind: 'city',
  within: city.province,
  aliases: city.aliases,
  note: city.capital === 'national' ? 'National capital' : city.capital ? 'Capital' : undefined,
  from: { map: 'canada-cities', id: city.id },
}));

const of = (kind: string, entries: Entry[]): PlaceDef[] => entries.map((entry) => ({ ...entry, kind }));

export const CANADA_PLACES: PlaceLayer = {
  id: 'canada',
  map: 'canada',
  kinds: [
    {
      id: 'city',
      name: { one: 'city', many: 'cities' },
      rule: 'Canada’s 41 census metropolitan areas and the four capitals that are not among them.',
    },
    {
      id: 'sight',
      name: { one: 'well-known place', many: 'well-known places' },
      rule: 'A short list of the best-known attractions, chosen by WorldTripMap. Not an official list.',
    },
    {
      id: 'park',
      name: { one: 'national park', many: 'national parks' },
      rule: 'Every national park and national park reserve, and Rouge National Urban Park.',
    },
    {
      id: 'heritage',
      name: { one: 'World Heritage Site', many: 'World Heritage Sites' },
      rule: 'UNESCO World Heritage Sites that are not already listed as a national park.',
    },
  ],
  places: [...CITIES, ...of('sight', SIGHTS), ...of('park', PARKS), ...of('heritage', HERITAGE)],
  countingNote:
    'These percentages are the share of the places on our list that you have ticked. They are not a share of land area, and the list is a selection: every province and territory has far more to see than is on it.',
  sources: [
    {
      name: 'Parks Canada: national parks and national park reserves (37 parks and 11 reserves), as listed in Wikipedia’s “List of national parks of Canada”',
      url: 'https://en.wikipedia.org/wiki/List_of_national_parks_of_Canada',
      licence: 'Reference',
      note: 'Which national parks are listed, and the province or territory of each.',
    },
    {
      name: 'UNESCO World Heritage Centre: properties inscribed for Canada (22)',
      url: 'https://whc.unesco.org/en/statesparties/ca',
      licence: 'Reference',
      note: 'Which World Heritage Sites are listed.',
    },
    {
      name: 'Statistics Canada, The Daily (9 February 2022): 41 census metropolitan areas, 2021 Census',
      url: 'https://www150.statcan.gc.ca/n1/daily-quotidien/220209/dq220209b-eng.htm',
      licence: 'Reference',
      note: 'Which cities are listed.',
    },
  ],
};
