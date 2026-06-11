import { Status } from './shared-types.js';

/**
 * Allowed status transitions of a service request (spec §4):
 * OPEN → IN_TRIAGE → TEAM_ASSIGNED → IN_FIELD → RESOLVED → CLOSED,
 * with reopening possible from RESOLVED/CLOSED back into triage.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> =
  {
    [Status.OPEN]: [Status.IN_TRIAGE],
    [Status.IN_TRIAGE]: [Status.TEAM_ASSIGNED],
    [Status.TEAM_ASSIGNED]: [Status.IN_FIELD],
    [Status.IN_FIELD]: [Status.RESOLVED],
    [Status.RESOLVED]: [Status.CLOSED, Status.REOPENED],
    [Status.CLOSED]: [Status.REOPENED],
    [Status.REOPENED]: [Status.IN_TRIAGE],
  };

export function canTransition(from: Status, to: Status): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
