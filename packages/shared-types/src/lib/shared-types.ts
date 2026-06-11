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

// ─── Domain interfaces ────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
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
  reporterName: string;
  reporterPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: string;
  tenantId: string;
  serviceRequestId: string;
  storageUrl: string;
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
