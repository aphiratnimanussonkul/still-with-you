import { z } from 'zod';

/**
 * Shared Zod schemas for API contracts
 * Based on backend-contract-v0.9.md
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

export const acceptInviteSchema = z.object({}).strict();

export const invitePreviewResponseSchema = z.object({
  family_name: z.string(),
  inviter_display_name: z.string(),
  person_display_name: z.string().nullable(),
  expires_at: z.string().datetime(),
});

export const acceptInviteResponseSchema = z.object({
  family_id: uuidSchema,
  person_id: uuidSchema.nullable(),
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
export const mediaPurposeSchema = z.enum(['story', 'avatar']);

export const createMediaUploadSchema = z.object({
  content_type: z.string(),
  size_bytes: z.number().int().positive(),
  purpose: mediaPurposeSchema.optional(),
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
  url_expires_at: z.string().datetime().nullable().optional(),
  thumb_url: z.string().url().nullable().optional(),
  thumb_url_expires_at: z.string().datetime().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  full_url: z.string().url().nullable().optional(),
  full_url_expires_at: z.string().datetime().nullable().optional(),
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
  /** Optional for now. Required in a later PR. When sent, PATCH is compare-and-swap on events.version. */
  version: z.number().int().optional(),
});

/** 409 EVENT_EDIT_CONFLICT `error.details`. Integer on the row only; no editor name. */
export const eventEditConflictDetailsSchema = z.object({
  current_version: z.number().int(),
});

export const eventEditConflictErrorSchema = z.object({
  error: z.object({
    code: z.literal('EVENT_EDIT_CONFLICT'),
    message: z.string(),
    details: eventEditConflictDetailsSchema,
  }),
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
  paused: z.boolean(),
  cover_url: z.string().url().nullable(),
  cover_url_expires_at: z.string().datetime().nullable(),
  cover_placeholder: z.string().nullable(),
  full_url: z.string().url().nullable(),
  full_url_expires_at: z.string().datetime().nullable(),
  media: z.array(mediaItemSchema).optional(),
});

export const eventListResponseSchema = z.object({
  events: z.array(eventResponseSchema),
  next_cursor: z.string().nullable().optional(),
});

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const MEDIA_MAX_BYTES_DEFAULT = 20 * 1024 * 1024;
export const MEDIA_MAX_PER_CONTRIBUTION_DEFAULT = 20;
export const MEDIA_UPLOAD_TTL_SECONDS = 10 * 60;
/** Signed read TTL for story `media[].url` / `thumb_url` / `full_url`. */
export const MEDIA_READ_TTL_SECONDS = 5 * 60;
/**
 * Signed read TTL for `avatar_url`, `cover_url`, and avatar/cover `full_url` (~1 hour).
 * Story media (including story `full_url`) stays on `MEDIA_READ_TTL_SECONDS`.
 */
export const MEDIA_AVATAR_COVER_TTL_SECONDS = 60 * 60;
export const MEDIA_ORPHAN_TTL_HOURS = 24;

/** Worker-generated avatar thumbnail (cover-crop). Served as `avatar_url`. */
export const AVATAR_VARIANT = { width: 300, height: 300, fit: 'cover' as const };
/** Home / member-card `cover_url` (256×256 cover; replaces the old 128 transform). */
export const COVER_CARD_VARIANT = { width: 256, height: 256, fit: 'cover' as const };
/** Event / memory-detail `cover_url`. */
export const COVER_DETAIL_VARIANT = { width: 684, height: 400, fit: 'cover' as const };
/** Long-edge cap for the `full` variant. */
export const FULL_MAX_LONG_EDGE = 2048;
/** Target long edge for the inlined WebP placeholder. */
export const PLACEHOLDER_LONG_EDGE = 20;
/** Max WebP payload size for `media.placeholder_webp` (before base64). */
export const PLACEHOLDER_MAX_BYTES = 1024;

export const MEDIA_VARIANT_KINDS = ['avatar', 'cover_card', 'cover_detail', 'full'] as const;
export type MediaVariantKind = (typeof MEDIA_VARIANT_KINDS)[number];

export const mediaStatusSchema = z.enum(['pending', 'uploaded', 'ready', 'failed']);

export const storyMediaItemSchema = z.object({
  id: uuidSchema,
  status: mediaStatusSchema,
  url: z.string().url().nullable(),
  url_expires_at: z.string().datetime().nullable(),
  thumb_url: z.string().url().nullable(),
  thumb_url_expires_at: z.string().datetime().nullable(),
  full_url: z.string().url().nullable(),
  full_url_expires_at: z.string().datetime().nullable(),
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
  author_id: uuidSchema,
  is_mine: z.boolean(),
  owner_display_name: z.string().optional(),
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

export const contributionListResponseSchema = z.object({
  contributions: z.array(contributionResponseSchema),
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

/** Deployed GET /v1/me/trash — matches apps/web family-graph + MSW. */
export const meTrashItemSchema = z.object({
  id: uuidSchema,
  story: z.string().nullable(),
  origin_event_title: z.string().nullable(),
  family_name: z.string(),
  family_id: uuidSchema,
  trashed_at: z.string().datetime(),
});

export const meTrashListResponseSchema = z.object({
  items: z.array(meTrashItemSchema),
});

// Notification schemas
export const notificationTypeSchema = z.enum(['contribution_added', 'invite_accepted']);

export const contributionAddedPayloadSchema = z.object({
  actor_display_name: z.string(),
  event_title: z.string().nullable(),
  event_id: uuidSchema,
  family_id: uuidSchema,
});

export const inviteAcceptedPayloadSchema = z.object({
  actor_display_name: z.string(),
  family_name: z.string(),
  family_id: uuidSchema,
  person_id: uuidSchema.nullable(),
  person_display_name: z.string().nullable(),
});

export const notificationPayloadSchema = z.union([
  contributionAddedPayloadSchema,
  inviteAcceptedPayloadSchema,
]);

export const notificationIdParamSchema = z.object({
  id: uuidSchema,
});

export const notificationResponseSchema = z.object({
  id: uuidSchema,
  type: notificationTypeSchema,
  payload: notificationPayloadSchema,
  created_at: z.string().datetime(),
  read_at: z.string().datetime().nullable(),
});

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationResponseSchema),
  next_cursor: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
});

export const FOCUS_MAX_PER_FAMILY = 10;
export const QUESTION_SKIP_DAYS = 30;
export const HOME_RECENT_MEMORIES_LIMIT = 5;

export const updateFocusSchema = z.object({
  person_ids: z.array(uuidSchema),
});

export const personGenderSchema = z.enum(['female', 'male', 'other']);
export const birthDatePrecisionSchema = z.enum(['day', 'year']);
export const deathDatePrecisionSchema = z.enum(['day', 'year']);
export const relationshipTypeSchema = z.enum(['parent', 'spouse']);
// Web family-tree v2 (PR #28) rebases on these exact field names.
export const personRelationshipKindSchema = z.enum(['parent_of', 'child_of', 'spouse_of']);
export const personInviteStatusSchema = z.enum(['none', 'pending', 'linked']);

const optionalNameSchema = z.string().optional();
const optionalNullableString = z.string().trim().nullable().optional();
const birthDateInputSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}-\d{2})?$/, 'birth_date must be YYYY or YYYY-MM-DD')
  .nullable()
  .optional();

export const inlineRelationshipSchema = z.object({
  kind: personRelationshipKindSchema,
  person_id: uuidSchema,
});

export const createPersonSchema = z.object({
  display_name: optionalNameSchema,
  name: optionalNameSchema,
  family_name: optionalNullableString,
  relation_label: z.string().trim().min(1).nullable().optional(),
  gender: personGenderSchema.nullable().optional(),
  birth_date: birthDateInputSchema,
  birth_date_precision: birthDatePrecisionSchema.optional(),
  is_living: z.boolean().optional(),
  death_date: birthDateInputSchema,
  death_date_precision: deathDatePrecisionSchema.nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  avatar_media_id: uuidSchema.nullable().optional(),
  relationship: inlineRelationshipSchema.optional(),
});

export const updatePersonSchema = z.object({
  display_name: optionalNameSchema,
  name: optionalNameSchema,
  family_name: optionalNullableString,
  relation_label: z.string().trim().min(1).nullable().optional(),
  gender: personGenderSchema.nullable().optional(),
  birth_date: birthDateInputSchema,
  birth_date_precision: birthDatePrecisionSchema.optional(),
  is_living: z.boolean().optional(),
  death_date: birthDateInputSchema,
  death_date_precision: deathDatePrecisionSchema.nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  avatar_media_id: uuidSchema.nullable().optional(),
});

export const createRelationshipSchema = z.object({
  person_id: uuidSchema,
  related_person_id: uuidSchema,
  type: relationshipTypeSchema,
});

export const personResponseSchema = z.object({
  id: uuidSchema,
  family_id: uuidSchema,
  display_name: z.string(),
  name: z.string(),
  family_name: z.string().nullable().optional(),
  relation_label: z.string().nullable().optional(),
  gender: personGenderSchema.nullable().optional(),
  birth_date: z.string().nullable().optional(),
  birth_date_precision: birthDatePrecisionSchema.optional(),
  is_living: z.boolean(),
  death_date: z.string().nullable(),
  death_date_precision: deathDatePrecisionSchema.nullable(),
  age: z.number().int().nullable().optional(),
  bio: z.string().nullable().optional(),
  avatar_media_id: uuidSchema.nullable().optional(),
  avatar_url: z.string().url().nullable(),
  avatar_url_expires_at: z.string().datetime().nullable(),
  avatar_placeholder: z.string().nullable(),
  full_url: z.string().url().nullable(),
  full_url_expires_at: z.string().datetime().nullable(),
  memory_count: z.number().int(),
  account_id: uuidSchema.nullable().optional(),
  invite_status: personInviteStatusSchema.optional(),
  created_by_account_id: uuidSchema.optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});

export const relationshipResponseSchema = z.object({
  id: uuidSchema,
  family_id: uuidSchema,
  person_id: uuidSchema,
  related_person_id: uuidSchema,
  type: relationshipTypeSchema,
  created_by_account_id: uuidSchema,
  created_at: z.string().datetime(),
});

export const personListResponseSchema = z.object({
  people: z.array(personResponseSchema),
  relationships: z.array(relationshipResponseSchema).optional(),
});

export const createPersonResponseSchema = z.object({
  person: personResponseSchema,
  relationship: relationshipResponseSchema.nullable(),
});

export const createFactSchema = z.object({
  question_id: uuidSchema,
  answer_text: z.string().optional(),
});

export const skipFactSchema = z.object({
  question_id: uuidSchema,
});

export const updateFactSchema = z.object({
  answer_text: z.string().optional(),
});

export const focusPersonSchema = z.object({
  id: uuidSchema,
  display_name: z.string(),
  name: z.string(),
});

export const focusItemSchema = z.object({
  person: focusPersonSchema,
  photo_url: z.string().url().nullable(),
  photo_url_expires_at: z.string().datetime().nullable(),
  avatar_url: z.string().url().nullable(),
  avatar_url_expires_at: z.string().datetime().nullable(),
  avatar_placeholder: z.string().nullable(),
  full_url: z.string().url().nullable(),
  full_url_expires_at: z.string().datetime().nullable(),
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
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Export type helpers
export type UpdateConsent = z.infer<typeof updateConsentSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type CreateFamily = z.infer<typeof createFamilySchema>;
export type InviteMember = z.infer<typeof inviteMemberSchema>;
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;
export type FamilyResponse = z.infer<typeof familyResponseSchema>;
export type FamilyListResponse = z.infer<typeof familyListResponseSchema>;
export type FamilyMemberResponse = z.infer<typeof familyMemberResponseSchema>;
export type CreateEvent = z.input<typeof createEventSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type EventEditConflictDetails = z.infer<typeof eventEditConflictDetailsSchema>;
export type EventEditConflictError = z.infer<typeof eventEditConflictErrorSchema>;
export type DeleteEvent = z.infer<typeof deleteEventSchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type CreateContribution = z.input<typeof createContributionSchema>;
export type UpdateContribution = z.infer<typeof updateContributionSchema>;
export type ContributionResponse = z.infer<typeof contributionResponseSchema>;
export type ContributionListResponse = z.infer<typeof contributionListResponseSchema>;
export type CreatePerson = z.infer<typeof createPersonSchema>;
export type UpdatePerson = z.infer<typeof updatePersonSchema>;
export type CreateRelationship = z.infer<typeof createRelationshipSchema>;
export type PersonResponse = z.infer<typeof personResponseSchema>;
export type RelationshipResponse = z.infer<typeof relationshipResponseSchema>;
export type PersonListResponse = z.infer<typeof personListResponseSchema>;
export type CreatePersonResponse = z.infer<typeof createPersonResponseSchema>;
export type InlineRelationship = z.infer<typeof inlineRelationshipSchema>;
export type PersonRelationshipKind = z.infer<typeof personRelationshipKindSchema>;
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
export type MeTrashItem = z.infer<typeof meTrashItemSchema>;
export type MeTrashListResponse = z.infer<typeof meTrashListResponseSchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationTypeName = z.infer<typeof notificationTypeSchema>;
export type ContributionAddedPayload = z.infer<typeof contributionAddedPayloadSchema>;
export type InviteAcceptedPayload = z.infer<typeof inviteAcceptedPayloadSchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
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
