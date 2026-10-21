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
  check,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Drizzle schema matching Supabase migrations
 * Based on backend-contract-v0.4.md
 */

// Enums
export const eventStatusEnum = pgEnum('event_status', ['active', 'archived', 'deleted']);
export const contributionStatusEnum = pgEnum('contribution_status', ['published', 'trashed', 'purged']);
export const trashReasonEnum = pgEnum('trash_reason', ['owner', 'event_deleted']);
export const memberRoleEnum = pgEnum('member_role', ['member', 'admin']);

// Account table
export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  authId: text('auth_id').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Family table
export const family = pgTable('family', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => account.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Family member table
export const familyMember = pgTable(
  'family_member',
  {
    familyId: uuid('family_id').notNull().references(() => family.id),
    accountId: uuid('account_id').notNull().references(() => account.id),
    role: memberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.familyId, table.accountId] }),
    activeIdx: index('idx_family_member_active').on(table.familyId, table.accountId),
  })
);

// Person table
export const person = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().references(() => family.id),
  displayName: text('display_name').notNull(),
  birthDate: date('birth_date'),
  deathDate: date('death_date'),
  accountId: uuid('account_id').unique().references(() => account.id),
});

// Relationship table
export const relationship = pgTable(
  'relationship',
  {
    familyId: uuid('family_id').notNull().references(() => family.id),
    fromPersonId: uuid('from_person_id').notNull().references(() => person.id),
    toPersonId: uuid('to_person_id').notNull().references(() => person.id),
    type: text('type').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fromPersonId, table.toPersonId, table.type] }),
  })
);

// Event table
export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    creatorAccountId: uuid('creator_account_id').notNull().references(() => account.id),
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

// Event person junction table
export const eventPerson = pgTable(
  'event_person',
  {
    eventId: uuid('event_id').notNull().references(() => event.id),
    personId: uuid('person_id').notNull().references(() => person.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.personId] }),
  })
);

// Contribution table
export const contribution: ReturnType<typeof pgTable> = pgTable(
  'contribution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    ownerAccountId: uuid('owner_account_id').notNull().references(() => account.id),
    narratorPersonId: uuid('narrator_person_id').references(() => person.id),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'set null' }),
    originEventId: uuid('origin_event_id').notNull().references(() => event.id),
    originEventTitleSnapshot: text('origin_event_title_snapshot'),
    story: text('story'),
    status: contributionStatusEnum('status').notNull().default('published'),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    trashReason: trashReasonEnum('trash_reason'),
    derivedFromContributionId: uuid('derived_from_contribution_id').references((): any => contribution, {
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

// Blob table
export const blob = pgTable(
  'blob',
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

// Media table
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contributionId: uuid('contribution_id').notNull().references(() => contribution.id),
    blobId: uuid('blob_id').notNull().references(() => blob.id),
    blurredBlobId: uuid('blurred_blob_id').references(() => blob.id),
    takenByPersonId: uuid('taken_by_person_id').references(() => person.id),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => ({
    contributionIdx: index('idx_media_contribution').on(table.contributionId),
  })
);

// Contribution revision table
export const contributionRevision = pgTable(
  'contribution_revision',
  {
    contributionId: uuid('contribution_id').notNull().references(() => contribution.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    story: text('story').notNull(),
    editedBy: uuid('edited_by').notNull().references(() => account.id),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contributionId, table.version] }),
  })
);

// Audit log table
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => account.id),
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

// Notification table
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull().references(() => account.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => ({
    accountUnreadIdx: index('idx_notification_account_unread').on(table.accountId, table.createdAt),
  })
);

// Idempotency key table
export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    accountId: uuid('account_id').notNull().references(() => account.id),
    key: text('key').notNull(),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.key] }),
  })
);
