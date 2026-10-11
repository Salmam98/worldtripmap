/**
 * Pinned geographic sources.
 *
 * Natural Earth is in the public domain ("You may use the maps in any manner, including modifying
 * the content and design, electronic dissemination, and offset printing." — naturalearthdata.com
 * terms of use). Files are fetched from the official GitHub mirror at a fixed tag and verified by
 * SHA-256, so a rebuild always starts from exactly the same data.
 */
export const NATURAL_EARTH_VERSION = '5.1.2';

export const NATURAL_EARTH_BASE =
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${NATURAL_EARTH_VERSION}/geojson`;

export const SOURCES: Record<string, string> = {
  'ne_50m_admin_0_countries_lakes.geojson': 'b4c14911c7eec4a5d920b90294de6c16fdb078425b2caa6974a38a0b261f9667',
  'ne_50m_lakes.geojson': 'd350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52',
  'ne_10m_admin_1_states_provinces_lakes.geojson': 'ff5e330cf097a639cc413ab849814d605ba76307235e3a9eba5d1aa0491beba1',
  'ne_10m_lakes.geojson': '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9',
  'ne_10m_populated_places.geojson': '9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b',
};

export const CACHE_DIR = `.cache/natural-earth/v${NATURAL_EARTH_VERSION}`;
