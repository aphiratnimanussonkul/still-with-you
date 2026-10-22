import { z } from 'zod';

/**
 * Shared Zod schemas for API contracts
 * Based on backend-contract-v0.5.md
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
  // Null = not answered. Optional so older payloads still parse.
  consent_answered_at: z.string().datetime().nullable().optional(),
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

// Media upload session (frontend/MSW draft; backend still shipping)
export const createMediaUploadSchema = z.object({
  content_type: z.string(),
  size_bytes: z.number().int().positive(),
});

export const mediaUploadSessionSchema = z.object({
  media_id: uuidSchema,
  upload_url: z.string().url(),
  expires_at: z.string().datetime(),
  max_bytes: z.number().int().positive(),
  max_per_story: z.number().int().positive(),
});

export const mediaItemSchema = z.object({
  id: uuidSchema,
  status: z.enum(['reserved', 'uploaded', 'processing', 'ready', 'failed']),
  url: z.string().url().nullable().optional(),
  thumb_url: z.string().url().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
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
  media_ids: z.array(uuidSchema).default([]),
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
  media: z.array(mediaItemSchema).optional(),
});

export const eventListResponseSchema = z.object({
  events: z.array(eventResponseSchema),
});

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const MEDIA_MAX_BYTES_DEFAULT = 20 * 1024 * 1024;
export const MEDIA_MAX_PER_CONTRIBUTION_DEFAULT = 20;
export const MEDIA_UPLOAD_TTL_SECONDS = 10 * 60;
export const MEDIA_READ_TTL_SECONDS = 5 * 60;
export const MEDIA_ORPHAN_TTL_HOURS = 24;

export const mediaStatusSchema = z.enum(['pending', 'uploaded', 'ready', 'failed']);

export const storyMediaItemSchema = z.object({
  id: uuidSchema,
  status: mediaStatusSchema,
  url: z.string().url().nullable(),
  thumb_url: z.string().url().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  expires_at: z.string().datetime().nullable(),
});

// Contribution schemas
export const createContributionSchema = z.object({
  story: nonEmptyStringSchema,
  narrator_person_id: uuidSchema.optional(),
  media_ids: z.array(uuidSchema).default([]),
});

export const updateContributionSchema = z.object({
  story: nonEmptyStringSchema.optional(),
  media_ids: z.array(uuidSchema).optional(),
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
  media: z.array(storyMediaItemSchema).default([]),
});

export const createUploadSchema = createMediaUploadSchema;

export const mediaUploadResponseSchema = z.object({
  media_id: uuidSchema,
  upload_url: z.string().url(),
  expires_at: z.string().datetime(),
  max_bytes: z.number().int(),
  max_per_story: z.number().int(),
});

export const uploadResponseSchema = mediaUploadResponseSchema;

export const mediaResponseSchema = storyMediaItemSchema;

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

export const FOCUS_MAX_PER_FAMILY = 10;
export const QUESTION_SKIP_DAYS = 30;
export const HOME_RECENT_MEMORIES_LIMIT = 5;

export const updateFocusSchema = z.object({
  person_ids: z.array(uuidSchema),
});

export const createFactSchema = z.object({
  question_id: uuidSchema,
  answer_text: z.string(),
});

export const skipFactSchema = z.object({
  question_id: uuidSchema,
});

export const updateFactSchema = z.object({
  answer_text: z.string(),
});

export const focusPersonSchema = z.object({
  id: uuidSchema,
  display_name: z.string(),
});

export const focusItemSchema = z.object({
  person: focusPersonSchema,
  photo_url: z.string().url().nullable(),
  memory_count: z.number().int(),
  position: z.number().int(),
});

export const focusListResponseSchema = z.object({
  items: z.array(focusItemSchema),
});

export const quickQuestionSchema = z.object({
  question_id: uuidSchema,
  key: z.string(),
  person: focusPersonSchema,
  text: z.string(),
});

export const homeResponseSchema = z.object({
  focus: z.array(focusItemSchema),
  quick_question: quickQuestionSchema.nullable(),
  recent_memories: z.array(eventResponseSchema),
});

export const factResponseSchema = z.object({
  id: uuidSchema,
  family_id: uuidSchema,
  person_id: uuidSchema,
  question_id: uuidSchema,
  author_account_id: uuidSchema,
  answer_text: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const factAnswerItemSchema = z.object({
  id: uuidSchema,
  answer_text: z.string(),
  author: z.object({
    account_id: uuidSchema,
    display_name: z.string(),
  }),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

export const factGroupSchema = z.object({
  question: z.object({
    id: uuidSchema,
    key: z.string(),
    text: z.string(),
  }),
  answers: z.array(factAnswerItemSchema),
});

export const personFactsResponseSchema = z.object({
  groups: z.array(factGroupSchema),
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
export type CreateEvent = z.input<typeof createEventSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type DeleteEvent = z.infer<typeof deleteEventSchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type CreateContribution = z.input<typeof createContributionSchema>;
export type UpdateContribution = z.infer<typeof updateContributionSchema>;
export type ContributionResponse = z.infer<typeof contributionResponseSchema>;
export type CreateUpload = z.infer<typeof createUploadSchema>;
export type CreateMediaUpload = z.infer<typeof createMediaUploadSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type StoryMediaItem = z.infer<typeof storyMediaItemSchema>;
export type MediaUploadSession = z.infer<typeof mediaUploadSessionSchema>;
export type MediaItem = z.infer<typeof mediaItemSchema>;
export type MediaResponse = z.infer<typeof mediaResponseSchema>;
export type TrashItemResponse = z.infer<typeof trashItemResponseSchema>;
export type TrashResponse = z.infer<typeof trashResponseSchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type UpdateFocus = z.infer<typeof updateFocusSchema>;
export type CreateFact = z.infer<typeof createFactSchema>;
export type SkipFact = z.infer<typeof skipFactSchema>;
export type UpdateFact = z.infer<typeof updateFactSchema>;
export type FocusItem = z.infer<typeof focusItemSchema>;
export type FocusListResponse = z.infer<typeof focusListResponseSchema>;
export type QuickQuestion = z.infer<typeof quickQuestionSchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
export type FactResponse = z.infer<typeof factResponseSchema>;
export type PersonFactsResponse = z.infer<typeof personFactsResponseSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
