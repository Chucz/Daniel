import { pgTable, uuid, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey(),
  data: jsonb('data').notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  credentialHash: text('credential_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
