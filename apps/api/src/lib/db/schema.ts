import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  date,
  integer,
  bigserial,
  jsonb,
  bigint,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle schema matching Supabase migrations
 * Based on backend-contract-v0.9.md
 */

// Enums
export const eventStatusEnum = pgEnum('event_status', ['active', 'archived', 'deleted']);
export const contributionStatusEnum = pgEnum('contribution_status', ['published', 'trashed', 'purged']);
export const trashReasonEnum = pgEnum('trash_reason', ['owner', 'event_deleted']);
export const mediaStatusEnum = pgEnum('media_status', ['pending', 'uploaded', 'ready', 'failed']);
// admin = family steward (no separate table)
export const memberRoleEnum = pgEnum('member_role', ['member', 'admin']);
export const questionAnswerTypeEnum = pgEnum('question_answer_type', ['text', 'choice']);
export const personGenderEnum = pgEnum('person_gender', ['female', 'male', 'other']);
export const birthDatePrecisionEnum = pgEnum('birth_date_precision', ['day', 'year']);
export const relationshipTypeEnum = pgEnum('relationship_type', ['parent', 'spouse']);
export const mediaPurposeEnum = pgEnum('media_purpose', ['story', 'avatar']);
export const mediaVariantKindEnum = pgEnum('media_variant_kind', [
  'avatar',
  'cover_card',
  'cover_detail',
  'full',
]);

// Accounts table
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authId: text('auth_id').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
  consentAnsweredAt: timestamp('consent_answered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Families table
export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Family members table
export const familyMembers = pgTable(
  'family_members',
  {
    familyId: uuid('family_id').notNull().references(() => families.id),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    role: memberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.familyId, table.accountId] }),
    activeIdx: index('idx_family_member_active').on(table.familyId, table.accountId),
  })
);

// People table
export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    displayName: text('display_name').notNull(),
    familyName: text('family_name'),
    relationLabel: text('relation_label'),
    gender: personGenderEnum('gender'),
    birthDate: date('birth_date'),
    birthDatePrecision: birthDatePrecisionEnum('birth_date_precision').notNull().default('day'),
    isLiving: boolean('is_living').notNull().default(true),
    deathDate: date('death_date'),
    deathDatePrecision: text('death_date_precision'),
    bio: text('bio'),
    avatarMediaId: uuid('avatar_media_id'),
    accountId: uuid('account_id').references(() => accounts.id),
    createdByAccountId: uuid('created_by_account_id').notNull().references(() => accounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    idFamilyKey: uniqueIndex('people_id_family_id_key').on(table.id, table.familyId),
    familyAccountLive: uniqueIndex('people_family_account_live')
      .on(table.familyId, table.accountId)
      .where(sql`account_id is not null and deleted_at is null`),
  })
);

// Stored parent/spouse edges. Composite FKs keep both people in the same family.
export const personRelationships = pgTable(
  'person_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    personId: uuid('person_id').notNull(),
    relatedPersonId: uuid('related_person_id').notNull(),
    type: relationshipTypeEnum('type').notNull(),
    createdByAccountId: uuid('created_by_account_id').notNull().references(() => accounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePair: unique().on(table.personId, table.relatedPersonId, table.type),
    personFamilyFk: foreignKey({
      columns: [table.personId, table.familyId],
      foreignColumns: [people.id, people.familyId],
      name: 'person_relationships_person_family_fkey',
    }),
    relatedFamilyFk: foreignKey({
      columns: [table.relatedPersonId, table.familyId],
      foreignColumns: [people.id, people.familyId],
      name: 'person_relationships_related_family_fkey',
    }),
    familyIdx: index('idx_person_relationships_family').on(table.familyId),
  })
);

// Events table
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    creatorAccountId: uuid('creator_account_id').notNull().references(() => accounts.id),
    title: text('title'),
    description: text('description'),
    occurredFrom: date('occurred_from'),
    occurredTo: date('occurred_to'),
    datePrecision: text('date_precision'),
    location: text('location'),
    status: eventStatusEnum('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    familyStatusIdx: index('idx_event_family_status').on(table.familyId, table.status),
    creatorIdx: index('idx_event_creator').on(table.creatorAccountId),
  })
);

// Event people junction table
export const eventPeople = pgTable(
  'event_people',
  {
    eventId: uuid('event_id').notNull().references(() => events.id),
    personId: uuid('person_id').notNull().references(() => people.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.personId] }),
  })
);

// Contributions table
export const contributions: ReturnType<typeof pgTable> = pgTable(
  'contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    ownerAccountId: uuid('owner_account_id').notNull().references(() => accounts.id),
    narratorPersonId: uuid('narrator_person_id').references(() => people.id),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    originEventId: uuid('origin_event_id').notNull().references(() => events.id),
    originEventTitleSnapshot: text('origin_event_title_snapshot'),
    story: text('story'),
    status: contributionStatusEnum('status').notNull().default('published'),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    trashReason: trashReasonEnum('trash_reason'),
    derivedFromContributionId: uuid('derived_from_contribution_id').references((): any => contributions, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerStatusIdx: index('idx_contribution_owner_status').on(table.ownerAccountId, table.status),
    eventIdx: index('idx_contribution_event').on(table.eventId),
    originEventIdx: index('idx_contribution_origin_event').on(table.originEventId),
  })
);

// Blobs table
export const blobs = pgTable(
  'blobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageKey: text('storage_key').notNull().unique(),
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    refCount: integer('ref_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    refCountZeroIdx: index('idx_blob_ref_count_zero').on(table.id),
  })
);

// Media table — signed-URL uploads (v0.5). story_id = contributions.id
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    uploaderAccountId: uuid('uploader_account_id').notNull().references(() => accounts.id),
    storyId: uuid('story_id').references(() => contributions.id, { onDelete: 'set null' }),
    personId: uuid('person_id').references(() => people.id),
    purpose: mediaPurposeEnum('purpose').notNull().default('story'),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    thumbKey: text('thumb_key'),
    placeholderWebp: text('placeholder_webp'),
    status: mediaStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    familyIdx: index('idx_media_family').on(table.familyId),
    storyIdx: index('idx_media_story').on(table.storyId),
    uploaderIdx: index('idx_media_uploader').on(table.uploaderAccountId),
    avatarLive: uniqueIndex('media_person_avatar_live')
      .on(table.personId)
      .where(sql`purpose = 'avatar' and deleted_at is null and person_id is not null`),
  })
);

export const mediaVariants = pgTable(
  'media_variants',
  {
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    kind: mediaVariantKindEnum('kind').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.mediaId, table.kind] }),
    mediaIdx: index('idx_media_variants_media').on(table.mediaId),
  })
);

// Contribution revisions table
export const contributionRevisions = pgTable(
  'contribution_revisions',
  {
    contributionId: uuid('contribution_id').notNull().references(() => contributions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    story: text('story').notNull(),
    editedBy: uuid('edited_by').notNull().references(() => accounts.id),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contributionId, table.version] }),
  })
);

// Audit log table (singular per spec)
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index('idx_audit_log_actor').on(table.actorAccountId),
    targetIdx: index('idx_audit_log_target').on(table.targetType, table.targetId),
  })
);

// Outbox table
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => ({
    unsentIdx: index('idx_outbox_unsent').on(table.createdAt),
  })
);

// Notifications table
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => ({
    accountUnreadIdx: index('idx_notification_account_unread').on(table.accountId, table.createdAt),
  })
);

// Idempotency keys table
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    key: text('key').notNull(),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.key] }),
  })
);

// Invites table
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id),
    email: text('email').notNull(),
    role: memberRoleEnum('role').notNull().default('member'),
    invitedBy: uuid('invited_by').notNull().references(() => accounts.id),
    personId: uuid('person_id').references(() => people.id),
    status: text('status').notNull().default('pending'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => ({
    emailStatusIdx: index('idx_invites_email_status').on(table.email, table.status),
    familyIdx: index('idx_invites_family').on(table.familyId),
    tokenIdx: index('idx_invites_token').on(table.tokenHash),
    personPending: uniqueIndex('invites_person_pending')
      .on(table.personId)
      .where(sql`person_id is not null and status = 'pending'`),
  })
);

// Per-account home focus people (max 10 per account per family, enforced in API)
export const focusPeople = pgTable(
  'focus_people',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.familyId, table.personId] }),
    accountFamilyIdx: index('idx_focus_people_account_family').on(
      table.accountId,
      table.familyId,
      table.position
    ),
  })
);

export const questionBank = pgTable(
  'question_bank',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    textTh: text('text_th').notNull(),
    category: text('category').notNull(),
    answerType: questionAnswerTypeEnum('answer_type').notNull().default('text'),
    choices: jsonb('choices'),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull(),
  },
  (table) => ({
    activeSortIdx: index('idx_question_bank_active_sort').on(table.active, table.sort),
  })
);

export const personFacts = pgTable(
  'person_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => questionBank.id),
    authorAccountId: uuid('author_account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    answerText: text('answer_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    liveUnique: uniqueIndex('uq_person_facts_live')
      .on(table.personId, table.questionId, table.authorAccountId)
      .where(sql`deleted_at is null`),
    personIdx: index('idx_person_facts_person').on(table.personId),
  })
);

export const questionSkips = pgTable(
  'question_skips',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => questionBank.id),
    skippedAt: timestamp('skipped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.personId, table.questionId] }),
    lookupIdx: index('idx_question_skips_lookup').on(table.accountId, table.personId, table.skippedAt),
  })
);
