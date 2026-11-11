import { drizzle as netlifyDrizzle } from 'drizzle-orm/netlify-db';
import { drizzle as postgresDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let supabaseDatabase: ReturnType<typeof postgresDrizzle> | undefined;

// Only server functions read this URL. Leave it unset until existing data is migrated.
export function database() {
  const connectionString = Netlify.env.get('SUPABASE_DATABASE_URL');
  if (!connectionString) return netlifyDrizzle();
  if (!supabaseDatabase) {
    const client = postgres(connectionString, {
      prepare: false,
      ssl: 'require',
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    supabaseDatabase = postgresDrizzle({ client });
  }
  return supabaseDatabase;
}
