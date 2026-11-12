import { randomUUID } from 'node:crypto';
import { database } from './database.mjs';
import { operationalEvents } from '../../db/schema.js';
export async function reportServerFailure(code: string, area: string) {
 const requestId=randomUUID();
 console.error(JSON.stringify({event:'operational_error',code,area,requestId,status:503}));
 try { await database().insert(operationalEvents).values({code,area,status:503,requestId}); } catch { /* Database outages still leave a redacted provider log. */ }
 return requestId;
}
