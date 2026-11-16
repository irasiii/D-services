import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Db } from './db.js';
import { tx } from './db.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/** Arbitrary constant identifying the migration lock in pg_advisory_lock. */
const MIGRATION_LOCK_ID = 4_815_162_342;

/**
 * Apply any SQL files in migrations/ that have not run yet, in filename order.
 * Holds a database lock so that several API replicas starting together do not migrate at once.
 */
export async function migrate(db: Db): Promise<string[]> {
  const lock = await db.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    return await runMigrations(db);
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    lock.release();
  }
}

async function runMigrations(db: Db): Promise<string[]> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await tx(db, async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
