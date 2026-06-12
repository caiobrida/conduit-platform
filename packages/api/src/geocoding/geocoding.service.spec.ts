import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  const config = {
    get: (_key: string, fallback: string) => fallback,
  } as unknown as ConfigService;
  const service = new GeocodingService(config);

  const mockFetch = (impl: () => Promise<unknown>) => {
    global.fetch = jest.fn(impl) as unknown as typeof fetch;
  };

  afterEach(() => jest.restoreAllMocks());

  it('resolves city, state code and country from a full response', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        address: {
          city: 'Campinas',
          state: 'São Paulo',
          'ISO3166-2-lvl4': 'BR-SP',
          country_code: 'br',
        },
      }),
    }));

    await expect(service.reverseGeocode(-22.9056, -47.0608)).resolves.toEqual({
      city: 'Campinas',
      state: 'SP',
      country: 'BR',
    });
  });

  it('falls back to town/state name on partial responses', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        address: { town: 'Paulínia', state: 'São Paulo', country_code: 'br' },
      }),
    }));

    await expect(service.reverseGeocode(-22.76, -47.15)).resolves.toEqual({
      city: 'Paulínia',
      state: 'São Paulo',
      country: 'BR',
    });
  });

  it('returns null on HTTP errors', async () => {
    mockFetch(async () => ({ ok: false, status: 503 }));
    await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
  });

  it('returns null when the network fails (never throws)', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });
    await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
  });

  it('returns null when no address is found', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({}) }));
    await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
  });
});
