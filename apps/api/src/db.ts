import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

/** Run `fn` inside a transaction; rolls back if it throws. */
export async function tx<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Convert a snake_case database row to a camelCase API object. */
export function camel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T;
}

export async function many<T = Record<string, unknown>>(q: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await q.query(sql, params);
  return res.rows.map((r) => camel<T>(r));
}

export async function one<T = Record<string, unknown>>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await many<T>(q, sql, params))[0];
}
