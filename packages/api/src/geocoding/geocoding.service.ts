import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForwardGeocodeResult, ResolvedLocality } from '@org/shared-types';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
  country_code?: string;
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name?: string;
  address?: NominatimAddress;
}

const REQUEST_TIMEOUT_MS = 5000;
// Nominatim usage policy requires an identifying User-Agent.
const USER_AGENT = 'conduit-platform/0.1 (service request geocoding)';

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
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Reverse geocoding failed with HTTP ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as { address?: NominatimAddress };
      if (!body.address) {
        return null;
      }
      return this.extractLocality(body.address);
    } catch (error) {
      this.logger.warn(
        `Reverse geocoding unavailable: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Resolves a free-text address into coordinates + normalized address +
   * locality (Nominatim /search). Powers the citizen's manual-address path
   * (F4) via the public geocode endpoint (B10).
   *
   * Unlike reverseGeocode, the three outcomes are kept distinct:
   *  - a match → ForwardGeocodeResult
   *  - the provider answered but found nothing → `null` (address does not exist)
   *  - the provider is unreachable/timed out/errored → throws (transient)
   * so the caller can tell "invalid address" (422) from "try again" (503)
   * instead of treating an outage as a non-existent address.
   *
   * The address is citizen location data: it is never logged (LGPD).
   */
  async forwardGeocode(address: string): Promise<ForwardGeocodeResult | null> {
    const url = new URL('/search', this.baseUrl);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'pt-BR');

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      this.logger.warn(`Forward geocoding failed with HTTP ${response.status}`);
      throw new Error(`Forward geocoding failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as NominatimSearchResult[];
    const match = Array.isArray(body) ? body[0] : undefined;
    if (!match) {
      return null; // address does not exist
    }

    const latitude = Number.parseFloat(match.lat);
    const longitude = Number.parseFloat(match.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
      address: match.display_name ?? address,
      locality: this.extractLocality(match.address ?? {}),
    };
  }

  /** Maps a Nominatim address block to our locality shape. */
  private extractLocality(address: NominatimAddress): ResolvedLocality {
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
  }
}
