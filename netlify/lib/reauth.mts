import { and,eq,gt } from 'drizzle-orm';
import { authSessions } from '../../db/schema.js';
import { database } from './database.mjs';
import { digest,readToken } from './auth.mjs';
export async function hasRecentReauthentication(request: Request) {
 const token=readToken(request);if(!token)return false;
 const [session]=await database().select().from(authSessions).where(and(eq(authSessions.tokenHash,digest(token)),gt(authSessions.reauthenticatedAt,new Date(Date.now()-5*60*1000)),gt(authSessions.expiresAt,new Date())));
 return !!session;
}
