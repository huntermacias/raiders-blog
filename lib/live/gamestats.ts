// Turns ESPN's finished-game summary (box score, team stats, line score) into the same rows a game
// report keeps by hand, and merges them with whatever the writer typed in Studio. The writer's rows
// always win: a row they typed replaces the ESPN row for the same stat / quarter / player, and rows
// ESPN has no match for are kept. Pure, so it can be tested with a saved sample.

import { siteAbbr } from "./espn"

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null)
const num = (v: unknown): number => {
	const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""))
	return Number.isFinite(n) ? n : 0
}

export type AutoStats = {
	espnId: string
	teamStats: TeamStatRow[]
	quarterScores: QuarterScoreRow[]
	playerStats: PlayerStatRow[]
}

type StatCategory = PlayerStatRow["category"]
type Cand = { category: StatCategory; player: string; line: string; impact: number }

/** Team stat rows in the order they are shown: [ESPN stat name, label]. */
const TEAM_STATS: [string, string][] = [
	["totalYards", "Total Yards"],
	["netPassingYards", "Passing Yards"],
	["rushingYards", "Rushing Yards"],
	["yardsPerPlay", "Yards Per Play"],
	["firstDowns", "First Downs"],
	["thirdDownEff", "3rd Down"],
	["fourthDownEff", "4th Down"],
	["redZoneAttempts", "Red Zone"],
	["turnovers", "Turnovers"],
	["totalPenaltiesYards", "Penalties"],
	["possessionTime", "Time of Possession"],
]

function teamStatRows(box: Obj, raidersId: string, oppId: string): TeamStatRow[] {
	const teams = arr(box.teams).map(obj)
	const pick = (id: string) => teams.find((t) => str(obj(t.team).id) === id)
	const r = pick(raidersId)
	const o = pick(oppId)
	if (!r || !o) return []
	const val = (t: Obj, name: string) => {
		const s = arr(t.statistics).map(obj).find((x) => str(x.name) === name)
		return s ? str(s.displayValue) : null
	}
	return TEAM_STATS.flatMap(([name, label], i) => {
		const rv = val(r, name)
		const ov = val(o, name)
		return rv != null && ov != null ? [{ _key: `auto-ts-${i}`, stat: label, raiders: rv, opponent: ov }] : []
	})
}

function quarterRows(raiders: Obj, opp: Obj): QuarterScoreRow[] {
	const a = arr(raiders.linescores).map(obj)
	const b = arr(opp.linescores).map(obj)
	const n = Math.max(a.length, b.length)
	return Array.from({ length: n }, (_, i) => ({
		_key: `auto-q-${i}`,
		quarter: (i < 4 ? `Q${i + 1}` : "OT") as QuarterScoreRow["quarter"],
		raiders: num(a[i]?.displayValue ?? a[i]?.value),
		opponent: num(b[i]?.displayValue ?? b[i]?.value),
	})).filter((q, i, all) => i < 4 || i === all.findIndex((x) => x.quarter === "OT")) // one combined OT column is enough
}

type Athlete = { name: string; s: Record<string, string> }
function athletes(group: Obj): Athlete[] {
	const labels = arr(group.labels).map((l) => String(l))
	return arr(group.athletes).map(obj).flatMap((a) => {
		const name = str(obj(a.athlete).displayName) ?? str(obj(a.athlete).shortName)
		if (!name) return []
		const stats = arr(a.stats)
		const s: Record<string, string> = {}
		labels.forEach((l, i) => (s[l] = String(stats[i] ?? "")))
		return [{ name, s }]
	})
}

function playerCandidates(team: Obj): Cand[] {
	const groups = new Map<string, Athlete[]>()
	for (const g of arr(team.statistics).map(obj)) groups.set(String(g.name), athletes(g))
	const out: Cand[] = []
	const g = (n: string) => groups.get(n) ?? []

	for (const a of g("passing")) {
		const sacks = num(a.s["SACKS"]?.split("-")[0])
		const line = [`${a.s["C/ATT"]}`, `${a.s["YDS"]} YDS`, `${a.s["TD"]} TD`, num(a.s["INT"]) > 0 ? `${a.s["INT"]} INT` : "", sacks > 0 ? `${sacks} sacked` : ""].filter(Boolean).join(", ")
		out.push({ category: "Passing", player: a.name, line, impact: num(a.s["YDS"]) + num(a.s["TD"]) * 20 - num(a.s["INT"]) * 20 })
	}
	for (const a of [...g("rushing")].sort((x, y) => num(y.s["YDS"]) - num(x.s["YDS"])).slice(0, 3)) {
		const line = [`${a.s["CAR"]} CAR`, `${a.s["YDS"]} YDS`, num(a.s["TD"]) > 0 ? `${a.s["TD"]} TD` : "", `long ${a.s["LONG"]}`].filter(Boolean).join(", ")
		out.push({ category: "Rushing", player: a.name, line, impact: num(a.s["YDS"]) + num(a.s["TD"]) * 20 })
	}
	for (const a of [...g("receiving")].sort((x, y) => num(y.s["YDS"]) - num(x.s["YDS"])).slice(0, 4)) {
		const line = [`${a.s["REC"]} REC`, `${a.s["YDS"]} YDS`, num(a.s["TD"]) > 0 ? `${a.s["TD"]} TD` : "", a.s["TGTS"] ? `${a.s["TGTS"]} TGT` : ""].filter(Boolean).join(", ")
		out.push({ category: "Receiving", player: a.name, line, impact: num(a.s["YDS"]) + num(a.s["TD"]) * 20 })
	}

	const picks = new Map(g("interceptions").map((a) => [a.name, num(a.s["INT"])]))
	const defenders = g("defensive").map((a) => {
		const tot = num(a.s["TOT"])
		const sacks = num(a.s["SACKS"])
		const tfl = num(a.s["TFL"])
		const pd = num(a.s["PD"])
		const ints = picks.get(a.name) ?? 0
		const line = [`${tot} TOT`, sacks > 0 ? `${sacks} ${sacks === 1 ? "SACK" : "SACKS"}` : "", tfl > 0 ? `${tfl} TFL` : "", ints > 0 ? `${ints} INT` : "", pd > 0 ? `${pd} PD` : ""].filter(Boolean).join(", ")
		return { a, tot, impact: tot + sacks * 4 + ints * 4 + tfl * 2 + pd * 2, line }
	})
	for (const d of defenders.filter((d) => d.tot > 0).sort((x, y) => y.impact - x.impact).slice(0, 4)) {
		out.push({ category: "Defense", player: d.a.name, line: d.line, impact: d.impact * 2.5 })
	}

	for (const a of g("kicking")) {
		const line = [`${a.s["FG"]} FG`, `${a.s["XP"]} XP`, `${a.s["PTS"]} PTS`, num(a.s["LONG"]) > 0 ? `long ${a.s["LONG"]}` : ""].filter(Boolean).join(", ")
		out.push({ category: "Special Teams", player: a.name, line, impact: 0 })
	}
	for (const a of g("punting")) {
		const line = [`${a.s["NO"]} punts`, `${a.s["AVG"]} avg`, num(a.s["In 20"]) > 0 ? `${a.s["In 20"]} inside the 20` : ""].filter(Boolean).join(", ")
		out.push({ category: "Special Teams", player: a.name, line, impact: 0 })
	}
	for (const [key, label] of [["kickReturns", "KR"], ["puntReturns", "PR"]] as const) {
		for (const a of g(key)) {
			if (num(a.s["TD"]) === 0 && num(a.s["LONG"]) < 40) continue
			const line = [`${a.s["NO"]} ${label}`, `${a.s["YDS"]} YDS`, num(a.s["TD"]) > 0 ? `${a.s["TD"]} TD` : "", `long ${a.s["LONG"]}`].filter(Boolean).join(", ")
			out.push({ category: "Special Teams", player: a.name, line, impact: num(a.s["TD"]) * 40 })
		}
	}
	return out
}

/**
 * Reads a finished game's summary from the Raiders' point of view. Returns null when the game isn't
 * over yet or the feed doesn't have the Raiders in it, so half-played stats never reach the page.
 */
export function parseGameStats(json: unknown, team = "LV"): AutoStats | null {
	const root = obj(json)
	const header = obj(arr(obj(root.header).competitions)[0])
	if (obj(obj(header.status).type).completed !== true) return null
	const sides = arr(header.competitors).map(obj)
	const mine = sides.find((c) => siteAbbr(str(obj(c.team).abbreviation)) === team)
	const theirs = sides.find((c) => c !== mine)
	if (!mine || !theirs) return null
	const myId = str(obj(mine.team).id)
	const theirId = str(obj(theirs.team).id)
	if (!myId || !theirId) return null

	const box = obj(root.boxscore)
	const myPlayers = arr(box.players).map(obj).find((t) => str(obj(t.team).id) === myId)
	const cands = myPlayers ? playerCandidates(myPlayers) : []
	// The three biggest games get the "Game Leaders" highlight cards.
	const stars = new Set([...cands].filter((c) => c.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3))

	return {
		espnId: str(obj(root.header).id) ?? "",
		teamStats: teamStatRows(box, myId, theirId),
		quarterScores: quarterRows(mine, theirs),
		playerStats: cands.map((c, i) => ({ _key: `auto-p-${i}`, category: c.category, player: c.player, line: c.line, standout: stars.has(c) })),
	}
}

const norm = (s: string | undefined | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/
/** "Kenneth Walker III" and "K. Walker" are the same player: key on the last real name word. */
const lastName = (s: string) => {
	const words = s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w && !SUFFIX.test(w))
	return words[words.length - 1] ?? ""
}

/** Replace in place when the writer has a row for the same thing, then append their other rows. */
function overlay<T extends { _key: string }>(auto: T[], manual: T[], keyOf: (r: T) => string): T[] {
	const mine = new Map<string, T>()
	for (const m of manual) mine.set(keyOf(m), m)
	const used = new Set<string>()
	const merged = auto.map((a) => {
		const k = keyOf(a)
		const m = mine.get(k)
		if (!m) return a
		used.add(k)
		return m
	})
	for (const m of manual) if (!used.has(keyOf(m))) merged.push(m)
	return merged
}

export type ReportStats = { teamStats: TeamStatRow[]; quarterScores: QuarterScoreRow[]; playerStats: PlayerStatRow[]; fromEspn: boolean }

/** ESPN's rows with the writer's overlaid. With no ESPN data the writer's own rows pass through untouched. */
export function mergeStats(
	manual: { teamStats?: TeamStatRow[] | null; quarterScores?: QuarterScoreRow[] | null; playerStats?: PlayerStatRow[] | null },
	auto: AutoStats | null
): ReportStats {
	const m = { teamStats: manual.teamStats ?? [], quarterScores: manual.quarterScores ?? [], playerStats: manual.playerStats ?? [] }
	if (!auto) return { ...m, fromEspn: false }

	// If the writer flagged their own standouts, ESPN's picks step aside.
	const manualStars = m.playerStats.some((p) => p.standout)
	const autoPlayers = manualStars ? auto.playerStats.map((p) => ({ ...p, standout: false })) : auto.playerStats

	return {
		teamStats: overlay(auto.teamStats, m.teamStats, (r) => norm(r.stat)),
		quarterScores: overlay(auto.quarterScores, m.quarterScores, (r) => norm(r.quarter)),
		playerStats: overlay(autoPlayers, m.playerStats, (r) => `${norm(r.category)}|${lastName(r.player)}`),
		fromEspn: true,
	}
}
