import { Pool } from 'pg';

// Server-side only. The browser never sees DATABASE_URL.
// Queries always name the schema (harbour.x): poolers like Neon's ignore search_path.
const globalForPool = globalThis as unknown as { harbourPool?: Pool };

function makePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const local = /localhost|127\.0\.0\.1|sslmode=disable/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3,
  });
}

export function db(): Pool {
  if (!globalForPool.harbourPool) globalForPool.harbourPool = makePool();
  return globalForPool.harbourPool;
}
