import {
  ResolvedLocality,
  ServiceArea,
  ServiceAreaLevel,
} from './shared-types.js';

/** Case- and accent-insensitive normalization for locality comparison. */
export function normalizeLocality(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function localityFieldFor(level: ServiceAreaLevel): keyof ResolvedLocality {
  switch (level) {
    case ServiceAreaLevel.CITY:
      return 'city';
    case ServiceAreaLevel.STATE:
      return 'state';
    case ServiceAreaLevel.COUNTRY:
      return 'country';
  }
}

/**
 * Hierarchical service-area check (city ⊂ state ⊂ country): only the field
 * matching the area level is compared — a STATE-level area accepts any city
 * within its states. Returns null when the relevant locality field is not
 * resolved (caller decides the policy for unresolved localities), otherwise
 * a definite boolean.
 */
export function isWithinServiceArea(
  area: ServiceArea | null,
  locality: ResolvedLocality | null,
): boolean | null {
  if (!area) {
    return true;
  }
  const value = locality?.[localityFieldFor(area.level)];
  if (!value) {
    return null;
  }
  const normalized = normalizeLocality(value);
  return area.values.some((v) => normalizeLocality(v) === normalized);
}
