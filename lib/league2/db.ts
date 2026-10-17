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

let shared: Pool | null = null

/** The connection string comes from the environment; it should be the pooled one on serverless. */
export function leagueDatabaseUrl(): string | null {
	return process.env.LEAGUE_DATABASE_URL || process.env.DATABASE_URL || null
}

/** A small pool shared by the process. Null when no database is configured, so callers can degrade cleanly. */
export function sharedPool(): Pool | null {
	const url = leagueDatabaseUrl()
	if (!url) return null
	if (!shared) shared = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 })
	return shared
}
