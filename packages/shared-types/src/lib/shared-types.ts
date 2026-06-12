import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────

export const Category = {
  WATER_OUTAGE: 'WATER_OUTAGE',
  STREET_LEAK: 'STREET_LEAK',
  SERVICE_LINE_LEAK: 'SERVICE_LINE_LEAK',
  SEWAGE: 'SEWAGE',
  LOW_PRESSURE: 'LOW_PRESSURE',
  OTHER: 'OTHER',
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const Status = {
  OPEN: 'OPEN',
  IN_TRIAGE: 'IN_TRIAGE',
  TEAM_ASSIGNED: 'TEAM_ASSIGNED',
  IN_FIELD: 'IN_FIELD',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const AdminRole = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ServiceAreaLevel = {
  CITY: 'CITY',
  STATE: 'STATE',
  COUNTRY: 'COUNTRY',
} as const;
export type ServiceAreaLevel =
  (typeof ServiceAreaLevel)[keyof typeof ServiceAreaLevel];

// ─── Domain interfaces ────────────────────────────────────────────────────

/**
 * Which localities a tenant accepts service requests from.
 * CITY restricts to specific cities, STATE to whole states, COUNTRY to
 * whole countries. A tenant without a service area is unrestricted.
 */
export interface ServiceArea {
  level: ServiceAreaLevel;
  values: string[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  serviceArea: ServiceArea | null;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  tenantId: string;
  protocol: string;
  category: Category;
  description: string;
  status: Status;
  latitude: number;
  longitude: number;
  addressText: string | null;
  /** Locality resolved by reverse geocoding at creation time. */
  city: string | null;
  state: string | null;
  country: string | null;
  reporterName: string;
  reporterPhone: string;
  createdAt: string;
  updatedAt: string;
}

export const MediaType = {
  PHOTO: 'PHOTO',
  VIDEO: 'VIDEO',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

/** Media limits (C9) — enforced on the client AND re-validated by the API. */
export const MEDIA_LIMITS = {
  PHOTO_MAX_BYTES: 5 * 1024 * 1024,
  VIDEO_MAX_BYTES: 25 * 1024 * 1024,
  VIDEO_MAX_SECONDS: 10,
  MAX_PER_SERVICE_REQUEST: 3,
} as const;

export interface Media {
  id: string;
  tenantId: string;
  serviceRequestId: string;
  type: MediaType;
  /** Private bucket path — content is served via short-lived signed URLs. */
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  createdAt: string;
}

export interface StatusEvent {
  id: string;
  tenantId: string;
  serviceRequestId: string;
  previousStatus: Status | null;
  newStatus: Status;
  comment: string | null;
  author: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  tenantId: string;
  clerkUserId: string;
  role: AdminRole;
  createdAt: string;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────

export const categorySchema = z.nativeEnum(Category);
export const statusSchema = z.nativeEnum(Status);
export const serviceAreaLevelSchema = z.nativeEnum(ServiceAreaLevel);

export const serviceAreaSchema = z.object({
  level: serviceAreaLevelSchema,
  values: z.array(z.string().trim().min(1)).min(1),
});
export type ServiceAreaInput = z.infer<typeof serviceAreaSchema>;

export const createServiceRequestSchema = z.object({
  category: categorySchema,
  description: z.string().min(10).max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  addressText: z.string().max(500).nullish(),
  reporterName: z.string().min(2).max(120),
  reporterPhone: z
    .string()
    .regex(/^\+?\d{10,15}$/, 'Invalid phone number (use area code + number)'),
});
export type CreateServiceRequestInput = z.infer<
  typeof createServiceRequestSchema
>;

export const updateStatusSchema = z.object({
  newStatus: statusSchema,
  comment: z.string().max(1000).nullish(),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const protocolLookupSchema = z.object({
  protocol: z.string().min(8).max(32),
});
export type ProtocolLookupInput = z.infer<typeof protocolLookupSchema>;

/** Locality resolved from coordinates by the reverse geocoder. */
export interface ResolvedLocality {
  city: string | null;
  state: string | null;
  country: string | null;
}

// ─── Public payloads (tracking route — minimal payload, no PII) ───────────

export interface PublicTimelineEvent {
  previousStatus: Status | null;
  newStatus: Status;
  createdAt: string;
}

export interface PublicServiceRequest {
  protocol: string;
  category: Category;
  status: Status;
  createdAt: string;
  timeline: PublicTimelineEvent[];
}
