// Database access for the League: one small interface so services can run against a real Postgres in tests and a
// pooled Neon connection in production. Server use only.

import { Pool, type PoolClient } from "pg"

export type Row = Record<string, unknown>
export type Queryable = { query<R extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> }
export type Db = Queryable & {
	/** Run `fn` in one transaction: commit if it returns, roll back if it throws. */
	tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
}

export function dbFromPool(pool: Pool): Db {
	return {
		query: (text, params) => pool.query(text, params as unknown[]) as never,
		async tx(fn) {
			const client: PoolClient = await pool.connect()
			try {
				await client.query("begin")
				const out = await fn({ query: (text, params) => client.query(text, params as unknown[]) as never })
				await client.query("commit")
				return out
			} catch (e) {
				try {
					await client.query("rollback")
				} catch {
					// the original error is the one worth reporting
				}
				throw e
			} finally {
				client.release()
			}
		},
	}
}

// On globalThis so separately bundled routes share one pool.
const poolHolder = globalThis as unknown as { __leaguePool?: Pool | null }

/**
 * Spell the SSL mode out. pg 8 reads `sslmode=prefer`, `require` and `verify-ca` as `verify-full` and prints a warning on every new connection
 * (hundreds of lines a day in the Vercel logs) that the next major version will change what they mean. Writing `verify-full` keeps exactly
 * today's behaviour (encrypted, certificate and host name checked) and silences the warning. Other parameters and local, unencrypted URLs
 * (`sslmode=disable`, or none) are left alone.
 */
export function normalizeSslMode(url: string): string {
	return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$|#)/i, "$1verify-full")
}

/** The connection string comes from the environment; it should be the pooled one on serverless. */
export function leagueDatabaseUrl(): string | null {
	return process.env.LEAGUE_DATABASE_URL || process.env.DATABASE_URL || null
}

/** A small pool shared by the process. Null when no database is configured, so callers can degrade cleanly. */
export function sharedPool(): Pool | null {
	const url = leagueDatabaseUrl()
	if (!url) return null
	if (!poolHolder.__leaguePool) poolHolder.__leaguePool = new Pool({ connectionString: normalizeSslMode(url), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 })
	return poolHolder.__leaguePool as Pool
}
