import { CANADA_CITIES } from '../../data/definitions/canada-cities';
import { CANADA_REGIONS } from '../../data/definitions/canada';
import { computeStats } from './stats';
import type { MapDefinition, MapId, Selection } from './types';

/**
 * Achievements are plain rules over the places someone has marked. Each one states its rule in
 * words and reports progress as "have / need", so nothing is awarded that the map does not show.
 */
export interface Achievement {
  id: string;
  name: string;
  rule: string;
  have: number;
  need: number;
  earned: boolean;
}

type Rule = (def: MapDefinition, selection: Selection) => Omit<Achievement, 'earned'>;

const count = (ids: string[], selection: Selection) => ids.filter((id) => selection.visited.has(id)).length;

const firstAdventure: Rule = (def, selection) => ({
  id: 'first-adventure',
  name: 'First Adventure',
  rule: `Mark your first ${def.unit.one}.`,
  have: Math.min(1, computeStats(def, selection).visited),
  need: 1,
});

const regionalExplorer = (ruleText: string): Rule => (def, selection) => {
  const stats = computeStats(def, selection);
  return {
    id: 'regional-explorer',
    name: 'Regional Explorer',
    rule: ruleText,
    have: stats.groupsTouched,
    need: stats.groupsTotal,
  };
};

const halfwayThere: Rule = (def, selection) => {
  const stats = computeStats(def, selection);
  const need = Math.ceil(stats.total / 2);
  return {
    id: 'halfway-there',
    name: 'Halfway There',
    rule: `Mark at least half: ${need} of ${stats.total} ${def.unit.many}.`,
    have: Math.min(stats.visited, need),
    need,
  };
};

const completeExplorer: Rule = (def, selection) => {
  const stats = computeStats(def, selection);
  return {
    id: 'complete-explorer',
    name: 'Complete Explorer',
    rule: `Mark all ${stats.total} ${def.unit.many}.`,
    have: stats.visited,
    need: stats.total,
  };
};

const provinces = CANADA_REGIONS.filter((r) => r.type === 'province').map((r) => r.id);
const territories = CANADA_REGIONS.filter((r) => r.type === 'territory').map((r) => r.id);
const atlantic = CANADA_REGIONS.filter((r) => r.group === 'atlantic').map((r) => r.id);
const capitals = CANADA_CITIES.filter((c) => c.capital).map((c) => c.id);

const RULES: Record<MapId, Rule[]> = {
  world: [
    firstAdventure,
    (def, selection) => ({
      id: 'ten-countries',
      name: 'Double Digits',
      rule: 'Mark 10 countries.',
      have: Math.min(10, computeStats(def, selection).visited),
      need: 10,
    }),
    regionalExplorer('Mark at least one country on each of the six inhabited continents.'),
    halfwayThere,
    completeExplorer,
  ],
  canada: [
    firstAdventure,
    (_def, selection) => {
      const parts = [
        selection.visited.has('CA-BC'),
        atlantic.some((id) => selection.visited.has(id)),
        territories.some((id) => selection.visited.has(id)),
      ];
      return {
        id: 'coast-to-coast-to-coast',
        name: 'Coast to Coast to Coast',
        rule: 'Mark British Columbia, at least one Atlantic province and at least one territory: the Pacific, the Atlantic and the Arctic.',
        have: parts.filter(Boolean).length,
        need: 3,
      };
    },
    regionalExplorer('Mark at least one province or territory in each of Canada’s five regions.'),
    halfwayThere,
    (_def, selection) => ({
      id: 'north-of-sixty',
      name: 'North of Sixty',
      rule: 'Mark all three territories: Yukon, the Northwest Territories and Nunavut.',
      have: count(territories, selection),
      need: territories.length,
    }),
    (_def, selection) => ({
      id: 'every-province',
      name: 'Every Province',
      rule: 'Mark all ten provinces.',
      have: count(provinces, selection),
      need: provinces.length,
    }),
    completeExplorer,
  ],
  'canada-cities': [
    firstAdventure,
    regionalExplorer('Mark at least one city in each of Canada’s five regions.'),
    (_def, selection) => ({
      id: 'capital-collector',
      name: 'Capital Collector',
      rule: 'Mark Ottawa and all 13 provincial and territorial capitals.',
      have: count(capitals, selection),
      need: capitals.length,
    }),
    halfwayThere,
    completeExplorer,
  ],
};

export function computeAchievements(def: MapDefinition, selection: Selection): Achievement[] {
  return RULES[def.id].map((rule) => {
    const result = rule(def, selection);
    return { ...result, earned: result.need > 0 && result.have >= result.need };
  });
}
