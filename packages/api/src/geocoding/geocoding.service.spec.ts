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

  describe('forwardGeocode', () => {
    it('resolves coordinates, normalized address and locality from a match', async () => {
      mockFetch(async () => ({
        ok: true,
        json: async () => [
          {
            lat: '-22.9056',
            lon: '-47.0608',
            display_name: 'Avenida Anchieta, Campinas, SP, Brasil',
            address: {
              city: 'Campinas',
              state: 'São Paulo',
              'ISO3166-2-lvl4': 'BR-SP',
              country_code: 'br',
            },
          },
        ],
      }));

      await expect(
        service.forwardGeocode('Avenida Anchieta, Campinas'),
      ).resolves.toEqual({
        latitude: -22.9056,
        longitude: -47.0608,
        address: 'Avenida Anchieta, Campinas, SP, Brasil',
        locality: { city: 'Campinas', state: 'SP', country: 'BR' },
      });
    });

    it('returns null when the provider finds no match (address does not exist)', async () => {
      mockFetch(async () => ({ ok: true, json: async () => [] }));
      await expect(service.forwardGeocode('asdfqwerzxcv')).resolves.toBeNull();
    });

    it('returns null when the match has non-numeric coordinates', async () => {
      mockFetch(async () => ({
        ok: true,
        json: async () => [{ lat: 'x', lon: 'y', display_name: 'broken' }],
      }));
      await expect(service.forwardGeocode('somewhere')).resolves.toBeNull();
    });

    it('throws on HTTP errors (transient — caller maps to 503)', async () => {
      mockFetch(async () => ({ ok: false, status: 503 }));
      await expect(service.forwardGeocode('anywhere')).rejects.toThrow('503');
    });

    it('throws when the network fails (does not swallow like reverse)', async () => {
      mockFetch(async () => {
        throw new Error('network down');
      });
      await expect(service.forwardGeocode('anywhere')).rejects.toThrow(
        'network down',
      );
    });
  });
});
