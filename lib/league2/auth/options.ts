// Better Auth configuration, built from injected dependencies so tests can run it against a scratch database and a
// memory mailer. Nothing here reads the environment; auth/server.ts does that.
//
// Choices (each one deliberate):
//  - Email + password with verified email required before any session exists. Scrypt hashing (library default).
//  - Reset links last one hour, work once, and sign the account out everywhere when used.
//  - Rate limits are stored in the database, so they hold across serverless instances. Sign-in is also limited
//    per email address, not only per IP.
//  - No admin plugin: it ships impersonation, which this site will not have. Admin actions are our own audited routes.
//  - Telemetry off.

import type { BetterAuthOptions } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import type { Pool } from "pg"

import type { Mailer } from "../mail"
import { existingAccountEmail, resetEmail, verificationEmail } from "../mail"

export type VerifiedUser = { id: string; email: string; name: string }

export type AuthDeps = {
	pool: Pool
	secret: string
	baseURL: string
	production: boolean
	mailer: Mailer
	/** Called once a user's email is verified. Creates the player or completes a legacy claim. Must be idempotent. */
	onEmailVerified: (user: VerifiedUser) => Promise<void>
	/** True when the player behind this user is disabled. Blocks new sessions. */
	isDisabled: (userId: string) => Promise<boolean>
	/** Durable per-key limiter (see services/ratelimit). Returns true when the call is allowed. */
	allow: (key: string, max: number, windowMs: number) => Promise<boolean>
}

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128
export const RESET_TTL_SECONDS = 60 * 60
export const VERIFY_TTL_SECONDS = 60 * 60
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export function buildAuthOptions(d: AuthDeps): BetterAuthOptions {
	const origins = Array.from(new Set([d.baseURL, "https://www.raidersrundown.com", "https://raidersrundown.com"]))
	return {
		appName: "Raiders Rundown League",
		baseURL: d.baseURL,
		secret: d.secret,
		database: d.pool,
		telemetry: { enabled: false },
		trustedOrigins: origins,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			minPasswordLength: PASSWORD_MIN,
			maxPasswordLength: PASSWORD_MAX,
			autoSignIn: false,
			resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				await d.mailer.send(resetEmail(user.email, url))
			},
			onExistingUserSignUp: async ({ user }) => {
				await d.mailer.send(existingAccountEmail(user.email, `${d.baseURL}/league/sign-in`))
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: VERIFY_TTL_SECONDS,
			sendVerificationEmail: async ({ user, url }) => {
				await d.mailer.send(verificationEmail(user.email, user.name, url))
			},
			afterEmailVerification: async (user) => {
				await d.onEmailVerified({ id: user.id, email: user.email, name: user.name })
			},
		},
		session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
		rateLimit: {
			enabled: true,
			storage: "database",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 300, max: 10 },
				"/sign-up/email": { window: 3600, max: 6 },
				"/request-password-reset": { window: 3600, max: 5 },
				"/send-verification-email": { window: 3600, max: 6 },
				"/reset-password": { window: 3600, max: 10 },
			},
		},
		advanced: {
			// Vercel sets these itself, so a visitor cannot forge them.
			ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] },
			useSecureCookies: d.production,
			cookiePrefix: "rr-league",
			// Better Auth switches these off by default when NODE_ENV is "test"; pin them on everywhere.
			disableOriginCheck: false,
			disableCSRFCheck: false,
		},
		hooks: {
			// Throttle password guessing against one account, whichever addresses it comes from.
			before: createAuthMiddleware(async (ctx) => {
				const body = (ctx.body ?? {}) as { email?: unknown }
				const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : ""
				if (!email) return
				const limits: Record<string, [number, number]> = {
					"/sign-in/email": [8, 15 * 60_000],
					"/request-password-reset": [4, 60 * 60_000],
					"/send-verification-email": [4, 60 * 60_000],
				}
				const rule = limits[ctx.path]
				if (rule && !(await d.allow(`auth:${ctx.path}:${email}`, rule[0], rule[1]))) {
					throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait a while and try again." })
				}
			}),
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						if (await d.isDisabled(session.userId)) return false
						return
					},
				},
			},
		},
	}
}
