import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { dbFromPool, type Db } from "../../../lib/league2/db"
import { generateKey, hashKey as serverHash, normalizeKey as serverNormalize } from "../../../lib/league.server"
import { hashKey, keyMatches, newToken, normalizeKey } from "../../../lib/league2/legacyKey"
import { checkPassword, normalizeEmail } from "../../../lib/league2/services/passwords"
import { allow } from "../../../lib/league2/services/ratelimit"
import { bindClaim, chooseHandle, finalizeVerifiedUser, peekClaim, reserveHandle, startClaim } from "../../../lib/league2/services/accounts"
import { linkLegacyByReview, memberDetail, parseAllowList, requireAdmin, revokeSessions, rollbackClaim, searchMembers, disablePlayer, restorePlayer, sendResetLink } from "../../../lib/league2/services/admin"

describe("passwords and emails (pure)", () => {
	it("enforces length and rejects the obvious", () => {
		expect(checkPassword("short", {})).toMatch(/at least 10/)
		expect(checkPassword("x".repeat(129), {})).toMatch(/at most/)
		expect(checkPassword("aaaaaaaaaaaa", {})).toMatch(/repetitive/)
		expect(checkPassword("1234567890", {})).toMatch(/predictable/)
		expect(checkPassword("Password1234", {})).toMatch(/easy to guess/)
		expect(checkPassword("raiders2026", {})).toMatch(/easy to guess/)
		expect(checkPassword("hunter_macias_rules", { handle: "hunter_macias" })).toMatch(/handle/)
		expect(checkPassword("mynameisamy.smith", { email: "amy.smith@x.co" })).toMatch(/email/)
		expect(checkPassword(12345 as unknown, {})).toBe("Enter a password")
	})
	it("accepts a long passphrase with no composition rules", () => {
		expect(checkPassword("correct horse battery staple", {})).toBeNull()
		expect(checkPassword("silverandblack-sunday", { handle: "amy", email: "x@y.co" })).toBeNull()
	})
	it("normalises emails", () => {
		expect(normalizeEmail("  Amy@Example.COM ")).toBe("amy@example.com")
		expect(normalizeEmail("not an email")).toBeNull()
		expect(normalizeEmail("a@b")).toBeNull()
		expect(normalizeEmail(42)).toBeNull()
	})
})

describe("legacy key helpers match the live implementation", () => {
	it("hashes and normalises exactly as lib/league.server does", () => {
		for (let i = 0; i < 50; i++) {
			const key = generateKey()
			expect(hashKey(key)).toBe(serverHash(key))
			expect(normalizeKey(key.toLowerCase().replace(/-/g, " "))).toBe(serverNormalize(key))
			expect(keyMatches(key.toLowerCase(), serverHash(key))).toBe(true)
		}
		expect(keyMatches("WRONG-KEY", serverHash(generateKey()))).toBe(false)
		expect(keyMatches(generateKey(), null)).toBe(false)
		expect(newToken().length).toBeGreaterThanOrEqual(40)
		expect(newToken()).not.toBe(newToken())
	})
})

const TEST_PG = process.env.LEAGUE_TEST_PG
const run = TEST_PG ? describe : describe.skip

run("accounts, claims and admin on a real Postgres", () => {
	let pool: Pool
	let db: Db
	const T0 = Date.parse("2026-10-17T12:00:00Z")

	beforeAll(() => {
		if (!/test/i.test(TEST_PG as string)) throw new Error("LEAGUE_TEST_PG must point at a database with 'test' in its name")
		pool = new Pool({ connectionString: TEST_PG })
		db = dbFromPool(pool)
	})
	afterAll(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		await pool.end()
	})
	beforeEach(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "user" restart identity cascade`)
	})

	const user = async (id: string, email: string, name: string, verified = true) => {
		await pool.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, $4)`, [id, name, email, verified])
	}
	const session = async (userId: string, n = 1) => {
		for (let i = 0; i < n; i++) await pool.query(`insert into "session" (id, "expiresAt", token, "updatedAt", "userId") values ($1, now() + interval '1 day', $2, now(), $3)`, [`${userId}-s${i}`, `${userId}-t${i}`, userId])
	}
	const sessions = async (userId: string) => Number((await pool.query(`select count(*) n from "session" where "userId" = $1`, [userId])).rows[0].n)
	const audit = async (action?: string) => (await pool.query(`select * from league_audit_log ${action ? "where action = $1" : ""} order by id`, action ? [action] : [])).rows

	/** A legacy player with a real key, one game and one graded pick, as the backfill would create it. */
	async function legacy(handle = "OldTimer") {
		const key = generateKey()
		const p = await pool.query(`insert into league_players (handle, legacy_handle_lower, joined_at) values ($1, lower($1), '2026-09-02T00:00:00Z') returning id`, [handle])
		await pool.query(`insert into league_legacy_identities (handle_lower, player_id, key_hash, source_doc_id) values (lower($1), $2, $3, $4)`, [handle, p.rows[0].id, serverHash(key), `leaguePlayer.${handle.toLowerCase()}`])
		await pool.query(`insert into league_competitions (id, season, kind, name, policy_family) values ('btb-2026', 2026, 'btb', 'BtB', 'btb-classic') on conflict do nothing`)
		const ev = await pool.query(`insert into league_events (season, week, away_team, home_team, kickoff, state, away_score, home_score) values (2026, 3, 'A', 'B', '2026-09-20T17:00:00Z', 'final', 17, 24) returning id`)
		const en = await pool.query(`insert into league_entries (competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) values ('btb-2026', $1, $2, '{"away":17,"home":24}', now(), now()) returning id`, [p.rows[0].id, ev.rows[0].id])
		await pool.query(`insert into league_grades (key, entry_id, event_id, player_id, policy_id, result_hash, points, correct, graded_at) values ('k1', $1, $2, $3, 'btb-classic-v1', '17-24', 25, true, now())`, [en.rows[0].id, ev.rows[0].id, p.rows[0].id])
		return { key, playerId: p.rows[0].id as string, entryId: en.rows[0].id as string }
	}
	const legacyRow = async (lower: string) => (await pool.query(`select * from league_legacy_identities where handle_lower = $1`, [lower])).rows[0]

	describe("new players", () => {
		it("reserves a handle for one email, lets that email retry, and turns everyone else away", async () => {
			expect(await reserveHandle(db, { handle: "NewFan", email: "a@x.co", now: T0 })).toMatchObject({ ok: true, lower: "newfan" })
			expect(await reserveHandle(db, { handle: "newfan", email: "a@x.co", now: T0 + 1000 })).toMatchObject({ ok: true })
			expect(await reserveHandle(db, { handle: "NEWFAN", email: "b@x.co", now: T0 + 2000 })).toMatchObject({ ok: false, code: "taken" })
			expect(await reserveHandle(db, { handle: "newfan", email: "b@x.co", now: T0 + 3 * 3600_000 })).toMatchObject({ ok: true })
			expect(await reserveHandle(db, { handle: "ab", email: "c@x.co", now: T0 })).toMatchObject({ ok: false, code: "invalid" })
			expect(await reserveHandle(db, { handle: "admin", email: "c@x.co", now: T0 })).toMatchObject({ ok: false, code: "invalid" })
		})

		it("lets exactly one of many simultaneous sign-ups have a handle", async () => {
			const results = await Promise.all(Array.from({ length: 12 }, (_, i) => reserveHandle(db, { handle: "RaceHandle", email: `p${i}@x.co`, now: T0 })))
			expect(results.filter((r) => r.ok).length).toBe(1)
		})

		it("never offers a handle that belongs to a legacy player", async () => {
			await legacy("OldTimer")
			expect(await reserveHandle(db, { handle: "oldtimer", email: "a@x.co", now: T0 })).toMatchObject({ ok: false, code: "taken" })
		})

		it("makes a verified account a player once, and again does nothing", async () => {
			await user("u1", "a@x.co", "NewFan")
			await reserveHandle(db, { handle: "NewFan", email: "a@x.co", now: T0 })
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "a@x.co", name: "NewFan" }, T0)).toBe("created")
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "a@x.co", name: "NewFan" }, T0 + 1)).toBe("exists")
			const p = await pool.query(`select handle, user_id from league_players`)
			expect(p.rows).toEqual([{ handle: "NewFan", user_id: "u1" }])
			expect((await pool.query(`select 1 from league_handle_reservations`)).rows.length).toBe(0)
			expect((await audit("account.verify_email")).length).toBe(1)
		})

		it("asks for a new handle when the first choice was taken meanwhile", async () => {
			await legacy("OldTimer")
			await user("u9", "z@x.co", "OldTimer")
			expect(await finalizeVerifiedUser(db, { id: "u9", email: "z@x.co", name: "OldTimer" }, T0)).toBe("needs_handle")
			expect(await chooseHandle(db, "u9", "oldtimer", T0)).toMatchObject({ ok: false, code: "taken" })
			expect(await chooseHandle(db, "u9", "FreshOne", T0)).toMatchObject({ ok: true })
			expect(await chooseHandle(db, "u9", "AnotherOne", T0)).toMatchObject({ ok: false })
		})
	})

	describe("legacy claim", () => {
		it("moves a player, with every pick and grade, to a verified account and retires the old key", async () => {
			const L = await legacy("OldTimer")
			await user("u1", "old@x.co", "OldTimer")

			const bad = await startClaim(db, { handle: "OldTimer", key: generateKey(), now: T0 })
			const unknown = await startClaim(db, { handle: "NoSuchPerson", key: L.key, now: T0 })
			expect(bad).toEqual({ ok: false, code: "invalid" })
			expect(unknown).toEqual(bad)

			const start = await startClaim(db, { handle: "oldtimer", key: L.key.toLowerCase(), now: T0 })
			if (!start.ok) throw new Error("expected ok")
			expect((await legacyRow("oldtimer")).state).toBe("claiming")
			// Still a working legacy credential until the claim completes.
			expect(keyMatches(L.key, (await legacyRow("oldtimer")).key_hash)).toBe(true)
			expect(await peekClaim(pool, start.token, T0 + 1000)).toMatchObject({ handle: "OldTimer" })
			expect(await peekClaim(pool, "nonsense-token-nonsense-token", T0)).toBeNull()

			expect(await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 2000 })).toEqual({ ok: true, handle: "OldTimer" })
			// Verifying the email is what completes it.
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, T0 + 60_000)).toBe("claimed")

			const row = await legacyRow("oldtimer")
			expect(row).toMatchObject({ state: "claimed", claimed_by: "u1", token_hash: null, pending_user_id: null })
			expect(row.key_hash).toBeTruthy() // kept so an admin can roll back
			const p = await pool.query(`select id, user_id from league_players`)
			expect(p.rows).toEqual([{ id: L.playerId, user_id: "u1" }])
			expect((await pool.query(`select count(*)::int n from league_entries where player_id = $1`, [L.playerId])).rows[0].n).toBe(1)
			expect((await pool.query(`select points from league_current_grades where player_id = $1`, [L.playerId])).rows).toEqual([{ points: 25 }])
			expect((await audit()).map((a) => a.action)).toEqual(["legacy.claim.begin", "legacy.claim.bind", "legacy.claim.complete"])

			// The key is retired: it cannot start another claim, and finishing again changes nothing.
			expect(await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 + 70_000 })).toEqual({ ok: false, code: "already_claimed" })
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, T0 + 80_000)).toBe("exists")
			expect((await audit()).length).toBe(3)
			expect((await pool.query(`select count(*)::int n from league_players`)).rows[0].n).toBe(1)
		})

		it("does not let an account take a legacy handle just by verifying an email or matching the name", async () => {
			const L = await legacy("OldTimer")
			await user("evil", "evil@x.co", "OldTimer")
			expect(await finalizeVerifiedUser(db, { id: "evil", email: "evil@x.co", name: "OldTimer" }, T0)).toBe("needs_handle")
			expect((await pool.query(`select user_id from league_players where id = $1`, [L.playerId])).rows[0].user_id).toBeNull()
			expect((await legacyRow("oldtimer")).state).toBe("unclaimed")
		})

		it("lets only the account the claim was bound to finish it", async () => {
			const L = await legacy("OldTimer")
			await user("u1", "old@x.co", "OldTimer")
			await user("u2", "other@x.co", "OldTimer")
			const start = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 })
			if (!start.ok) throw new Error("expected ok")
			expect(await bindClaim(db, { token: "x".repeat(43), userId: "u1", now: T0 })).toEqual({ ok: false, code: "bad_token" })
			expect(await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 1 })).toMatchObject({ ok: true })
			expect(await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 2 })).toMatchObject({ ok: true }) // a retry
			expect(await bindClaim(db, { token: start.token, userId: "u2", now: T0 + 3 })).toEqual({ ok: false, code: "bound_to_other" })
			expect(await finalizeVerifiedUser(db, { id: "u2", email: "other@x.co", name: "OldTimer" }, T0 + 4)).toBe("needs_handle")
			expect((await legacyRow("oldtimer")).state).toBe("claiming")
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, T0 + 5)).toBe("claimed")
		})

		it("leaves the legacy player untouched when the claim expires before the email is verified", async () => {
			const L = await legacy("OldTimer")
			await user("u1", "old@x.co", "OldTimer")
			const start = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 })
			if (!start.ok) throw new Error("expected ok")
			await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 1 })
			const late = T0 + 3 * 3600_000
			expect(await finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, late)).toBe("needs_handle")
			expect((await pool.query(`select user_id from league_players where id = $1`, [L.playerId])).rows[0].user_id).toBeNull()
			// And the old key still works to start over.
			expect(await startClaim(db, { handle: "OldTimer", key: L.key, now: late + 1 })).toMatchObject({ ok: true })
		})

		it("rolls everything back if the final step fails, leaving the claim pending and the key working", async () => {
			const L = await legacy("OldTimer")
			await user("u1", "old@x.co", "OldTimer")
			await user("u0", "u0@x.co", "x")
			const start = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 })
			if (!start.ok) throw new Error("expected ok")
			await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 1 })
			// Corrupt the world: the legacy player is somehow already linked to a different account.
			await pool.query(`update league_players set user_id = 'u0' where id = $1`, [L.playerId])
			await expect(finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, T0 + 2)).rejects.toThrow(/already linked/)
			const row = await legacyRow("oldtimer")
			expect(row).toMatchObject({ state: "claiming", pending_user_id: "u1", claimed_by: null })
			expect((await audit("legacy.claim.complete")).length).toBe(0)
		})

		it("lets the same key start a second claim, replacing the first token", async () => {
			const L = await legacy("OldTimer")
			const a = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 })
			const b = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 + 5 })
			if (!a.ok || !b.ok) throw new Error("expected ok")
			expect(await peekClaim(pool, a.token, T0 + 10)).toBeNull()
			expect(await peekClaim(pool, b.token, T0 + 10)).not.toBeNull()
		})
	})

	describe("administration", () => {
		const allowList = parseAllowList(" Boss@Site.com, other@site.com ")

		async function admin() {
			await user("adm", "boss@site.com", "Boss")
			await pool.query(`insert into league_admins (user_id, added_by) values ('adm', 'manual sql')`)
			const ctx = await requireAdmin(pool, { id: "adm", email: "boss@site.com", emailVerified: true }, allowList)
			if (!ctx) throw new Error("expected admin")
			return ctx
		}

		it("needs both locks and a verified email, and ignores anything the browser says", async () => {
			expect(allowList).toEqual(["boss@site.com", "other@site.com"])
			await user("adm", "boss@site.com", "Boss")
			const u = { id: "adm", email: "boss@site.com", emailVerified: true }
			expect(await requireAdmin(pool, u, allowList)).toBeNull() // on the list, not in the table
			await pool.query(`insert into league_admins (user_id, added_by) values ('adm', 'manual sql')`)
			expect(await requireAdmin(pool, u, allowList)).not.toBeNull()
			expect(await requireAdmin(pool, u, [])).toBeNull() // in the table, not on the list
			expect(await requireAdmin(pool, { ...u, emailVerified: false }, allowList)).toBeNull()
			expect(await requireAdmin(pool, { ...u, email: "BOSS@site.com" }, allowList)).not.toBeNull()
			expect(await requireAdmin(pool, null, allowList)).toBeNull()
			expect(await requireAdmin(pool, { ...u, id: "someone-else" }, allowList)).toBeNull()
			expect(await requireAdmin(pool, { ...u, isAdmin: true, role: "admin", id: "other", email: "x@y.co" } as typeof u & { isAdmin: boolean; role: string }, allowList)).toBeNull()
		})

		it("finds members by handle prefix or exact email, showing emails masked", async () => {
			const ctx = await admin()
			await user("u1", "amy.fan@example.com", "AmyFan")
			await pool.query(`insert into league_players (user_id, handle) values ('u1', 'AmyFan'), (null, 'AmberRose'), (null, 'Bob_99')`)
			expect((await searchMembers(pool, ctx, "am")).map((m) => m.handle)).toEqual(["AmberRose", "AmyFan"])
			const byMail = await searchMembers(pool, ctx, "Amy.Fan@example.com")
			expect(byMail.map((m) => m.handle)).toEqual(["AmyFan"])
			expect(byMail[0]).toMatchObject({ maskedEmail: "a***@example.com", emailVerified: true, disabled: false })
			expect(JSON.stringify(byMail)).not.toContain("amy.fan@example.com")
			expect(await searchMembers(pool, ctx, "")).toEqual([])
			expect((await searchMembers(pool, ctx, "%")).length).toBe(0) // wildcards are literal
		})

		it("disables with a reason: sessions end, the audit says who and why, and a missing reason changes nothing", async () => {
			const ctx = await admin()
			await user("u1", "a@x.co", "Amy")
			const p = await pool.query(`insert into league_players (user_id, handle) values ('u1', 'Amy') returning id`)
			await session("u1", 3)
			await expect(disablePlayer(db, ctx, p.rows[0].id, "no", T0)).rejects.toThrow(/reason/)
			expect(await sessions("u1")).toBe(3)
			expect((await pool.query(`select disabled_at from league_players`)).rows[0].disabled_at).toBeNull()

			expect(await disablePlayer(db, ctx, p.rows[0].id, "Reported for abusive handle by two readers", T0)).toEqual({ ok: true, noop: false })
			expect(await sessions("u1")).toBe(0)
			expect(await disablePlayer(db, ctx, p.rows[0].id, "Reported for abusive handle by two readers", T0)).toEqual({ ok: true, noop: true })
			const a = await audit("account.disable")
			expect(a.length).toBe(1)
			expect(a[0]).toMatchObject({ actor: "adm", actor_role: "admin", reason: "Reported for abusive handle by two readers" })

			expect(await restorePlayer(db, ctx, p.rows[0].id, "Handle changed, restoring access", T0 + 1)).toEqual({ ok: true, noop: false })
			expect((await pool.query(`select disabled_at, disabled_reason from league_players`)).rows[0]).toEqual({ disabled_at: null, disabled_reason: null })
		})

		it("revokes sessions on request", async () => {
			const ctx = await admin()
			await user("u1", "a@x.co", "Amy")
			const p = await pool.query(`insert into league_players (user_id, handle) values ('u1', 'Amy') returning id`)
			await session("u1", 2)
			expect(await revokeSessions(db, ctx, p.rows[0].id, "Reader reports a lost phone", T0)).toEqual({ ok: true, revoked: 2 })
			expect(await sessions("u1")).toBe(0)
			expect((await audit("account.sessions.revoke")).length).toBe(1)
		})

		it("recovers access by emailing the owner, never by showing or setting a password", async () => {
			const ctx = await admin()
			await user("u1", "a@x.co", "Amy")
			await user("u2", "b@x.co", "Bobby", false)
			const p1 = await pool.query(`insert into league_players (user_id, handle) values ('u1', 'Amy') returning id`)
			const p2 = await pool.query(`insert into league_players (user_id, handle) values ('u2', 'Bobby') returning id`)
			const sent: string[] = []
			expect(await sendResetLink(db, ctx, p1.rows[0].id, async (e) => void sent.push(e), T0)).toEqual({ ok: true })
			expect(sent).toEqual(["a@x.co"])
			expect(await sendResetLink(db, ctx, p2.rows[0].id, async (e) => void sent.push(e), T0)).toMatchObject({ ok: false })
			expect(sent).toEqual(["a@x.co"])
			const log = JSON.stringify(await audit())
			expect(log).not.toContain("a@x.co")
			expect(log).not.toMatch(/password"?:/i)
		})

		it("rolls back a claim so the old key works again, and shows the player's history to the admin", async () => {
			const ctx = await admin()
			const L = await legacy("OldTimer")
			await user("u1", "old@x.co", "OldTimer")
			const start = await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 })
			if (!start.ok) throw new Error("expected ok")
			await bindClaim(db, { token: start.token, userId: "u1", now: T0 + 1 })
			await finalizeVerifiedUser(db, { id: "u1", email: "old@x.co", name: "OldTimer" }, T0 + 2)
			await session("u1", 2)

			const d = await memberDetail(pool, ctx, L.playerId)
			expect(d).toMatchObject({ handle: "OldTimer", legacyState: "claimed", entries: 1, gradedEntries: 1, activeSessions: 2 })
			expect(d!.recentAudit.map((a) => a.action)).toContain("legacy.claim.complete")

			expect(await rollbackClaim(db, ctx, "oldtimer", "short", T0 + 3)).toMatchObject({ ok: false })
			expect((await legacyRow("oldtimer")).state).toBe("claimed")
			expect(await rollbackClaim(db, ctx, "oldtimer", "Claimed by someone who found the key; owner contacted us", T0 + 3)).toEqual({ ok: true, noop: false })
			expect(await legacyRow("oldtimer")).toMatchObject({ state: "unclaimed", claimed_by: null })
			expect((await pool.query(`select user_id from league_players where id = $1`, [L.playerId])).rows[0].user_id).toBeNull()
			expect(await sessions("u1")).toBe(0)
			expect(await startClaim(db, { handle: "OldTimer", key: L.key, now: T0 + 10 })).toMatchObject({ ok: true })
			expect(await rollbackClaim(db, ctx, "nobody", "Some reason that is long enough", T0)).toMatchObject({ ok: false })
		})

		it("gives a player with no key their history back only on independent evidence", async () => {
			const ctx = await admin()
			const L = await legacy("OldTimer")
			await user("u1", "new@x.co", "FreshStart")
			await finalizeVerifiedUser(db, { id: "u1", email: "new@x.co", name: "FreshStart" }, T0)
			const base = { handleLower: "oldtimer", claimantUserId: "u1", notes: "DM from the original X account that posted the first challenge link, plus the week 3 score pick." }

			expect(await linkLegacyByReview(db, ctx, { ...base, evidence: ["x_dm_from_original_account"] }, T0)).toMatchObject({ ok: false })
			expect(await linkLegacyByReview(db, ctx, { ...base, evidence: [] }, T0)).toMatchObject({ ok: false })
			expect(await linkLegacyByReview(db, ctx, { ...base, evidence: ["x_dm_from_original_account", "pick_details_only_owner_knows"], notes: "too short" }, T0)).toMatchObject({ ok: false })
			expect((await legacyRow("oldtimer")).state).toBe("unclaimed")

			expect(await linkLegacyByReview(db, ctx, { ...base, evidence: ["x_dm_from_original_account", "pick_details_only_owner_knows"] }, T0 + 1)).toEqual({ ok: true })
			expect(await legacyRow("oldtimer")).toMatchObject({ state: "claimed", claimed_by: "u1" })
			const p = await pool.query(`select id, handle, user_id from league_players`)
			expect(p.rows).toEqual([{ id: L.playerId, handle: "OldTimer", user_id: "u1" }])
			const a = await audit("legacy.manual_review")
			expect(a.length).toBe(1)
			expect(a[0].after.evidence).toEqual(["x_dm_from_original_account", "pick_details_only_owner_knows"])
			expect(a[0].reason).toMatch(/DM from the original X account/)
			expect(await linkLegacyByReview(db, ctx, { ...base, evidence: ["x_dm_from_original_account", "pick_details_only_owner_knows"] }, T0 + 2)).toMatchObject({ ok: false })
		})

		it("refuses a review when the claimant's own account already has picks", async () => {
			const ctx = await admin()
			await legacy("OldTimer")
			await user("u1", "new@x.co", "FreshStart")
			await finalizeVerifiedUser(db, { id: "u1", email: "new@x.co", name: "FreshStart" }, T0)
			const mine = await pool.query(`select id from league_players where user_id = 'u1'`)
			const ev = await pool.query(`select id from league_events limit 1`)
			await pool.query(`insert into league_entries (competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) values ('btb-2026', $1, $2, '{"away":3,"home":10}', now(), now())`, [mine.rows[0].id, ev.rows[0].id])
			const r = await linkLegacyByReview(db, ctx, { handleLower: "oldtimer", claimantUserId: "u1", evidence: ["x_dm_from_original_account", "email_used_when_contacting"], notes: "Two kinds of evidence were provided and checked by hand." }, T0)
			expect(r).toMatchObject({ ok: false })
			expect((await legacyRow("oldtimer")).state).toBe("unclaimed")
		})
	})

	describe("durable rate limit", () => {
		it("allows up to the limit in a window, then refuses, then starts again", async () => {
			const r = [] as boolean[]
			for (let i = 0; i < 5; i++) r.push(await allow(pool, "k1", 3, 60_000, T0 + i))
			expect(r).toEqual([true, true, true, false, false])
			expect(await allow(pool, "k2", 3, 60_000, T0)).toBe(true)
			expect(await allow(pool, "k1", 3, 60_000, T0 + 61_000)).toBe(true)
		})
		it("counts parallel callers exactly", async () => {
			const out = await Promise.all(Array.from({ length: 20 }, () => allow(pool, "k3", 7, 60_000, T0)))
			expect(out.filter(Boolean).length).toBe(7)
		})
	})
})
