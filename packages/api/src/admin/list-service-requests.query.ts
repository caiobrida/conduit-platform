import { z } from 'zod';
import { categorySchema, statusSchema } from '@org/shared-types';

/**
 * Sortable fields are whitelisted — never feed client input straight into
 * Prisma orderBy.
 */
export const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'status',
  'category',
  'city',
  'protocol',
] as const;

export const listServiceRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: statusSchema.optional(),
  category: categorySchema.optional(),
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(1).max(60).optional(),
  /** Free search across protocol, reporter name and reporter phone (C4). */
  search: z.string().trim().min(2).max(120).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});

export type ListServiceRequestsQuery = z.infer<
  typeof listServiceRequestsQuerySchema
>;
