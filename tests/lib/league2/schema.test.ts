import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// These tests run the real migrations against a real Postgres. They only run when LEAGUE_TEST_PG is set to a
// psql connection string for a throwaway, empty database (for example "postgresql://postgres@localhost/leaguetest").
// Everything is wrapped in a transaction that is rolled back, so the database is left as it was found.
const TEST_PG = process.env.LEAGUE_TEST_PG
const run = TEST_PG ? describe : describe.skip

const dir = path.join(__dirname, "../../../db/league/migrations")
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()

function psql(sql: string): { ok: boolean; out: string } {
	try {
		const out = execFileSync("psql", [TEST_PG as string, "-v", "ON_ERROR_STOP=1", "-q", "-X", "-t", "-A", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
		return { ok: true, out: out.trim() }
	} catch (e) {
		return { ok: false, out: String((e as { stderr?: Buffer | string }).stderr ?? e) }
	}
}

/** Run statements in a transaction that is always rolled back; report whether they succeeded. */
function tx(stmts: string): { ok: boolean; out: string } {
	return psql(`begin; ${stmts}; rollback;`)
}

const player = (h: string, extra = "") => `insert into league_players (handle${extra ? ", " + extra.split("=")[0] : ""}) values ('${h}'${extra ? ", " + extra.split("=")[1] : ""});`
const COMP = `insert into league_competitions (id, season, kind, name, policy_family) values ('btb-2026', 2026, 'btb', 'Beat the Blogger', 'btb-classic');`
const EVENT = (id = "00000000-0000-0000-0000-000000000001") =>
	`insert into league_events (id, season, week, away_team, home_team, kickoff) values ('${id}', 2026, 5, 'Raiders', 'Colts', '2026-10-11T20:25:00Z');`

run("the League schema on a real Postgres", () => {
	it("applies every migration to an empty database and seeds the Classic v1 policy, frozen", () => {
		// The migrations ran when the database was prepared; here we check their result.
		expect(files).toEqual(["0001_league_core.sql", "0002_league_seed_policies.sql", "0003_better_auth_tables.sql", "0004_league_accounts.sql"])
		const r = psql(`select id, frozen_at is not null from league_scoring_policies where family = 'btb-classic'`)
		expect(r.out).toBe("btb-classic-v1|t")
		// The seeded rules are the JSON for the live scoring (checked against lib/league in policy parity test).
		expect(readFileSync(path.join(dir, "0002_league_seed_policies.sql"), "utf8")).toContain('"winner":10')
	})

	it("holds one handle per person regardless of case", () => {
		expect(tx(`${player("Amy_1")} ${player("AMY_1")}`).out).toMatch(/league_players_handle_unique/)
		expect(tx(`${player("ab")}`).out).toMatch(/league_players_handle_check/)
		expect(tx(`${player("has space")}`).ok).toBe(false)
		expect(tx(`${player("Amy_1")} ${player("Bo_2")}`).ok).toBe(true)
	})

	it("requires a reason whenever an account is disabled", () => {
		expect(tx(`${player("Amy_1")} update league_players set disabled_at = now();`).out).toMatch(/disabled_has_reason/)
		expect(tx(`${player("Amy_1")} update league_players set disabled_at = now(), disabled_reason = 'abuse report 12';`).ok).toBe(true)
	})

	it("keeps the legacy identity's state and token consistent", () => {
		const setup = `${player("Amy_1")} `
		const ins = (state: string, extra: string) =>
			`insert into league_legacy_identities (handle_lower, player_id, key_hash, state, source_doc_id${extra ? ", " + extra.split("|")[0] : ""}) select 'amy_1', id, 'h', '${state}', 'leaguePlayer.amy_1'${extra ? ", " + extra.split("|")[1] : ""} from league_players;`
		expect(tx(setup + ins("unclaimed", "")).ok).toBe(true)
		expect(tx(setup + ins("claiming", "")).out).toMatch(/legacy_token_iff_claiming/)
		expect(tx(setup + ins("claiming", "token_hash|'t'")).ok).toBe(true)
		expect(tx(setup + ins("claimed", "")).out).toMatch(/legacy_owner_iff_claimed/)
		expect(tx(setup + ins("claimed", "claimed_by|'user1'")).ok).toBe(true)
		expect(tx(setup + ins("unclaimed", "claimed_by|'user1'")).out).toMatch(/legacy_owner_iff_claimed/)
	})

	it("never lets a frozen scoring policy be edited or deleted", () => {
		expect(tx(`update league_scoring_policies set rules = '{"winner":99}' where id = 'btb-classic-v1';`).out).toMatch(/frozen/)
		expect(tx(`delete from league_scoring_policies where id = 'btb-classic-v1';`).out).toMatch(/never deleted/)
		expect(tx(`update league_scoring_policies set rules = '{"correct":2}' where id = 'nfl-winner-v1';`).ok).toBe(true)
		expect(tx(`insert into league_scoring_policies (id, family, version, kind, label, rules, effective_from) values ('btb-classic-v3', 'btb-classic', 3, 'score-pick', 'x', '{}', now());`).ok).toBe(true)
		expect(tx(`insert into league_scoring_policies (id, family, version, kind, label, rules, effective_from) values ('wrong-name', 'btb-classic', 2, 'score-pick', 'x', '{}', now());`).out).toMatch(/policy_id_matches/)
	})

	it("enforces one entry per player per game per competition", () => {
		const e = `${player("Amy_1")} ${COMP} ${EVENT()}`
		const ent = (n: string) => `insert into league_entries (competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) select 'btb-2026', p.id, '00000000-0000-0000-0000-000000000001', '{"away":${n},"home":24}', now(), now() from league_players p;`
		expect(tx(e + ent("17")).ok).toBe(true)
		expect(tx(e + ent("17") + ent("20")).out).toMatch(/league_entries_unique/)
	})

	it("refuses a final game with no score, and a game against itself", () => {
		expect(tx(`insert into league_events (season, week, away_team, home_team, kickoff, state) values (2026, 5, 'A', 'B', now(), 'final');`).out).toMatch(/final_has_score/)
		expect(tx(`insert into league_events (season, week, away_team, home_team, kickoff, state, away_score, home_score) values (2026, 5, 'A', 'B', now(), 'final', 10, 20);`).ok).toBe(true)
		expect(tx(`insert into league_events (season, week, away_team, home_team, kickoff) values (2026, 5, 'A', 'A', now());`).out).toMatch(/game_has_teams/)
		expect(tx(`insert into league_events (season, week, away_team, home_team, kickoff, away_score) values (2026, 5, 'A', 'B', now(), 100);`).ok).toBe(false)
	})

	const withEntry = `${player("Amy_1")} ${COMP} ${EVENT()}
		insert into league_entries (id, competition_id, player_id, event_id, payload, first_submitted_at, submitted_at)
			select '00000000-0000-0000-0000-0000000000e1', 'btb-2026', p.id, '00000000-0000-0000-0000-000000000001', '{"away":17,"home":24}', now(), now() from league_players p;`
	const grade = (key: string, sup: string | null, pts = 25) =>
		`insert into league_grades (key, entry_id, event_id, player_id, policy_id, result_hash, points, correct, graded_at, supersedes)
			select '${key}', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001', p.id, 'btb-classic-v1', 'h', ${pts}, true, now(), ${sup ? `'${sup}'` : "null"} from league_players p;`

	it("keeps grades append-only, with corrections as new rows and a view of the current one", () => {
		expect(tx(withEntry + grade("g1", null)).ok).toBe(true)
		expect(tx(withEntry + grade("g1", null) + `update league_grades set points = 0;`).out).toMatch(/append-only/)
		expect(tx(withEntry + grade("g1", null) + `delete from league_grades;`).out).toMatch(/append-only/)
		const r = tx(withEntry + grade("g1", null, 25) + grade("g2", "g1", 13) + `select key, points from league_current_grades;`)
		expect(r.out).toContain("g2|13")
		expect(r.out).not.toContain("g1|25")
		expect(tx(withEntry + grade("g1", null) + grade("g2", "g1") + grade("g3", "g1")).out).toMatch(/league_grades_one_successor/)
	})

	it("keeps the audit log and revisions append-only", () => {
		const log = `insert into league_audit_log (actor, actor_role, action, subject) values ('admin1', 'admin', 'account.disable', 'player:x');`
		expect(tx(log).ok).toBe(true)
		expect(tx(log + `update league_audit_log set actor = 'someone';`).out).toMatch(/append-only/)
		expect(tx(log + `delete from league_audit_log;`).out).toMatch(/append-only/)
		expect(tx(`insert into league_audit_log (actor, actor_role, action, subject) values ('', 'admin', 'x', 'y');`).ok).toBe(false)
		expect(tx(withEntry + `insert into league_entry_revisions (entry_id, n, payload, at) values ('00000000-0000-0000-0000-0000000000e1', 1, '{}', now()); update league_entry_revisions set n = 2;`).out).toMatch(/append-only/)
	})

	it("requires a reason for a blogger pick change after the lock, and forbids a tied pick", () => {
		const pick = `${COMP} ${EVENT()} insert into league_blogger_picks (event_id, away, home, entered_at) values ('00000000-0000-0000-0000-000000000001', 17, 24, now());`
		expect(tx(pick).ok).toBe(true)
		expect(tx(`${COMP} ${EVENT()} insert into league_blogger_picks (event_id, away, home, entered_at) values ('00000000-0000-0000-0000-000000000001', 20, 20, now());`).ok).toBe(false)
		const rev = (reason: string) => `insert into league_blogger_pick_revisions (event_id, n, away, home, at, reason, after_lock) values ('00000000-0000-0000-0000-000000000001', 1, 17, 24, now(), ${reason}, true);`
		expect(tx(pick + rev("null")).out).toMatch(/after_lock_needs_reason/)
		expect(tx(pick + rev("'typed the teams the wrong way round'")).ok).toBe(true)
	})
})
