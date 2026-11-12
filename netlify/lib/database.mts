import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
let schoolDatabase: ReturnType<typeof drizzle> | undefined;
export function database() {
  const connectionString = Netlify.env.get('SUPABASE_DATABASE_URL');
  if (!connectionString) throw new Error('School database is not configured');
  if (!schoolDatabase) {
    const client = postgres(connectionString, { prepare:false, ssl:'require', max:1, idle_timeout:20, connect_timeout:10 });
    schoolDatabase = drizzle({client});
  }
  return schoolDatabase;
}
