import { pgTable, uuid, jsonb, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
export const schedules = pgTable('schedules', { id: uuid('id').primaryKey(), data: jsonb('data').notNull() });
export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(), email: text('email').notNull().unique(), name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(), role: text('role').notNull().default('consulta'),
  isPrimary: boolean('is_primary').notNull().default(false), version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true), mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), credentialHash: text('credential_hash').notNull(),
  userId: uuid('user_id').references(() => appUsers.id), reauthenticatedAt: timestamp('reauthenticated_at', { withTimezone: true }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});
export const scheduleAudit = pgTable('schedule_audit', {
  id: uuid('id').primaryKey().defaultRandom(), scheduleId: uuid('schedule_id').notNull(),
  actorId: uuid('actor_id').notNull().references(() => appUsers.id), actorEmail: text('actor_email').notNull(),
  beforeData: jsonb('before_data'), afterData: jsonb('after_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const userAudit = pgTable('user_audit', {
  id: uuid('id').primaryKey().defaultRandom(), actorId: uuid('actor_id').notNull().references(() => appUsers.id),
  targetId: uuid('target_id').notNull().references(() => appUsers.id), action: text('action').notNull(),
  beforeState: jsonb('before_state'), afterState: jsonb('after_state').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const schoolRecords = pgTable('school_records', {
 id: text('id').primaryKey(), kind: text('kind').notNull(), data: jsonb('data').notNull(), version: integer('version').notNull().default(1),
 deleted: boolean('deleted').notNull().default(false), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
});
export const recordAudit = pgTable('record_audit', {
 id: uuid('id').primaryKey().defaultRandom(), recordId: text('record_id').notNull(), actorId: uuid('actor_id').notNull().references(()=>appUsers.id),
 action: text('action').notNull(), beforeData: jsonb('before_data'), afterData: jsonb('after_data').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const recoveryCodes = pgTable('recovery_codes', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(()=>appUsers.id), codeHash: text('code_hash').notNull().unique(),
 usedAt: timestamp('used_at',{withTimezone:true}), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const operationalEvents = pgTable('operational_events', {
 id: uuid('id').primaryKey().defaultRandom(), code: text('code').notNull(), area: text('area').notNull(), status: integer('status'), requestId: uuid('request_id'), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
