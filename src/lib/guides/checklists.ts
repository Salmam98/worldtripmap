/**
 * The two printable checklists the guides offer, described as data. `npm run checklists:build`
 * turns each into a Letter and an A4 PDF under public/downloads/.
 */
import { checklistKey, PAPERS, type ChecklistSpec, type PaperId } from './checklist-pdf';
import { continents, COUNTRY_TOTAL, countryNote, parksByProvince, parkTotals, TERRITORY_TOTAL, territoriesByState, UN_MEMBER_TOTAL } from './lists';

/** The day the lists were last checked against their sources. Printed on every sheet. */
export const CHECKLISTS_CHECKED = '2026-10-11';

const checkedLine = `List checked ${new Date(`${CHECKLISTS_CHECKED}T00:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}. Free to print and share.`;

export function countriesChecklist(): ChecklistSpec {
  const parts = continents();
  return {
    id: 'countries-visited-checklist',
    title: 'Countries Visited Checklist',
    intro: `All ${COUNTRY_TOTAL} countries, by continent. Tick the ones you have been to, then write your count on the right.`,
    tallyLabel: 'Countries visited',
    tally: `of ${COUNTRY_TOTAL}`,
    maxSize: 9.4,
    zones: [
      {
        columns: 5,
        sections: parts
          .filter((part) => part.countries.length > 0)
          .map((part) => ({ heading: part.name, items: part.countries.map((unit) => ({ name: countryNote(unit) ? `${unit.name} *` : unit.name })) })),
      },
      {
        title: 'Territories and other areas (optional). Counted separately from the countries above.',
        tally: `of ${TERRITORY_TOTAL}`,
        columns: 5,
        sections: territoriesByState().map((group) => ({
          heading: group.state ? group.state.name : 'Listed on their own',
          items: group.territories.map((unit) => ({ name: unit.name })),
        })),
      },
    ],
    footnotes: [
      `The ${COUNTRY_TOTAL} countries are the ${UN_MEMBER_TOTAL} member states of the United Nations and its ${COUNTRY_TOTAL - UN_MEMBER_TOTAL} observer states, marked *. Continents follow the United Nations’ statistical regions: Russia is under Europe; Türkiye, Cyprus, Armenia, Azerbaijan and Georgia are under Asia; Central America and the Caribbean are under North America.`,
      'Territories are grouped under the state responsible for them. Listing a place on its own line says where you have travelled, not what its political status is.',
    ],
    address: 'worldtripmap.com/guides/countries-visited-checklist/',
    checked: checkedLine,
  };
}

export function parksChecklist(): ChecklistSpec {
  const totals = parkTotals();
  const provinces = parksByProvince();
  const urban = provinces.flatMap((entry) => entry.urban.map((place) => ({ place, region: entry.region })));
  return {
    id: 'canada-national-parks-checklist',
    title: 'Canada’s National Parks Checklist',
    intro: `The ${totals.parks} national parks and ${totals.reserves} national park reserves, by province and territory.`,
    tallyLabel: 'Parks visited',
    tally: `of ${totals.all}`,
    maxSize: 13,
    zones: [
      {
        columns: 3,
        keepSections: true,
        sections: [
          ...provinces.map((entry) => ({ heading: entry.region.name, items: entry.parks.map((place) => ({ name: place.name, note: place.note })) })),
          ...(urban.length
            ? [{ heading: 'National urban park', items: urban.map(({ place, region }) => ({ name: place.name, note: `${region.name}. Counted apart from the ${totals.all}` })) }]
            : []),
        ],
      },
    ],
    footnotes: [
      `Parks Canada counts ${totals.parks} national parks and ${totals.reserves} national park reserves. A reserve is managed like a national park, on land that is subject to one or more Indigenous land claims. Kluane is a park and a reserve, and is counted with the reserves.`,
      'Each park is listed once, in the province or territory where most of it lies. Parks marked World Heritage Site are on the UNESCO World Heritage List, alone or as part of a larger site.',
    ],
    address: 'worldtripmap.com/guides/canada-national-parks-checklist/',
    checked: checkedLine,
  };
}

export const CHECKLISTS: ChecklistSpec[] = [countriesChecklist(), parksChecklist()];

export const PAPER_IDS = Object.keys(PAPERS) as PaperId[];

/** Where a checklist is served from, and saved under public/. */
export const checklistPath = (spec: ChecklistSpec, paper: PaperId): string => `/downloads/${spec.id}-${paper}.pdf`;

/** What the PDF says about itself. The key changes whenever a name on the list does. */
export const checklistSubject = (spec: ChecklistSpec): string => `WorldTripMap checklist, data key ${checklistKey(spec)}`;
