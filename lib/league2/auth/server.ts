// The one place that reads the environment and builds the real auth instance. Everything is off until the database,
// the secret and LEAGUE_ACCOUNTS=on are all present, so deploying this code changes nothing for visitors by itself.

import { betterAuth } from "better-auth"

import { type Db, dbFromPool, sharedPool } from "../db"
import { type Mailer, memoryMailer, resendMailer } from "../mail"
import { finalizeVerifiedUser } from "../services/accounts"
import { parseAllowList } from "../services/admin"
import { allow } from "../services/ratelimit"
import { type AuthDeps, buildAuthOptions } from "./options"

export type LeagueAuth = ReturnType<typeof createLeagueAuth>

export function createLeagueAuth(deps: AuthDeps) {
	return betterAuth(buildAuthOptions(deps))
}

/** Assemble dependencies around a Db. Exported so tests can build the real thing against a scratch database. */
export function depsFor(base: Pick<AuthDeps, "pool" | "secret" | "baseURL" | "production" | "mailer">, db: Db): AuthDeps {
	return {
		...base,
		onEmailVerified: async (u) => {
			try {
				await finalizeVerifiedUser(db, u, Date.now())
			} catch (e) {
				// Never fail the verification itself; /api/league/account/me finishes the setup on first use.
				console.log("league: finishing account setup failed:", (e as Error).message)
			}
		},
		isDisabled: async (userId) => {
			const r = await db.query(`select 1 from league_players where user_id = $1 and disabled_at is not null`, [userId])
			return r.rows.length > 0
		},
		allow: (key, max, windowMs) => allow(db, key, max, windowMs),
	}
}

export type Runtime = { auth: LeagueAuth; db: Db; adminEmails: string[]; mailer: Mailer }

let cached: Runtime | null | undefined

export function siteUrl(): string {
	return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.raidersrundown.com"
}

/** True when accounts should be live. Anything missing means "off", never a half-working sign-up. */
export function accountsEnabled(): boolean {
	return process.env.LEAGUE_ACCOUNTS === "on" && Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32) && Boolean(sharedPool())
}

/** The live runtime, or null when accounts are off. */
export function getRuntime(): Runtime | null {
	if (cached !== undefined) return cached
	if (!accountsEnabled()) return (cached = null)
	const pool = sharedPool()!
	const db = dbFromPool(pool)
	const production = process.env.NODE_ENV === "production"
	const key = process.env.RESEND_API_KEY
	const from = process.env.LEAGUE_FROM_EMAIL
	// Without an email provider, sign-up cannot work in production; in development messages are kept in memory.
	if (production && (!key || !from)) return (cached = null)
	const mailer: Mailer = key && from ? resendMailer(key, from) : memoryMailer()
	const auth = createLeagueAuth(depsFor({ pool, secret: process.env.BETTER_AUTH_SECRET as string, baseURL: siteUrl(), production, mailer }, db))
	return (cached = { auth, db, adminEmails: parseAllowList(process.env.LEAGUE_ADMIN_EMAILS), mailer })
}

/** Test hook: forget the cached runtime. */
export function resetRuntimeForTests(): void {
	cached = undefined
}
