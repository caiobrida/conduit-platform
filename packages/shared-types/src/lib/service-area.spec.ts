import { isWithinServiceArea, normalizeLocality } from './service-area.js';
import { ServiceAreaLevel } from './shared-types.js';

const locality = (
  city: string | null,
  state: string | null = 'SP',
  country: string | null = 'BR',
) => ({ city, state, country });

describe('normalizeLocality', () => {
  it('ignores case, accents and surrounding whitespace', () => {
    expect(normalizeLocality('  São Paulo ')).toBe('sao paulo');
    expect(normalizeLocality('CAMPINAS')).toBe('campinas');
  });
});

describe('isWithinServiceArea', () => {
  it('accepts everything when the tenant has no service area', () => {
    expect(isWithinServiceArea(null, locality('Guarulhos'))).toBe(true);
    expect(isWithinServiceArea(null, null)).toBe(true);
  });

  it('CITY level matches only the listed cities', () => {
    const area = { level: ServiceAreaLevel.CITY, values: ['Campinas'] };
    expect(isWithinServiceArea(area, locality('Campinas'))).toBe(true);
    expect(isWithinServiceArea(area, locality('campinas '))).toBe(true);
    expect(isWithinServiceArea(area, locality('Guarulhos'))).toBe(false);
  });

  it('STATE level accepts any city within the state (hierarchy)', () => {
    const area = { level: ServiceAreaLevel.STATE, values: ['SP'] };
    expect(isWithinServiceArea(area, locality('Guarulhos', 'SP'))).toBe(true);
    expect(isWithinServiceArea(area, locality('Niterói', 'RJ'))).toBe(false);
  });

  it('COUNTRY level accepts any state/city within the country', () => {
    const area = { level: ServiceAreaLevel.COUNTRY, values: ['BR'] };
    expect(isWithinServiceArea(area, locality('Niterói', 'RJ', 'BR'))).toBe(
      true,
    );
    expect(isWithinServiceArea(area, locality('Lisboa', null, 'PT'))).toBe(
      false,
    );
  });

  it('returns null when the relevant locality field is unresolved', () => {
    const area = { level: ServiceAreaLevel.CITY, values: ['Campinas'] };
    expect(isWithinServiceArea(area, locality(null))).toBeNull();
    expect(isWithinServiceArea(area, null)).toBeNull();
  });
});
