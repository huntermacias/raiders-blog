// A small durable rate limiter in the League database, so limits hold across serverless instances.

import type { Queryable } from "../db"

/**
 * Count one hit for `key`. Returns true while the key is within `max` hits per `windowMs`. The window starts at the
 * first hit and resets when it ends (a fixed window), which is simple and good enough for abuse control.
 */
export async function allow(q: Queryable, key: string, max: number, windowMs: number, nowMs: number = Date.now()): Promise<boolean> {
	const now = new Date(nowMs).toISOString()
	const next = new Date(nowMs + windowMs).toISOString()
	const r = await q.query<{ count: number }>(
		`insert into league_rate_limits (key, count, reset_at) values ($1, 1, $3::timestamptz)
		 on conflict (key) do update set
			count = case when league_rate_limits.reset_at <= $2::timestamptz then 1 else league_rate_limits.count + 1 end,
			reset_at = case when league_rate_limits.reset_at <= $2::timestamptz then $3::timestamptz else league_rate_limits.reset_at end
		 returning count`,
		[key.slice(0, 200), now, next]
	)
	return Number(r.rows[0].count) <= max
}
