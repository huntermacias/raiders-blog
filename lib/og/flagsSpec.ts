// Turns the penalty flags data into the plain spec a share card is drawn from (lib/og/flagsCards.tsx). No network: the route fetches the photos
// the spec asks for. Returns null for anything the data does not have, so the route falls back to the default card.

import { opponentColors } from "../lab/colors"
import { type Flag, type FlagFile, type FlagPlayer, TAG_INFO, TAG_ORDER, byDown, clockText, costText, costliest, downText, latestCostly, marginText, playerRows, resultLine, teamRows, totals, turnoversText, typeSlug, versus } from "../lab/flagsKit"
import { flagSeason, getFlagFiles, getRoster, playerIdOf } from "../lab/flagsData"
import { type FlagsView } from "../lab/flagsShare"
import { type TeamProfile, baselineOf, compareEdges, dimension, situationMix, standout, teamProfiles, typeRows } from "../lab/flagsSituations"
import { headshotUrl, shotUrl } from "../lab/playersKit"
import type { ShareSize } from "../lab/lastShare"
import { teamName, teamNick } from "../lab/playerView"
import { TEAMS } from "../nfl"
import type { Bar, FlagsCardSpec, Head, Pair, Row } from "./flagsCards"
import { SILVER, WHITE, accent } from "./kit"

const ABBRS = TEAMS.map((t) => t.abbr)

/** A team's colour on the dark card; the Raiders' own black would vanish, so they wear white. */
export const teamColor = (abbr: string): string => (abbr === "LV" ? WHITE : accent(opponentColors(abbr).dark))

const ordinal = (n: number): string => {
	const v = n % 100
	const s = ["th", "st", "nd", "rd"]
	return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** "-5.2" or "+0.3": the cost from the committing team's side, without the unit. */
const costNum = (c: number): string => costText(c).replace(" pts", "")
const money = (n: number, d = 1): string => n.toFixed(d)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function headOf(p: FlagPlayer | undefined, fallbackName: string, team: string): Head {
	const url = p?.e ? headshotUrl(p.e) : p?.h ? shotUrl(p.h).replace("f_auto,q_auto", "f_png,w_400") : null
	return { name: p?.n ?? fallbackName, sub: `${p?.p ?? ""} ${p?.t ?? team}`.trim(), url, color: teamColor(p?.t ?? team) }
}

/** The one-line account of a flag that a card quotes. */
export function flagLine(f: Flag, who = true): string {
	return `Week ${f.w} ${versus(f)}: ${f.ty}${who && f.ck !== "team" && f.pn ? `, ${f.pn}` : ""}, ${downText(f.dn, f.yd)}, ${costText(f.c)}`
}

function downBars(flags: readonly Flag[]): Bar[] {
	const rows = byDown(flags)
	const max = Math.max(0.1, ...rows.map((r) => r.cost))
	return rows.map((r) => ({ label: r.label === "Kicks" ? "Kickoffs and tries" : `${r.label} down`, value: money(r.cost), frac: r.cost / max, note: `${r.flags} ${r.flags === 1 ? "flag" : "flags"}${r.costly ? ` · ${r.costly} like a turnover` : ""}` }))
}

function typeCounts(flags: readonly Flag[], n: number): { label: string; value: string }[] {
	const m = new Map<string, number>()
	for (const f of flags) m.set(f.ty, (m.get(f.ty) ?? 0) + 1)
	return Array.from(m, ([label, c]) => ({ label, c }))
		.sort((a, b) => b.c - a.c || a.label.localeCompare(b.label))
		.slice(0, n)
		.map((x) => ({ label: x.label, value: String(x.c) }))
}

type Ctx = { file: FlagFile; size: ShareSize; roster: Record<string, FlagPlayer> }

function base(ctx: Ctx, color: string, heads: Head[] = []) {
	return { type: "flags" as const, size: ctx.size, season: ctx.file.season, week: ctx.file.week, color, heads }
}

function flagSpec(ctx: Ctx, id: string): FlagsCardSpec | null {
	const f = ctx.file.flags.find((x) => x.id === id)
	if (!f) return null
	const p = f.pid ? ctx.roster[f.pid] : undefined
	const heads = f.ck !== "team" && f.pid ? [headOf(p, f.pn ?? "Unknown", f.t)] : [{ name: f.t, sub: "", url: null, color: teamColor(f.t) }]
	const tags = TAG_ORDER.filter((t) => f.tg.includes(t)).map((t) => TAG_INFO[t].label)
	return {
		...base(ctx, teamColor(f.t), heads),
		kind: "flag",
		ty: f.ty,
		yards: f.yds ? `${f.yds} yards` : "No yardage",
		cost: costNum(f.c),
		turnovers: turnoversText(f.c, ctx.file.turnoverCost),
		game: `Week ${f.w} ${versus(f)}`,
		team: f.t,
		teamName: teamNick(f.t),
		who: f.ck === "team" ? "Team and coaches" : (p?.n ?? f.pn ?? "Unknown"),
		whoSub: f.ck === "team" ? "Team penalty" : f.ck === "qb" ? `QB · ${teamNick(f.t)}` : `${p?.p ?? "Player"} · ${teamNick(f.t)}`,
		head: heads.length ? 0 : null,
		down: downText(f.dn, f.yd),
		spot: f.fp ?? "n/a",
		clock: clockText(f),
		score: cap(marginText(f.mg)),
		result: resultLine(f),
		tags,
		wp: f.wp != null ? `${f.wp > 0 ? "+" : f.wp < 0 ? "−" : ""}${Math.abs(f.wp).toFixed(1)} pts` : null,
	}
}

function profilesOf(ctx: Ctx): Record<string, TeamProfile> {
	return teamProfiles(ctx.file.flags, ABBRS, ctx.file.games)
}

function rankText(p: TeamProfile): string {
	return p.rank.cost ? `Flags cost the ${p.rank.cost === 1 ? "most" : `${ordinal(p.rank.cost)} most`} per game of ${p.rank.of} teams` : ""
}

function teamSpec(ctx: Ctx, abbr: string): FlagsCardSpec | null {
	if (!ABBRS.includes(abbr)) return null
	const prof = profilesOf(ctx)[abbr]
	const mine = ctx.file.flags.filter((f) => f.t === abbr)
	const rows = playerRows(mine, ctx.roster).slice(0, 3)
	const heads = rows.map((r) => headOf(ctx.roster[r.key], r.label, abbr))
	const t = totals(mine)
	return {
		...base(ctx, teamColor(abbr), heads),
		kind: "team",
		team: abbr,
		name: teamNick(abbr),
		stats: { flags: String(prof.flags), cost: money(prof.cost), costly: String(prof.costly), yards: String(prof.yards) },
		rank: mine.length ? `${rankText(prof)} · ${t.yards} yards` : "No flags yet",
		bars: downBars(mine),
		types: typeCounts(mine, 5),
		worst: prof.worst ? `${flagLine(prof.worst)} · ${prof.worst.tg.length ? "counts like a turnover" : "not turnover-like"}` : null,
		faces: rows.map((r, i) => ({ head: i, value: `${r.flags}` })),
	}
}

function playerSpec(ctx: Ctx, slug: string): FlagsCardSpec | null {
	const pid = playerIdOf(slug)
	const p = pid ? getRoster().byId[pid] : undefined
	if (!pid || !p) return null
	const mine = ctx.file.flags.filter((f) => f.pid === pid)
	const t = totals(mine)
	const all = playerRows(ctx.file.flags, ctx.roster)
	const at = all.findIndex((r) => r.key === pid)
	const worst = mine.length ? costliest(mine, 1)[0] : null
	return {
		...base(ctx, teamColor(p.t), [headOf(p, p.n, p.t)]),
		kind: "player",
		name: p.n,
		team: p.t,
		teamName: teamName(p.t),
		pos: p.p ?? "NFL",
		head: 0,
		stats: { flags: String(t.flags), cost: money(t.cost), costly: String(t.costly), fourth: String(mine.filter((f) => f.dn === 4).length) },
		rank: at >= 0 && at < 25 ? `${at === 0 ? "Most" : `${ordinal(at + 1)} most`} costly flags of ${all.length} flagged players` : null,
		bars: downBars(mine),
		types: typeCounts(mine, 3),
		worst: worst ? `${flagLine(worst, false)}${worst.tg.length ? " · counts like a turnover" : ""}` : null,
		note: mine.length ? null : `No accepted penalties in ${ctx.file.season} yet.`,
	}
}

const PER = (n: number, d = 1) => money(n, d)

function compareSpec(ctx: Ctx, a: string, b: string): FlagsCardSpec | null {
	if (!ABBRS.includes(a) || !ABBRS.includes(b) || a === b) return null
	const all = profilesOf(ctx)
	const A = all[a]
	const B = all[b]
	const pair = (label: string, x: number, y: number, d = 1): Pair => {
		const hi = Math.max(x, y, 0.0001)
		const worse = Math.abs(x - y) <= hi * 0.05 ? null : x > y ? "a" : "b"
		return { label, a: PER(x, d), b: PER(y, d), fa: x / hi, fb: y / hi, worse }
	}
	const bucket = (p: TeamProfile, dim: "down" | "score" | "clock" | "field", id: string) => (p.dims[dim].find((r) => r.id === id)?.flags ?? 0) / Math.max(1, p.games)
	const pairs: Pair[] = [
		pair("Flags a game", A.perGame.flags, B.perGame.flags),
		pair("Points lost a game", A.perGame.cost, B.perGame.cost),
		pair("Like a turnover", A.costly, B.costly, 0),
		pair("4th-down flags a game", bucket(A, "down", "4"), bucket(B, "down", "4"), 2),
		pair("3rd-down flags a game", bucket(A, "down", "3"), bucket(B, "down", "3"), 2),
		pair("Flags a game when trailing", bucket(A, "score", "t9") + bucket(A, "score", "t1"), bucket(B, "score", "t9") + bucket(B, "score", "t1"), 2),
		pair("Flags a game, last 2 minutes", bucket(A, "clock", "two"), bucket(B, "clock", "two"), 2),
		pair("Red-zone flags a game", bucket(A, "field", "rz"), bucket(B, "field", "rz"), 2),
	]
	return {
		...base(ctx, teamColor(a)),
		kind: "compare",
		a: { team: a, name: teamNick(a), color: teamColor(a), rank: A.rank.cost ? `${ordinal(A.rank.cost)} most costly of ${A.rank.of}` : "" },
		b: { team: b, name: teamNick(b), color: teamColor(b) === teamColor(a) ? SILVER : teamColor(b), rank: B.rank.cost ? `${ordinal(B.rank.cost)} most costly of ${B.rank.of}` : "" },
		pairs,
		edges: compareEdges(A, B, 3).map((e) => e.text),
	}
}

function boardSpec(ctx: Ctx, board: string): FlagsCardSpec | null {
	const flags = ctx.file.flags
	const n = 8
	if (board === "players") {
		const rows = playerRows(flags, ctx.roster).slice(0, n)
		return {
			...base(ctx, "#f2c14e", rows.map((r) => headOf(ctx.roster[r.key], r.label, r.team))),
			kind: "board",
			title: "Costliest flaggers",
			sub: "The players whose penalties took the most points off their teams",
			cols: ["Flags", "Points lost"],
			rows: rows.map((r, i): Row => ({ rank: i + 1, title: r.label, sub: `${teamNick(r.team)}${r.pos ? ` · ${r.pos}` : ""}${r.costly ? ` · ${r.costly} like a turnover` : ""}`, v1: String(r.flags), v2: money(r.cost), head: i })),
		}
	}
	if (board === "teams") {
		const all = Object.values(profilesOf(ctx)).sort((a, b) => a.rank.cost - b.rank.cost).slice(0, n)
		return {
			...base(ctx, "#f2c14e"),
			kind: "board",
			title: "Costliest flags by team",
			sub: "Points lost to penalties per game",
			cols: ["Flags", "Points a game"],
			rows: all.map((p, i): Row => ({ rank: i + 1, title: teamName(p.team), sub: `${p.perGame.flags.toFixed(1)} flags a game · ${p.costly} like a turnover`, v1: String(p.flags), v2: money(p.perGame.cost) })),
		}
	}
	if (board === "types") {
		const rows = typeRows(flags).slice(0, n)
		return {
			...base(ctx, "#f2c14e"),
			kind: "board",
			title: "The costliest penalties",
			sub: "Total points lost, by kind of penalty",
			cols: ["Flags", "Points lost"],
			rows: rows.map((r, i): Row => ({ rank: i + 1, title: r.type, sub: `${r.avg.toFixed(1)} each · ${Math.round(r.costlyShare * 100)}% like a turnover`, v1: String(r.flags), v2: money(r.cost, 0) })),
		}
	}
	if (board === "latest" || board === "worst") {
		const list = board === "latest" ? latestCostly(flags, n) : costliest(flags, n)
		const heads = list.map((f) => headOf(f.pid ? ctx.roster[f.pid] : undefined, f.pn ?? f.t, f.t))
		return {
			...base(ctx, "#f2c14e", heads),
			kind: "board",
			title: board === "latest" ? "Latest costly flags" : "The costliest flags",
			sub: board === "latest" ? "The newest penalties that cost like a turnover" : `The ${n} biggest penalties of ${ctx.file.season}`,
			cols: ["Week", "Points lost"],
			rows: list.map((f, i): Row => ({ rank: i + 1, title: `${f.t} ${f.ty}`, sub: `${f.ck === "team" ? "Team and coaches" : (f.pn ?? "")} · ${downText(f.dn, f.yd)} · ${marginText(f.mg)}`, v1: String(f.w), v2: money(f.c), head: i })),
		}
	}
	return null
}

function penaltySpec(ctx: Ctx, ty: string): FlagsCardSpec | null {
	const all = typeRows(ctx.file.flags)
	const row = all.find((r) => typeSlug(r.type) === ty)
	if (!row) return null
	const flags = ctx.file.flags.filter((f) => f.ty === row.type)
	const teams = new Map<string, number>()
	for (const f of flags) teams.set(f.t, (teams.get(f.t) ?? 0) + 1)
	const people = playerRows(flags, ctx.roster).slice(0, 3)
	const worst = costliest(flags, 1)[0]
	return {
		...base(ctx, "#f2c14e", people.map((r) => headOf(ctx.roster[r.key], r.label, r.team))),
		kind: "penalty",
		name: row.type,
		stats: { flags: String(row.flags), yards: row.avgYards.toFixed(1), avg: money(row.avg), costly: String(row.costly) },
		bars: downBars(flags),
		teams: Array.from(teams, ([t, n]) => ({ t, n }))
			.sort((a, b) => b.n - a.n || a.t.localeCompare(b.t))
			.slice(0, 3)
			.map((x) => ({ label: teamName(x.t), value: String(x.n) })),
		people: people.map((r, i) => ({ head: i, value: String(r.flags) })),
		worst: worst ? `${flagLine(worst)}${worst.tg.length ? " · counts like a turnover" : ""}` : null,
		note: null,
	}
}

function situationSpec(ctx: Ctx, dimId: string, team: string | undefined): FlagsCardSpec | null {
	const dim = dimension(dimId)
	if (!dim) return null
	if (team && !ABBRS.includes(team)) return null
	const flags = team ? ctx.file.flags.filter((f) => f.t === team) : ctx.file.flags
	const rows = situationMix(flags, dim, baselineOf(ctx.file.flags), 20)
	const maxShare = Math.max(0.01, ...rows.map((r) => r.share))
	const subject = team ? `The ${teamNick(team)}` : "The whole league"
	const stand = team ? standout(rows) : null
	const costliestRow = rows.filter((r) => r.flags >= 10).sort((a, b) => b.avg - a.avg)[0]
	return {
		...base(ctx, team ? teamColor(team) : "#f2c14e"),
		kind: "situation",
		question: dim.question,
		subject,
		label: dim.label,
		total: `${flags.length} flags`,
		rows: rows.map((r): Bar => ({
			label: r.label,
			value: `${Math.round(r.share * 100)}%`,
			frac: r.share / maxShare,
			hot: r.index != null && r.index >= 1.4,
			note: r.flags ? `${r.flags} ${r.flags === 1 ? "flag" : "flags"} · ${r.avg.toFixed(1)} points each${r.index != null ? ` · ${r.index.toFixed(1)}× the league` : ""}${r.top[0] ? ` · most: ${r.top[0].type}` : ""}` : "None",
		})),
		standout: stand
			? `${subject} get ${stand.index!.toFixed(1)}× as many flags as the league does ${dim.id === "score" ? `when ${stand.label.toLowerCase()}` : `in this spot: ${stand.label.toLowerCase()}`}. ${stand.top[0] ? `Most often: ${stand.top[0].type}.` : ""}`.trim()
			: costliestRow
				? `Flags cost the most ${dim.id === "score" ? `when ${costliestRow.label.toLowerCase()}` : `here: ${costliestRow.label.toLowerCase()}`}: ${costliestRow.avg.toFixed(1)} points each.`
				: null,
	}
}

/** The card for a view, or null when the data has no such flag, team, player or penalty. */
export function buildFlagsSpec(view: FlagsView, size: ShareSize): FlagsCardSpec | null {
	const file = (view.season ? flagSeason(view.season) : undefined) ?? getFlagFiles()[0]
	if (!file) return null
	const ctx: Ctx = { file, size, roster: getRoster().byId }
	switch (view.kind) {
		case "flag":
			return flagSpec(ctx, view.id ?? "")
		case "team":
			return teamSpec(ctx, view.team ?? "")
		case "player":
			return playerSpec(ctx, view.slug ?? "")
		case "compare":
			return compareSpec(ctx, view.a ?? "", view.b ?? "")
		case "board":
			return boardSpec(ctx, view.board ?? "")
		case "penalty":
			return penaltySpec(ctx, view.ty ?? "")
		case "situation":
			return situationSpec(ctx, view.dim ?? "score", view.team)
	}
}
