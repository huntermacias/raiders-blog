// The penalty flags page (/lab/flags): the sums, rankings and wording, in one place. Pure: no imports, no data, no clock, so the server pages and the
// browser components use the same code. The file is built by scripts/lab/build_flags.py, whose docstring explains who gets a flag and how it is costed.

export type FlagKind = "player" | "qb" | "team"
export type FlagTag = "gift" | "wipedTurnover" | "wipedTouchdown" | "big"

/** One accepted penalty. Short keys, because there are about 3,500 of them a season in the file. */
export type Flag = {
	id: string
	/** Week, game id and date (YYYY-MM-DD). */
	w: number
	g: string
	d: string
	/** The team that committed it, and the opponent. */
	t: string
	o: string
	/** 1 when the committing team was at home. */
	hm: 0 | 1
	/** Quarter, game clock, down (null on kicks and tries), yards to go, field position as the feed spells it ("LV 38", "MID 50"). */
	q: number
	tm: string
	dn: number | null
	yd: number | null
	fp: string | null
	/** Score margin from the committing team's side before the play. */
	mg: number
	/** Penalty name and yards. */
	ty: string
	yds: number
	/** 1 when it gave the offense an automatic first down. */
	au: 0 | 1
	/** 1 when the flag wiped out the play (a no-play). */
	np: 0 | 1
	/** Whose unit committed it. */
	u: "offense" | "defense" | "special"
	/** What the snap was: pass, run, punt, kickoff, fg, xp, or snap (a flag before the ball was snapped). */
	pl: string
	/** Expected points the flag took from the committing team (positive is bad). */
	c: number
	/** Change in the committing team's win probability, in percent points (negative is bad). */
	wp: number | null
	tg: FlagTag[]
	/** Who gets it: a named player, the team's quarterback (delay of game), or the team and its coaches. */
	ck: FlagKind
	pid: string | null
	pn: string | null
	ds: string
}

export type FlagPlayer = { n: string; t: string; p: string | null; s: string }

export type FlagFile = {
	season: number
	week: number
	generatedAt: string
	source: string
	turnoverCost: number
	bigShare: number
	players: Record<string, FlagPlayer>
	flags: Flag[]
}

export const TAG_INFO: Record<FlagTag, { label: string; short: string; what: string }> = {
	gift: {
		label: "Gift first down",
		short: "Gift",
		what: "The defense's flag gave the offense a first down on fourth down, so a team that was about to give the ball up kept it. Roughing or running into the kicker is the classic case.",
	},
	wipedTurnover: {
		label: "Wiped out a takeaway",
		short: "Takeaway erased",
		what: "The defense had taken the ball away, and its own flag took it back. The interception or fumble recovery did not count. The cost shown is only what the flag did from the snap; the takeaway it erased was worth about as much again.",
	},
	wipedTouchdown: {
		label: "Wiped out a touchdown",
		short: "Touchdown erased",
		what: "The team's own flag cancelled its touchdown. The cost shown is only what the flag did from the snap; the points it took off the board are not in it.",
	},
	big: {
		label: "Cost like a turnover",
		short: "Turnover-sized",
		what: "The flag took away at least 60% of what an average turnover costs. It did the damage of most of a giveaway.",
	},
}

/** Tags in the order a reader should see them. */
export const TAG_ORDER: FlagTag[] = ["wipedTouchdown", "wipedTurnover", "gift", "big"]

/** What an average giveaway costs in expected points; the file carries the number it was built with. */
export const TURNOVER_COST = 4.4

export const isTurnoverLike = (f: Flag): boolean => f.tg.length > 0

/** The flag's cost in turnovers: 1.0 is what an average interception or lost fumble costs. */
export const turnoversOf = (cost: number, per: number = TURNOVER_COST): number => (per > 0 ? cost / per : 0)

export const KIND_LABEL: Record<FlagKind, string> = { player: "Player", qb: "Quarterback", team: "Team and coaches" }

export const SEASONS_LABEL = (s: number) => `${s} season`

// ----- Wording -----

const ORD = ["", "1st", "2nd", "3rd", "4th"]

/** "4th & 5", "1st & 10", or "Kick" when there was no down. */
export function downText(dn: number | null, yd: number | null): string {
	if (!dn || dn < 1 || dn > 4) return "No down"
	return yd == null ? ORD[dn] : `${ORD[dn]} & ${yd}`
}

export const downName = (dn: number | null): string => (dn && dn >= 1 && dn <= 4 ? ORD[dn] : "Kicks")

/** "Q3 8:12". Overtime is "OT". */
export const clockText = (f: Pick<Flag, "q" | "tm">): string => `${f.q > 4 ? "OT" : `Q${f.q}`} ${f.tm.replace(/^0/, "")}`

export function marginText(mg: number): string {
	if (mg === 0) return "tied"
	return mg > 0 ? `up ${mg}` : `down ${-mg}`
}

/** "vs LV" at home or "at LV" on the road: the game from the committing team's side. */
export const versus = (f: Pick<Flag, "hm" | "o">): string => `${f.hm ? "vs" : "at"} ${f.o}`

/** What the flag did, in a sentence, in the order of how much it matters. */
export function resultLine(f: Flag): string {
	const bits: string[] = []
	if (f.tg.includes("wipedTouchdown")) bits.push("Wiped out its own touchdown")
	if (f.tg.includes("wipedTurnover")) bits.push("Wiped out its own takeaway")
	if (f.tg.includes("gift")) bits.push("Gave the other team a first down on 4th down")
	if (!bits.length) {
		if (f.u === "defense") bits.push(f.yds ? `Gave the offense ${f.yds} yards${f.au ? " and a first down" : ""}` : f.au ? "Gave the offense a first down" : "Replayed the down")
		else if (f.np) bits.push(f.yds ? `Lost ${f.yds} yards and replayed the down` : "Replayed the down")
		else bits.push(f.yds ? `Lost ${f.yds} yards` : "Enforced")
	}
	return bits.join(" · ")
}

/** Cost in expected points, signed from the committing team's side: "-2.9 pts". */
export const costText = (c: number): string => `${c <= -0.05 ? "+" : c >= 0.05 ? "-" : ""}${Math.abs(c).toFixed(1)} pts`

export const turnoversText = (c: number, per: number = TURNOVER_COST): string => {
	const t = turnoversOf(c, per)
	return `${t.toFixed(t >= 10 ? 0 : 1)} turnover${Math.abs(t - 1) < 0.05 ? "" : "s"}`
}

// ----- Sums -----

export type Totals = {
	flags: number
	yards: number
	cost: number
	/** Flags with any turnover-like tag. */
	costly: number
	gifts: number
	wipedTurnovers: number
	wipedTouchdowns: number
	big: number
	/** Cost of just the turnover-like flags. */
	costlyCost: number
}

export function totals(flags: readonly Flag[]): Totals {
	const t: Totals = { flags: 0, yards: 0, cost: 0, costly: 0, gifts: 0, wipedTurnovers: 0, wipedTouchdowns: 0, big: 0, costlyCost: 0 }
	for (const f of flags) {
		t.flags++
		t.yards += f.yds
		t.cost += f.c
		if (f.tg.length) {
			t.costly++
			t.costlyCost += f.c
		}
		if (f.tg.includes("gift")) t.gifts++
		if (f.tg.includes("wipedTurnover")) t.wipedTurnovers++
		if (f.tg.includes("wipedTouchdown")) t.wipedTouchdowns++
		if (f.tg.includes("big")) t.big++
	}
	t.cost = round(t.cost)
	t.costlyCost = round(t.costlyCost)
	return t
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export type Group = { key: string; label: string; flags: number; yards: number; cost: number; costly: number }

function group(flags: readonly Flag[], key: (f: Flag) => string | null, label: (k: string) => string): Group[] {
	const m = new Map<string, Group>()
	for (const f of flags) {
		const k = key(f)
		if (k == null) continue
		let g = m.get(k)
		if (!g) m.set(k, (g = { key: k, label: label(k), flags: 0, yards: 0, cost: 0, costly: 0 }))
		g.flags++
		g.yards += f.yds
		g.cost += f.c
		if (f.tg.length) g.costly++
	}
	return Array.from(m.values()).map((g) => ({ ...g, cost: round(g.cost) }))
}

/** By down: 1st to 4th, then kicks (which have no down). Always all five, so the rows do not jump around. */
export function byDown(flags: readonly Flag[]): Group[] {
	const got = new Map(group(flags, (f) => String(f.dn && f.dn >= 1 && f.dn <= 4 ? f.dn : 0), (k) => downName(Number(k) || null)).map((g) => [g.key, g]))
	return ["1", "2", "3", "4", "0"].map((k) => got.get(k) ?? { key: k, label: downName(Number(k) || null), flags: 0, yards: 0, cost: 0, costly: 0 })
}

/** By penalty name, the costliest first. */
export const byType = (flags: readonly Flag[]): Group[] => group(flags, (f) => f.ty, (k) => k).sort((a, b) => b.cost - a.cost || b.flags - a.flags)

/** By opponent, the costliest first. */
export const byOpponent = (flags: readonly Flag[]): Group[] => group(flags, (f) => f.o, (k) => k).sort((a, b) => b.cost - a.cost || b.flags - a.flags)

/** By week, in order. */
export const byWeek = (flags: readonly Flag[]): Group[] => group(flags, (f) => String(f.w), (k) => `Week ${k}`).sort((a, b) => Number(a.key) - Number(b.key))

export type Row = Group & {
	team: string
	pos: string | null
	slug: string | null
	kind: FlagKind
	/** Delay-of-game flags charged to a quarterback, inside `flags`. */
	delay: number
	gifts: number
	wiped: number
	/** Fourth-down flags, the ones that decide a drive. */
	fourth: number
}

/** One row per player who got a flag, the costliest first. Team-and-coach flags are left out; see teamFlags. */
export function playerRows(flags: readonly Flag[], players: Record<string, FlagPlayer>): Row[] {
	const m = new Map<string, Row>()
	for (const f of flags) {
		if (f.ck === "team" || !f.pid) continue
		let r = m.get(f.pid)
		const p = players[f.pid]
		if (!r) {
			r = {
				key: f.pid,
				label: p?.n ?? f.pn ?? "Unknown",
				team: p?.t ?? f.t,
				pos: p?.p ?? null,
				slug: p?.s ?? null,
				kind: f.ck,
				flags: 0,
				yards: 0,
				cost: 0,
				costly: 0,
				delay: 0,
				gifts: 0,
				wiped: 0,
				fourth: 0,
			}
			m.set(f.pid, r)
		}
		r.flags++
		r.yards += f.yds
		r.cost += f.c
		if (f.tg.length) r.costly++
		if (f.ck === "qb") r.delay++
		if (f.tg.includes("gift")) r.gifts++
		if (f.tg.includes("wipedTurnover") || f.tg.includes("wipedTouchdown")) r.wiped++
		if (f.dn === 4) r.fourth++
		// A player who changed teams carries the team he was on for the latest flag.
		r.team = p?.t ?? f.t
	}
	return Array.from(m.values()).map((r) => ({ ...r, cost: round(r.cost) })).sort((a, b) => b.cost - a.cost || b.flags - a.flags || a.label.localeCompare(b.label))
}

export type TeamRow = Group & { team: string; gifts: number; wiped: number; teamFlags: number }

/** One row per team, the costliest first. Every team in `all` is listed, even one with no flags yet. */
export function teamRows(flags: readonly Flag[], all: readonly string[]): TeamRow[] {
	const m = new Map<string, TeamRow>(all.map((t) => [t, { key: t, label: t, team: t, flags: 0, yards: 0, cost: 0, costly: 0, gifts: 0, wiped: 0, teamFlags: 0 }]))
	for (const f of flags) {
		const r = m.get(f.t)
		if (!r) continue
		r.flags++
		r.yards += f.yds
		r.cost += f.c
		if (f.tg.length) r.costly++
		if (f.tg.includes("gift")) r.gifts++
		if (f.tg.includes("wipedTurnover") || f.tg.includes("wipedTouchdown")) r.wiped++
		if (f.ck === "team") r.teamFlags++
	}
	return Array.from(m.values()).map((r) => ({ ...r, cost: round(r.cost) })).sort((a, b) => b.cost - a.cost || b.flags - a.flags || a.team.localeCompare(b.team))
}

/** The costliest flags first. Ties go to the later one. */
export const costliest = (flags: readonly Flag[], n: number): Flag[] => [...flags].sort((a, b) => b.c - a.c || b.d.localeCompare(a.d) || b.id.localeCompare(a.id)).slice(0, n)

/** The turnover-like flags, the newest first: the feed a fan checks after a game. */
export const latestCostly = (flags: readonly Flag[], n: number): Flag[] => newest(flags.filter(isTurnoverLike)).slice(0, n)

export const newest = (flags: readonly Flag[]): Flag[] => [...flags].sort((a, b) => b.w - a.w || b.d.localeCompare(a.d) || b.g.localeCompare(a.g) || playOf(b) - playOf(a))

/** The play number inside the game, from the id ("2026_01_NE_SEA-111"). */
export const playOf = (f: Pick<Flag, "id">): number => Number(f.id.slice(f.id.lastIndexOf("-") + 1)) || 0

/** Rank (1 = the most flag cost) of a team in a list from teamRows; 0 when absent. */
export const rankOf = (rows: readonly { team: string }[], team: string): number => rows.findIndex((r) => r.team === team) + 1

// ----- Filters -----

export type Filter = { down: number | null; costlyOnly: boolean; kind: FlagKind | null; type: string | null }
export const NO_FILTER: Filter = { down: null, costlyOnly: false, kind: null, type: null }

export function applyFilter(flags: readonly Flag[], f: Filter): Flag[] {
	return flags.filter((x) => {
		if (f.costlyOnly && !x.tg.length) return false
		if (f.down != null && (f.down === 0 ? !(x.dn == null || x.dn < 1 || x.dn > 4) : x.dn !== f.down)) return false
		if (f.kind && x.ck !== f.kind) return false
		if (f.type && x.ty !== f.type) return false
		return true
	})
}

// ----- Paths and names -----

export const FLAGS_PATH = "/lab/flags"
export const teamFlagsHref = (abbr: string) => `${FLAGS_PATH}/team/${abbr.toLowerCase()}`
export const playerFlagsHref = (slug: string) => `${FLAGS_PATH}/player/${slug}`

/** A flag's culprit as the page names him: "J. Smith", "J. Smith (delay of game)" or "Team and coaches". */
export function culpritText(f: Flag): string {
	if (f.ck === "team") return "Team and coaches"
	const n = f.pn ?? "Unknown"
	return f.ck === "qb" ? `${n} (quarterback)` : n
}

/** The one line a share or a screen reader gets for a flag. */
export function flagSummary(f: Flag): string {
	return `${f.t} ${f.ty}, ${culpritText(f)}, ${downText(f.dn, f.yd)}${f.fp ? ` at ${f.fp}` : ""}, week ${f.w} ${versus(f)}: ${resultLine(f)}, ${costText(f.c)}`
}

/** The newest season in the files that has any flags. */
export function latestSeason(files: readonly Pick<FlagFile, "season" | "flags">[]): number | null {
	const withFlags = files.filter((f) => f.flags.length).map((f) => f.season)
	return withFlags.length ? Math.max(...withFlags) : null
}

/** One group per game, in week order, labelled "Wk 5 at KC". */
export const byGame = (flags: readonly Flag[]): Group[] => {
	const label = new Map(flags.map((f) => [f.g, `Wk ${f.w} ${versus(f)}`]))
	return group(flags, (f) => f.g, (k) => label.get(k) ?? k).sort((a, b) => a.key.localeCompare(b.key))
}
