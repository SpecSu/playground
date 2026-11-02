import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Room snapshots stay bounded: at most ten active seats and forty recent events.
export const nightclubRooms = sqliteTable('nightclub_rooms', {
  roomId: text('room_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  stateJson: text('state_json').notNull(),
  mutationId: text('mutation_id').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
});

// Only a SHA-256 digest of the unguessable HttpOnly device capability is stored.
export const nightclubSessions = sqliteTable('nightclub_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  actorId: text('actor_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [uniqueIndex('nightclub_session_actor').on(table.actorId)]);

// Past visitors do not occupy seats. Keeping their sequence separately lets
// cumulative asynchronous participation grow without increasing room payloads.
export const nightclubVisits = sqliteTable('nightclub_visits', {
  roomId: text('room_id').notNull(),
  actorId: text('actor_id').notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  moveSequence: integer('move_sequence').notNull().default(0),
  moveJson: text('move_json'),
  stateJson: text('state_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.actorId] })]);


// One bounded counter row per hashed network address; no raw IP is retained.
// The window resets in-place so normal return visitors have no lifetime limit.
export const nightclubAdmissionBuckets = sqliteTable('nightclub_admission_buckets', {
  bucketHash: text('bucket_hash').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  admissions: integer('admissions').notNull(),
});

// Independent yacht demo persistence; never shares original room capabilities.
// Room snapshots stay bounded: at most ten active seats and forty recent events.
export const fishingRooms = sqliteTable('fishing_rooms', {
  roomId: text('room_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  stateJson: text('state_json').notNull(),
  mutationId: text('mutation_id').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
});

// Only a SHA-256 digest of the unguessable HttpOnly device capability is stored.
export const fishingSessions = sqliteTable('fishing_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  actorId: text('actor_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [uniqueIndex('fishing_session_actor').on(table.actorId)]);

// Past visitors do not occupy seats. Keeping their sequence separately lets
// cumulative asynchronous participation grow without increasing room payloads.
export const fishingVisits = sqliteTable('fishing_visits', {
  roomId: text('room_id').notNull(),
  actorId: text('actor_id').notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  moveSequence: integer('move_sequence').notNull().default(0),
  moveJson: text('move_json'),
  stateJson: text('state_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.actorId] })]);


// One bounded counter row per hashed network address; no raw IP is retained.
// The window resets in-place so normal return visitors have no lifetime limit.
export const fishingAdmissionBuckets = sqliteTable('fishing_admission_buckets', {
  bucketHash: text('bucket_hash').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  admissions: integer('admissions').notNull(),
});
