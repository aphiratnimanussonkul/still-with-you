import { z } from 'zod';

/**
 * Shared Zod schemas for API contracts
 * Based on backend-contract-v0.4.md
 */

// Base types
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();
export const nonEmptyStringSchema = z.string().trim().min(1);

// Enums
export const eventStatusSchema = z.enum(['active', 'archived', 'deleted']);
export const contributionStatusSchema = z.enum(['published', 'trashed', 'purged']);
export const memberRoleSchema = z.enum(['member', 'admin']);
export const trashReasonSchema = z.enum(['owner', 'event_deleted']);

// Account schemas
export const updateConsentSchema = z.object({
  marketing_consent: z.boolean(),
});

export const accountResponseSchema = z.object({
  id: uuidSchema,
  email: emailSchema.nullable(),
  display_name: z.string(),
  marketing_consent: z.boolean(),
  marketing_consent_at: z.string().datetime().nullable(),
  consent_answered_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

// Family schemas
export const createFamilySchema = z.object({
  name: nonEmptyStringSchema,
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
});

export const updateMemberRoleSchema = z.object({
  role: memberRoleSchema,
});

export const familyResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  created_by: uuidSchema,
  created_at: z.string().datetime(),
});

export const familyMemberResponseSchema = z.object({
  family_id: uuidSchema,
  account_id: uuidSchema,
  role: memberRoleSchema,
  joined_at: z.string().datetime(),
  left_at: z.string().datetime().nullable(),
});

export const familyListResponseSchema = z.object({
  families: z.array(familyResponseSchema),
});

// Event schemas
export const EVENT_DELETE_CONFIRM_TEXT = 'ลบเรื่องนี้';
export const EVENT_DELETE_COOLING_DAYS = 7;

export const createEventSchema = z.object({
  title: nonEmptyStringSchema,
  story: nonEmptyStringSchema,
  description: z.string().optional(),
  occurred_from: z.string().date().optional(),
  occurred_to: z.string().date().optional(),
  date_precision: z.string().optional(),
  location: z.string().optional(),
  person_ids: z.array(uuidSchema).default([]),
  source_contribution_ids: z.array(uuidSchema).optional(),
});

export const updateEventSchema = z.object({
  title: nonEmptyStringSchema.optional(),
  description: z.string().optional(),
  occurred_from: z.string().date().optional(),
  occurred_to: z.string().date().optional(),
  date_precision: z.string().optional(),
  location: z.string().optional(),
  person_ids: z.array(uuidSchema).optional(),
});

export const deleteEventSchema = z.object({
  confirm_text: nonEmptyStringSchema,
});

export const eventResponseSchema = z.object({
  id: uuidSchema,
  family_id: uuidSchema,
  creator_account_id: uuidSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  occurred_from: z.string().date().nullable(),
  occurred_to: z.string().date().nullable(),
  date_precision: z.string().nullable(),
  location: z.string().nullable(),
  status: eventStatusSchema,
  archived_at: z.string().datetime().nullable(),
  deletable_at: z.string().datetime().nullable(),
  deleted_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  version: z.number().int(),
});

export const eventListResponseSchema = z.object({
  events: z.array(eventResponseSchema),
});

// Contribution schemas
export const createContributionSchema = z.object({
  story: nonEmptyStringSchema,
  narrator_person_id: uuidSchema.optional(),
  media_upload_ids: z.array(uuidSchema).max(20).default([]),
});

export const updateContributionSchema = z.object({
  story: nonEmptyStringSchema.optional(),
  add_media_upload_ids: z.array(uuidSchema).optional(),
  remove_media_ids: z.array(uuidSchema).optional(),
  media_order: z.array(uuidSchema).optional(),
});

export const contributionResponseSchema = z.object({
  id: uuidSchema,
  family_id: uuidSchema,
  owner_account_id: uuidSchema,
  narrator_person_id: uuidSchema.nullable(),
  event_id: uuidSchema.nullable(),
  origin_event_id: uuidSchema,
  origin_event_title_snapshot: z.string().nullable(),
  story: z.string().nullable(),
  status: contributionStatusSchema,
  trashed_at: z.string().datetime().nullable(),
  trash_reason: trashReasonSchema.nullable(),
  derived_from_contribution_id: uuidSchema.nullable(),
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Upload schemas
export const createUploadSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  size_bytes: z.number().int().max(20 * 1024 * 1024), // 20MB
  sha256: z.string().length(64),
});

export const uploadResponseSchema = z.object({
  upload_id: uuidSchema,
  put_url: z.string().url(),
});

// Media schemas
export const mediaResponseSchema = z.object({
  id: uuidSchema,
  contribution_id: uuidSchema,
  blob_id: uuidSchema,
  url: z.string().url().optional(),
  taken_by_person_id: uuidSchema.nullable(),
  sort_order: z.number().int(),
});

// Trash schemas
export const trashItemResponseSchema = z.object({
  id: uuidSchema,
  origin_event: z.object({
    id: uuidSchema,
    title: z.string().nullable(),
    status: eventStatusSchema,
    creator_display_name: z.string(),
  }),
  trashed_at: z.string().datetime(),
  trash_reason: trashReasonSchema,
  photo_count: z.number().int(),
  content_visible: z.boolean(),
  story: z.string().nullable(),
  media: z.array(mediaResponseSchema),
  actions: z.object({
    restorable: z.boolean(),
    purgeable: z.boolean(),
    can_create_event: z.boolean(),
  }),
  reason: z.enum(['source_archived', 'source_deleted']).nullable(),
});

export const trashResponseSchema = z.object({
  items: z.array(trashItemResponseSchema),
  next_cursor: z.string().nullable(),
});

// Notification schemas
export const notificationResponseSchema = z.object({
  id: uuidSchema,
  account_id: uuidSchema,
  type: z.string(),
  payload: z.record(z.unknown()),
  created_at: z.string().datetime(),
  read_at: z.string().datetime().nullable(),
});

// Pagination
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Export type helpers
export type UpdateConsent = z.infer<typeof updateConsentSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type CreateFamily = z.infer<typeof createFamilySchema>;
export type InviteMember = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;
export type FamilyResponse = z.infer<typeof familyResponseSchema>;
export type FamilyListResponse = z.infer<typeof familyListResponseSchema>;
export type FamilyMemberResponse = z.infer<typeof familyMemberResponseSchema>;
export type CreateEvent = z.infer<typeof createEventSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type DeleteEvent = z.infer<typeof deleteEventSchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type CreateContribution = z.infer<typeof createContributionSchema>;
export type UpdateContribution = z.infer<typeof updateContributionSchema>;
export type ContributionResponse = z.infer<typeof contributionResponseSchema>;
export type CreateUpload = z.infer<typeof createUploadSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type MediaResponse = z.infer<typeof mediaResponseSchema>;
export type TrashItemResponse = z.infer<typeof trashItemResponseSchema>;
export type TrashResponse = z.infer<typeof trashResponseSchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
