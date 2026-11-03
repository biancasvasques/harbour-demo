// Applies db/*.sql in order, once each, inside a transaction per file.
// Runs on every deploy (see package.json "build"), so a fresh database is
// set up automatically and an existing one is left alone.
//
// Needs DATABASE_URL. Never prints it.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// Neon gives a pooled DATABASE_URL and a direct DATABASE_URL_UNPOOLED; DDL goes direct.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] DATABASE_URL not set, skipping.');
  process.exit(0);
}

const dir = path.join(process.cwd(), 'db');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const ssl = /localhost|127\.0\.0\.1|\.railway\.internal|sslmode=disable/.test(url)
  ? false
  : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();

try {
  await client.query('create schema if not exists harbour');
  await client.query(`create table if not exists harbour.schema_migrations (
    file text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select file from harbour.schema_migrations')).rows.map((r) => r.file));

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into harbour.schema_migrations(file) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`[migrate] ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('[migrate] up to date.');
} finally {
  await client.end();
}
