import { pgTable, uuid, jsonb, text, timestamp, boolean } from 'drizzle-orm/pg-core';
export const schedules = pgTable('schedules', { id: uuid('id').primaryKey(), data: jsonb('data').notNull() });
export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(), email: text('email').notNull().unique(), name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(), role: text('role').notNull().default('gestor'),
  active: boolean('active').notNull().default(true), mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), credentialHash: text('credential_hash').notNull(),
  userId: uuid('user_id').references(() => appUsers.id), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});
export const scheduleAudit = pgTable('schedule_audit', {
  id: uuid('id').primaryKey().defaultRandom(), scheduleId: uuid('schedule_id').notNull(),
  actorId: uuid('actor_id').notNull().references(() => appUsers.id), actorEmail: text('actor_email').notNull(),
  beforeData: jsonb('before_data'), afterData: jsonb('after_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
