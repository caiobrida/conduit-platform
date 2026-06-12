import { generateProtocol } from './protocol';

describe('generateProtocol', () => {
  it('produces 12 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateProtocol()).toMatch(
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/,
      );
    }
  });

  it('never contains ambiguous characters (0, O, 1, I, L)', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateProtocol()).not.toMatch(/[0O1IL]/);
    }
  });

  it('is statistically unique', () => {
    const seen = new Set(
      Array.from({ length: 10_000 }, () => generateProtocol()),
    );
    expect(seen.size).toBe(10_000);
  });
});
