import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResolvedLocality } from '@org/shared-types';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
  country_code?: string;
}

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Resolves coordinates into city/state/country via reverse geocoding
 * (Nominatim/OpenStreetMap by default; provider swappable through
 * GEOCODING_BASE_URL). Failures return null instead of throwing — creating
 * a service request must not depend on the geocoder being up; the
 * service-area validation (C8) decides how to handle unresolved localities.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>(
      'GEOCODING_BASE_URL',
      'https://nominatim.openstreetmap.org',
    );
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ResolvedLocality | null> {
    const url = new URL('/reverse', this.baseUrl);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('zoom', '10'); // city granularity
    url.searchParams.set('accept-language', 'pt-BR');

    try {
      const response = await fetch(url, {
        headers: {
          // Nominatim usage policy requires an identifying User-Agent.
          'User-Agent': 'conduit-platform/0.1 (service request geocoding)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Reverse geocoding failed with HTTP ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as { address?: NominatimAddress };
      const address = body.address;
      if (!address) {
        return null;
      }

      // ISO3166-2-lvl4 looks like "BR-SP" — keep only the state code.
      const stateCode = address['ISO3166-2-lvl4']?.split('-').pop();

      return {
        city:
          address.city ??
          address.town ??
          address.village ??
          address.municipality ??
          null,
        state: stateCode ?? address.state ?? null,
        country: address.country_code?.toUpperCase() ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Reverse geocoding unavailable: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
