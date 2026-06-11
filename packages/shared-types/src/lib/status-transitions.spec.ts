import { Status } from './shared-types.js';
import { ALLOWED_TRANSITIONS, canTransition } from './status-transitions.js';

describe('status transitions', () => {
  it('allows the happy path end to end', () => {
    expect(canTransition(Status.OPEN, Status.IN_TRIAGE)).toBe(true);
    expect(canTransition(Status.IN_TRIAGE, Status.TEAM_ASSIGNED)).toBe(true);
    expect(canTransition(Status.TEAM_ASSIGNED, Status.IN_FIELD)).toBe(true);
    expect(canTransition(Status.IN_FIELD, Status.RESOLVED)).toBe(true);
    expect(canTransition(Status.RESOLVED, Status.CLOSED)).toBe(true);
  });

  it('allows reopening from RESOLVED and CLOSED', () => {
    expect(canTransition(Status.RESOLVED, Status.REOPENED)).toBe(true);
    expect(canTransition(Status.CLOSED, Status.REOPENED)).toBe(true);
    expect(canTransition(Status.REOPENED, Status.IN_TRIAGE)).toBe(true);
  });

  it('rejects skipping stages and going backwards', () => {
    expect(canTransition(Status.OPEN, Status.RESOLVED)).toBe(false);
    expect(canTransition(Status.OPEN, Status.CLOSED)).toBe(false);
    expect(canTransition(Status.IN_FIELD, Status.OPEN)).toBe(false);
    expect(canTransition(Status.CLOSED, Status.IN_FIELD)).toBe(false);
    expect(canTransition(Status.OPEN, Status.REOPENED)).toBe(false);
  });

  it('covers every status in the transition map', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(
      Object.values(Status).sort(),
    );
  });
});
