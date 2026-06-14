import { Category, Status } from '@org/shared-types';
import {
  newRequestAdminMessage,
  statusChangedCitizenMessage,
} from './notification-messages';

describe('notification messages', () => {
  it('builds an admin alert with protocol, category and city', () => {
    const text = newRequestAdminMessage({
      protocol: 'ABCDEFGH2345',
      category: Category.STREET_LEAK,
      city: 'Campinas',
    });
    expect(text).toContain('ABCDEFGH2345');
    expect(text).toContain('Vazamento na via');
    expect(text).toContain('Campinas');
  });

  it('omits the location when the city is unknown', () => {
    const text = newRequestAdminMessage({
      protocol: 'ABCDEFGH2345',
      category: Category.OTHER,
      city: null,
    });
    expect(text).not.toContain('em null');
  });

  it('builds a citizen update with the tracking link when available', () => {
    const text = statusChangedCitizenMessage({
      protocol: 'ABCDEFGH2345',
      newStatus: Status.IN_TRIAGE,
      trackingUrl: 'https://track.example/ABCDEFGH2345',
    });
    expect(text).toContain('Em triagem');
    expect(text).toContain('https://track.example/ABCDEFGH2345');
  });

  it('falls back to the protocol when there is no tracking URL', () => {
    const text = statusChangedCitizenMessage({
      protocol: 'ABCDEFGH2345',
      newStatus: Status.RESOLVED,
      trackingUrl: null,
    });
    expect(text).toContain('Resolvido');
    expect(text).toContain('ABCDEFGH2345');
  });
});
