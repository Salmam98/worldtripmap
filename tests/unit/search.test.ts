import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/lib/maps/registry';
import { normalizeText, searchFeatures } from '../../src/lib/maps/search';

const first = (map: keyof typeof MAPS, query: string) => searchFeatures(MAPS[map], query)[0]?.name;
const names = (map: keyof typeof MAPS, query: string) => searchFeatures(MAPS[map], query).map((f) => f.name);

describe('normalising what people type', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeText('  QUÉBEC  ')).toBe('quebec');
    expect(normalizeText('Côte d’Ivoire')).toBe('cote divoire');
    expect(normalizeText('St. John’s')).toBe('st johns');
    expect(normalizeText('Kitchener–Cambridge–Waterloo')).toBe('kitchener cambridge waterloo');
  });
});

describe('finding places on the Canada map', () => {
  it('finds provinces by name, postal code and common nickname', () => {
    expect(first('canada', 'ontario')).toBe('Ontario');
    expect(first('canada', 'ON')).toBe('Ontario');
    expect(first('canada', 'pei')).toBe('Prince Edward Island');
    expect(first('canada', 'P.E.I.')).toBe('Prince Edward Island');
    expect(first('canada', 'nwt')).toBe('Northwest Territories');
    expect(first('canada', 'newfoundland')).toBe('Newfoundland and Labrador');
  });

  it('finds provinces by their French names, with or without accents', () => {
    expect(first('canada', 'Québec')).toBe('Quebec');
    expect(first('canada', 'colombie')).toBe('British Columbia');
    expect(first('canada', 'nouvelle-ecosse')).toBe('Nova Scotia');
  });

  it('matches from the start of any word', () => {
    expect(names('canada', 'new')).toEqual(['New Brunswick', 'Newfoundland and Labrador']);
    expect(names('canada', 'col')).toContain('British Columbia');
  });

  it('returns every place for an empty search and none for nonsense', () => {
    expect(searchFeatures(MAPS.canada, '')).toHaveLength(13);
    expect(searchFeatures(MAPS.canada, '   ')).toHaveLength(13);
    expect(searchFeatures(MAPS.canada, 'zzzz')).toEqual([]);
    expect(searchFeatures(MAPS.canada, '<script>')).toEqual([]);
  });
});

describe('finding places on the world map', () => {
  it('understands everyday names for countries', () => {
    expect(first('world', 'holland')).toBe('Netherlands');
    expect(first('world', 'usa')).toBe('United States');
    expect(first('world', 'uk')).toBe('United Kingdom');
    expect(first('world', 'burma')).toBe('Myanmar');
    expect(first('world', 'ivory coast')).toBe('Côte d’Ivoire');
    expect(first('world', 'turkey')).toBe('Türkiye');
  });

  it('puts an exact name ahead of longer names that contain it', () => {
    expect(first('world', 'niger')).toBe('Niger');
    expect(names('world', 'niger')).toContain('Nigeria');
    expect(first('world', 'guinea')).toBe('Guinea');
  });

  it('finds territories as well as countries', () => {
    expect(first('world', 'greenland')).toBe('Greenland');
    expect(first('world', 'tahiti')).toBe('French Polynesia');
    expect(first('world', 'macau')).toBe('Macao');
  });
});

describe('finding places on the cities map', () => {
  it('finds a metropolitan area by any of the cities in it', () => {
    expect(first('canada-cities', 'mississauga')).toBe('Toronto');
    expect(first('canada-cities', 'waterloo')).toBe('Kitchener–Cambridge–Waterloo');
    expect(first('canada-cities', 'gatineau')).toBe('Ottawa–Gatineau');
    expect(first('canada-cities', 'niagara')).toBe('St. Catharines–Niagara');
  });

  it('does not need accents or punctuation', () => {
    expect(first('canada-cities', 'montreal')).toBe('Montréal');
    expect(first('canada-cities', 'quebec city')).toBe('Québec City');
    expect(first('canada-cities', 'st johns')).toBe('St. John’s');
    expect(first('canada-cities', 'trois rivieres')).toBe('Trois-Rivières');
  });
});
