// What the Lab hub (/lab) says this week, worked out from the Lab's own data files. Three things come out of it:
//
//  - "drops": a handful of findings, each one sentence and one number, written from the data (the Raiders' playoff odds, the player who
//    moved the most, the best and worst of the Raiders' position groups, the biggest play of the season, the closest past season);
//  - "takes": head-to-head arguments the numbers can settle (two players, the reader picks first, then the Lab answers);
//  - a "pulse": the few numbers a returning reader is shown the change in ("Since you were last here").
//
// Pure: the page loads the data and hands it in, so every sentence here can be tested without a clock or a file.

import { isV2Site } from "./labMethod"
import { buildComparison, featuredDebates } from "./compareKit"
import { CONFIDENCE_WORD, GROUP_META, HEADLINE, type PlayerGroup, type PlayerRow, type PlayersData, BOX, describeMove, formatBox, formatStat, gradeScore, hasOverall, headshotUrl, initialsOf, isEarly, moveText, ordinal, risersFallers, shotUrl, standouts, contextLine, confidenceOf } from "./playersKit"
import { type TopPlay, playSentence, playWord, swingText, whenText } from "./topPlays"
import { teamNick } from "./playerView"
import { twinsQuery } from "./twinsShare"
import { type TwinsResult, twinStory } from "./twinsKit"
import { GROUPS, type GroupKey, GROUP_ORDER as UNIT_ORDER, type UnitsData } from "./unitsKit"

export const HUB_TEAM = "LV"

export type DropKind = "odds" | "riser" | "faller" | "standout" | "units" | "play" | "twin"

export type Face = { name: string; initials: string; team: string; headshot: string | null; espn?: number; shot?: string }

/** What the Share button on a card needs: the card's route and query, the page a shared link opens, and the words that go with it. */
export type DropShare = { type: string; query: string; linkQuery?: string; sharePath: string; name: string; file: string; text: string; alt: string; campaign?: string }

export type Drop = {
	id: string
	kind: DropKind
	/** The tool it comes from, as its name in the Lab's list. */
	tool: string
	/** The tool's id in lib/lab/tools.ts, for linking. */
	toolId: string
	kicker: string
	headline: string
	detail: string
	stat: { value: string; label: string } | null
	tone: "up" | "down" | "flat" | "neutral"
	href: string
	cta: string
	face: Face | null
	share: DropShare
}

// ---------------------------------------------------------------------------------------------- input

/** The Rooting Guide's view of the Raiders, in the few fields the hub reads. Mirrors RootingSnapshot in lib/homeLab.ts. */
export type OddsIn = {
	nick: string
	goalPhrase: string
	goal: string
	week: number | null
	status: "live" | "clinched" | "out"
	pct: string
	baseline: number
	change: { text: string; dir: "up" | "down" | "flat"; since: string } | null
	best: { rootFor: string; against: string; forNick: string; againstNick: string; matchup: string; swing: string; small: boolean } | null
	href: string
	updatedAt?: string
}

export type PlayIn = Pick<TopPlay, "swing" | "type" | "text" | "td" | "yards" | "q" | "clock" | "oppName" | "week" | "rank">

export type HubInput = {
	players: PlayersData
	units: UnitsData
	odds: OddsIn | null
	/** The biggest play of the season, if there is one. */
	play: PlayIn | null
	/** The closest past season, if the Raiders have played enough games to have one. */
	twin: { result: TwinsResult; season: number } | null
	/** The Raiders' next game on the slate. */
	next: { opp: string; venue: "vs" | "at"; spread: number | null } | null
	/** A stamp that changes when the data does (milliseconds). */
	stamp: number
}

const faceOf = (p: PlayerRow): Face => ({
	name: p.name,
	initials: initialsOf(p.name),
	team: p.team,
	headshot: p.espn ? headshotUrl(p.espn) : p.shot ? shotUrl(p.shot) : null,
	espn: p.espn,
	shot: p.shot,
})

const lastName = (name: string) => name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").split(/\s+/).slice(-1)[0] ?? name

const playerShare = (p: PlayerRow, text: string, kind: string): DropShare => ({
	type: "player",
	query: `slug=${p.slug}`,
	linkQuery: "",
	sharePath: `/lab/players/${p.slug}`,
	name: p.name,
	file: `raiders-rundown-${p.slug}`,
	text,
	alt: `${p.name}: grade, league-best badges and strongest numbers (${kind})`,
	campaign: "lab_hub",
})

// ---------------------------------------------------------------------------------------------- the drops

/** The Raiders' position groups, best first and worst first, by their league rank. */
export function unitRanks(units: UnitsData, team = HUB_TEAM): { group: GroupKey; label: string; rank: number; of: number }[] {
	const t = units.teams[team]
	if (!t) return []
	const of = Object.keys(units.teams).length
	return UNIT_ORDER.filter((g) => t.groups[g] && typeof t.groups[g].rank === "number").map((g) => ({ group: g, label: GROUPS[g].label, rank: t.groups[g].rank, of }))
}

function oddsDrop(o: OddsIn): Drop {
	const settled = o.status !== "live"
	const headline = o.status === "clinched" ? `The ${o.nick} have clinched.` : o.status === "out" ? `The ${o.nick} are out of the playoff race.` : `The ${o.nick} have a ${o.pct} chance to ${o.goalPhrase}.`
	const pts = o.change ? /[\d.]+/.exec(o.change.text)?.[0] : null
	const move = o.change && o.change.dir !== "flat" && pts ? `${o.change.dir === "up" ? "Up" : "Down"} ${pts} ${pts === "1" ? "point" : "points"} ${o.change.since}.` : o.change ? `Unchanged ${o.change.since}.` : ""
	const root = o.best && !o.best.small ? `Biggest game to watch: ${o.best.matchup}, root for the ${o.best.forNick} (a ${o.best.swing} for the ${o.nick}).` : ""
	return {
		id: "odds",
		kind: "odds",
		tool: "Sunday Rooting Guide",
		toolId: "rooting-guide",
		kicker: "The playoff race",
		headline,
		detail: [move, root].filter(Boolean).join(" ") || "Every game still to play, ranked by how much it moves the Raiders.",
		stat: settled ? null : { value: o.pct, label: `to ${o.goalPhrase}` },
		tone: o.change?.dir === "up" ? "up" : o.change?.dir === "down" ? "down" : "neutral",
		href: o.href,
		cta: "Open the Rooting Guide",
		face: null,
		share: {
			type: "rooting",
			query: `team=${HUB_TEAM}&goal=${o.goal}${o.week ? `&week=${o.week}` : ""}`,
			sharePath: "/lab/rooting-guide",
			name: `${o.nick} rooting guide`,
			file: `raiders-rundown-rooting-${HUB_TEAM.toLowerCase()}-${o.goal}`,
			text: settled ? headline : `${headline} Here is what to root for.`,
			alt: `The ${o.nick}' playoff odds and the games to root in`,
			campaign: "lab_hub",
		},
	}
}

type MoverFlavor = "league" | "raider"

function moverDrop(data: PlayersData, p: PlayerRow, dir: "up" | "down", flavor: MoverFlavor): Drop {
	const score = p.mover?.score ?? 0
	const nick = teamNick(p.team)
	const sure = CONFIDENCE_WORD[confidenceOf(p.mover?.z)]
	const job = GROUP_META[p.group].single.toLowerCase()
	const headline =
		flavor === "raider"
			? `${p.name} is ${dir === "up" ? "heating up" : "cooling off"}: ${moveText(score)} grade points over his last games.`
			: `${p.name} (${nick}) is the ${job} ${dir === "up" ? "climbing" : "sliding"} fastest in the league.`
	const move = describeMove(data, p)
	return {
		id: flavor === "raider" ? `raider-${dir}` : dir === "up" ? "riser" : "faller",
		kind: dir === "up" ? "riser" : "faller",
		tool: "Player Lab",
		toolId: "players",
		kicker: flavor === "raider" ? (dir === "up" ? "Raider on the rise" : "Raider to watch") : dir === "up" ? "Biggest riser" : "Biggest faller",
		headline,
		detail: `${move || `His grade moved ${moveText(score)} points over his last games.`} ${sure}.`,
		stat: { value: moveText(score), label: "grade points, recent games" },
		tone: dir,
		href: `/lab/players/${p.slug}`,
		cta: `See ${lastName(p.name)}'s profile`,
		face: faceOf(p),
		share: playerShare(p, `${headline} ${move}`.trim(), dir),
	}
}

/** A starter's recent games: someone on the field for at least half the team's snaps, so a move is not one backup's two series. */
const started = (p: PlayerRow) => (p.snaps?.form?.[0] ?? 0) >= 0.5 && (p.snaps?.form?.[1] ?? 0) >= 1

function standoutDrop(data: PlayersData): Drop | null {
	const best = standouts(data, { team: HUB_TEAM, top: 1, hi: 85, minSure: "growing" }).best[0]
	if (!best) return null
	const { player: p, stat, ctx } = best
	const nick = teamNick(p.team)
	const value = formatStat(p.group, stat.k, ctx.value)
	const place = ctx.rank && ctx.of ? `${ordinal(ctx.rank)} of ${ctx.of} ${GROUP_META[p.group].peers}` : ""
	return {
		id: "standout",
		kind: "standout",
		tool: "Player Lab",
		toolId: "players",
		kicker: `Best number on the ${nick}`,
		headline: `${p.name}'s ${ctx.info.label.toLowerCase()} is ${place ? `${ctx.rank === 1 ? "tops" : place.split(" ")[0] + " best"} among ${GROUP_META[p.group].peers}` : "elite"}.`,
		detail: contextLine(data, p, stat) || (place ? `${value}, ${place}.` : `${value}.`),
		stat: { value, label: ctx.info.label.toLowerCase() },
		tone: "up",
		href: `/lab/players/${p.slug}`,
		cta: `See ${lastName(p.name)}'s profile`,
		face: faceOf(p),
		share: playerShare(p, `${p.name} is ${place || "elite"} in ${ctx.info.label.toLowerCase()}.`, "standout"),
	}
}

function unitsDrop(units: UnitsData): Drop | null {
	const ranks = unitRanks(units)
	if (ranks.length < 4) return null
	const sorted = [...ranks].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
	const best = sorted[0]
	const worst = sorted[sorted.length - 1]
	if (best.group === worst.group) return null
	const headline = `The Raiders' ${best.label.toLowerCase()} is No. ${best.rank} in the league. Their ${worst.label.toLowerCase()} is No. ${worst.rank}.`
	return {
		id: "units",
		kind: "units",
		tool: "How all 32 teams stack up",
		toolId: "teams",
		kicker: "Best and worst unit",
		headline,
		detail: `Seven position groups, ranked against all ${best.of} teams. The ${best.label.toLowerCase()} is the strength; the ${worst.label.toLowerCase()} is the soft spot opponents will look at.`,
		stat: { value: `${ordinal(best.rank)} / ${ordinal(worst.rank)}`, label: "best / worst unit rank" },
		tone: "neutral",
		href: "/lab/teams",
		cta: "See all 32 teams",
		face: null,
		share: {
			type: "board",
			query: `team=${HUB_TEAM}`,
			sharePath: "/lab/teams/share",
			name: "The league board",
			file: "raiders-rundown-position-groups",
			text: headline,
			alt: "Every NFL team's position groups, ranked, with the Raiders marked",
			campaign: "lab_hub",
		},
	}
}

function playDrop(p: PlayIn): Drop {
	const who = p.swing >= 0 ? "Raiders" : p.oppName
	const when = whenText(p)
	const word = playWord(p)
	return {
		id: "play",
		kind: "play",
		tool: "Top plays",
		toolId: "top-plays",
		kicker: "Biggest play of the season",
		headline: `${word}${when ? ` in ${when.replace(" · ", ", ")}` : ""}: ${Math.abs(Math.round(p.swing * 100))} points of win probability for the ${who}.`,
		detail: `Week ${p.week} against the ${p.oppName}. Every snap is worth some win probability; this one is worth the most.`,
		stat: { value: swingText(p).replace(" pts", ""), label: "points of win probability" },
		tone: p.swing >= 0 ? "up" : "down",
		href: "/lab/top-plays",
		cta: "See the top ten plays",
		face: null,
		share: {
			type: "lab",
			query: "slug=season&view=play&rank=1",
			linkQuery: "",
			sharePath: "/lab/top-plays",
			name: "The biggest play of the season",
			file: "raiders-rundown-biggest-play",
			text: `The biggest Raiders play of the season: ${playSentence({ ...p, rank: p.rank ?? 1 } as TopPlay)}`,
			alt: "The biggest Raiders play of the season and how far it moved the win probability",
			campaign: "lab_hub",
		},
	}
}

function twinDrop(t: NonNullable<HubInput["twin"]>): Drop | null {
	const twin = t.result.twins[0]
	if (!twin) return null
	const story = twinStory(twin, t.result.n)
	return {
		id: "twin",
		kind: "twin",
		tool: "Season twins",
		toolId: "season-twins",
		kicker: "Closest season in history",
		headline: `The ${t.season} Raiders look most like the ${twin.label}.`,
		detail: story,
		stat: { value: twin.label, label: "closest past season" },
		tone: "neutral",
		href: "/lab/season-twins",
		cta: "Meet all five twins",
		face: null,
		share: {
			type: "twins",
			query: twinsQuery({ twin: twin.row }),
			sharePath: "/lab/season-twins/share",
			name: "Season twins",
			file: `raiders-season-twins-${twin.row.toLowerCase().replace(" ", "-")}`,
			text: `The ${t.season} Raiders look most like the ${twin.label}. ${story}`,
			alt: `The ${t.season} Raiders laid over the ${twin.label}, stat by stat`,
			campaign: "lab_hub",
		},
	}
}

/**
 * The week's drops, in the order they are shown: the playoff race first (it is the number that moves most), then who is moving, then the
 * Raiders' own strengths, then the long view. A drop with no data behind it is left out; nothing is padded.
 */
export function buildDrops(input: HubInput): Drop[] {
	const out: Drop[] = []
	if (input.odds) out.push(oddsDrop(input.odds))
	// Only changes the numbers lean toward are headlines, and only for players who started: a thin sample is not news.
	const real = (p: PlayerRow) => started(p) && confidenceOf(p.mover?.z) !== "noise"
	const league = risersFallers(input.players, { byConfidence: true, limit: 40 })
	const riser = league.risers.find((p) => real(p) && p.team !== HUB_TEAM) ?? league.risers.find(real)
	const faller = league.fallers.find((p) => real(p) && p.team !== HUB_TEAM && p.slug !== riser?.slug)
	const mine = risersFallers(input.players, { team: HUB_TEAM, byConfidence: true, limit: 12 })
	const raiderMove = [...mine.risers.filter(real), ...mine.fallers.filter(real)].sort((x, y) => Math.abs(y.mover?.z ?? 0) - Math.abs(x.mover?.z ?? 0))[0]
	if (raiderMove) out.push(moverDrop(input.players, raiderMove, (raiderMove.mover?.score ?? 0) >= 0 ? "up" : "down", "raider"))
	if (riser) out.push(moverDrop(input.players, riser, "up", "league"))
	if (faller) out.push(moverDrop(input.players, faller, "down", "league"))
	const st = standoutDrop(input.players)
	if (st) out.push(st)
	const un = unitsDrop(input.units)
	if (un) out.push(un)
	if (input.play) out.push(playDrop(input.play))
	if (input.twin) {
		const tw = twinDrop(input.twin)
		if (tw) out.push(tw)
	}
	return out
}

// ---------------------------------------------------------------------------------------------- the pulse

export type Pulse = {
	/** The week of the numbers. */
	week: number | null
	record: string | null
	/** The Raiders' playoff odds, 0 to 1, when the race is still open. */
	odds: number | null
	oddsText: string | null
	/** Which drops there are: a returning reader is told how many are new. */
	drops: string[]
	/** The stamp the numbers were built under. */
	stamp: number
}

export function buildPulse(input: HubInput, drops: Drop[]): Pulse {
	const t = input.units.teams[HUB_TEAM]
	const o = input.odds
	return {
		week: input.players.week ?? null,
		record: t ? `${t.w}-${t.l}${t.t ? `-${t.t}` : ""}` : null,
		odds: o && o.status === "live" ? o.baseline : null,
		oddsText: o ? o.pct : null,
		// The riser and faller are different people from week to week, so their ids carry the player: a new face is a new drop.
		drops: drops.map((d) => (d.face ? `${d.id}:${d.href.split("/").pop()}` : `${d.id}:${d.stat?.value ?? d.headline.length}`)),
		stamp: input.stamp,
	}
}

export type Since = { lines: string[]; fresh: number; first: boolean }

/**
 * What changed between the pulse a reader last saw and the one on the page. Pure so it can be tested: the component only keeps the last
 * pulse in the browser. No last pulse is a first visit; nothing changed says so, rather than inventing news.
 */
export function sinceLast(prev: Pulse | null, now: Pulse): Since {
	if (!prev) return { lines: [], fresh: 0, first: true }
	const lines: string[] = []
	if (prev.week !== null && now.week !== null && now.week > prev.week) lines.push(`Week ${now.week} numbers are in (you last saw Week ${prev.week}).`)
	if (prev.record && now.record && prev.record !== now.record) lines.push(`The Raiders went from ${prev.record} to ${now.record}.`)
	if (prev.odds !== null && now.odds !== null) {
		const d = Math.round((now.odds - prev.odds) * 100)
		if (d !== 0) lines.push(`Playoff odds ${d > 0 ? "up" : "down"} ${Math.abs(d)} ${Math.abs(d) === 1 ? "point" : "points"}, from ${Math.round(prev.odds * 100)}% to ${Math.round(now.odds * 100)}%.`)
	}
	const seen = new Set(prev.drops)
	const fresh = now.drops.filter((d) => !seen.has(d)).length
	if (fresh > 0) lines.push(`${fresh} new ${fresh === 1 ? "finding" : "findings"} below.`)
	return { lines, fresh, first: false }
}

// ---------------------------------------------------------------------------------------------- the takes

export type Contender = {
	espn?: number
	shot?: string
	slug: string
	name: string
	team: string
	nick: string
	pos: string
	grade: number | null
	headshot: string | null
	initials: string
	/** The number each is argued on, as text: "1,240 passing yards". */
	line: string | null
}

export type Take = {
	id: string
	tag: string
	question: string
	a: Contender
	b: Contender
	/** What the Lab's grade says, shown after the reader has picked. */
	verdict: { lead: "a" | "b" | "even"; text: string }
	/** Why the pick is worth arguing, one sentence. */
	because: string
	href: string
	/** The query for the compare card and link. */
	query: string
}

function contender(data: PlayersData, p: PlayerRow, boxKey?: string): Contender {
	let line: string | null = null
	if (boxKey && p.box[boxKey] !== undefined) {
		const info = BOX[p.group]?.[boxKey]
		line = `${formatBox(p.group, boxKey, p.box[boxKey])} ${info ? info.label.toLowerCase() : boxKey}`
	}
	return {
		slug: p.slug,
		name: p.name,
		team: p.team,
		nick: teamNick(p.team),
		pos: p.pos,
		grade: gradeScore(data, p),
		headshot: p.espn ? headshotUrl(p.espn) : p.shot ? shotUrl(p.shot) : null,
		espn: p.espn,
		shot: p.shot,
		initials: initialsOf(p.name),
		line,
	}
}

function verdictFor(data: PlayersData, a: PlayerRow, b: PlayerRow): Take["verdict"] | null {
	const c = buildComparison(data, { a: a.slug, b: b.slug, range: "season", metrics: null, group: null, sa: null, sb: null })
	if (!c) return null
	const ga = gradeScore(data, a)
	const gb = gradeScore(data, b)
	const grades = ga !== null && gb !== null ? ` (${isV2Site() ? "this-season percentile" : "grade"} ${ga} to ${gb})` : ""
	const lead = c.overall.lead ?? "even"
	if (lead === "even") return { lead: "even", text: `The Lab calls it a toss-up${grades}. The gap is smaller than the noise a few plays make.` }
	const w = lead === "a" ? a : b
	const l = lead === "a" ? b : a
	return { lead, text: `The Lab gives it to ${w.name}${grades}, better per play than ${l.name} over the season.` }
}

const compareQuery = (a: string, b: string) => `a=${a}&b=${b}`
const compareHref = (a: string, b: string) => `/lab/players/compare?${compareQuery(a, b)}`

/**
 * The box-score trap: two players at a position where the one with more yards is graded lower per play. The pair that makes the biggest
 * argument: the yardage leader against the man who is better with each touch. Skips grades that are mostly a handful of plays.
 */
export function boxScoreTrap(data: PlayersData): Take | null {
	let best: { a: PlayerRow; b: PlayerRow; gap: number; group: PlayerGroup } | null = null
	for (const group of ["qb", "rb", "wr", "te"] as PlayerGroup[]) {
		const pool = data.players
			.filter((p) => p.group === group && hasOverall(group) && p.box.yds !== undefined && p.games >= 3 && !isEarly(data, p) && gradeScore(data, p) !== null)
			.sort((x, y) => y.box.yds - x.box.yds)
			.slice(0, 14)
		for (let i = 0; i < pool.length; i++) {
			for (let j = i + 1; j < pool.length; j++) {
				const a = pool[i]
				const b = pool[j]
				if (a.box.yds < b.box.yds * 1.12) continue
				const gap = (gradeScore(data, b) ?? 0) - (gradeScore(data, a) ?? 0)
				if (gap >= 8 && (!best || gap > best.gap)) best = { a, b, gap, group }
			}
		}
	}
	if (!best) return null
	const v = verdictFor(data, best.a, best.b)
	if (!v || v.lead !== "b") return null
	const yardsLabel = BOX[best.group].yds.label.toLowerCase()
	return {
		id: "trap",
		tag: "The box-score trap",
		question: `Who has been the better ${GROUP_META[best.group].single.toLowerCase()}?`,
		a: contender(data, best.a, "yds"),
		b: contender(data, best.b, "yds"),
		verdict: v,
		because: `${best.a.name} leads in ${yardsLabel}. The Lab grades what each man does with the plays he gets, and sees it the other way.`,
		href: compareHref(best.a.slug, best.b.slug),
		query: compareQuery(best.a.slug, best.b.slug),
	}
}

/** A Raider against the best player at his job, from the Lab's featured comparisons. */
export function raiderVsBest(data: PlayersData, skip: Set<string>): Take | null {
	for (const d of featuredDebates(data, 12)) {
		if (!d.tag.includes("a Raider against the best") || skip.has(d.a.slug) || skip.has(d.b.slug)) continue
		const v = verdictFor(data, d.a, d.b)
		if (!v) continue
		const key = HEADLINE[d.a.group]
		void key
		return {
			id: "raider",
			tag: "A Raider against the best",
			question: `${d.a.name} or ${d.b.name}?`,
			a: contender(data, d.a),
			b: contender(data, d.b),
			verdict: v,
			because: `${GROUP_META[d.a.group].title}: ${d.a.name} against the highest-graded ${GROUP_META[d.a.group].single.toLowerCase()} in the league.`,
			href: compareHref(d.a.slug, d.b.slug),
			query: compareQuery(d.a.slug, d.b.slug),
		}
	}
	return null
}

/** The top two at a big position, when the Lab cannot tell them apart. */
export function tooClose(data: PlayersData, skip: Set<string>): Take | null {
	for (const d of featuredDebates(data, 12)) {
		if (!d.tag.includes("the top two") || skip.has(d.a.slug) || skip.has(d.b.slug)) continue
		const v = verdictFor(data, d.a, d.b)
		if (!v) continue
		return {
			id: "top-two",
			tag: v.lead === "even" ? "Too close to call" : "The top two",
			question: `${GROUP_META[d.a.group].title}: ${lastName(d.a.name)} or ${lastName(d.b.name)}?`,
			a: contender(data, d.a),
			b: contender(data, d.b),
			verdict: v,
			because: `The two highest-graded ${GROUP_META[d.a.group].peers} in the league this season.`,
			href: compareHref(d.a.slug, d.b.slug),
			query: compareQuery(d.a.slug, d.b.slug),
		}
	}
	return null
}

/** The arguments to put to a reader, at most three, each between different players. */
export function buildTakes(data: PlayersData): Take[] {
	const out: Take[] = []
	const used = new Set<string>()
	const add = (t: Take | null) => {
		if (!t) return
		out.push(t)
		used.add(t.a.slug)
		used.add(t.b.slug)
	}
	add(boxScoreTrap(data))
	add(raiderVsBest(data, used))
	add(tooClose(data, used))
	return out
}

/** The words for a pick: "You picked Mayfield. The Lab agrees." for the share post and the line under the verdict. */
export function pickLine(take: Take, pick: "a" | "b"): { agree: boolean; text: string } {
	const mine = pick === "a" ? take.a : take.b
	const lead = take.verdict.lead
	if (lead === "even") return { agree: true, text: `You picked ${mine.name}. The Lab can't separate them, so you are not wrong.` }
	const agree = lead === pick
	return { agree, text: agree ? `You picked ${mine.name}. The Lab agrees.` : `You picked ${mine.name}. The Lab disagrees.` }
}

// ---------------------------------------------------------------------------------------------- the tools' live lines

/** One live line for each tool's card, so the list says what is inside today and not what the tool is. Tools with nothing to say are left out. */
export function toolTeasers(input: HubInput, drops: Drop[]): Record<string, string> {
	const out: Record<string, string> = {}
	const o = input.odds
	if (o && o.status === "live") {
		out["playoff-machine"] = `The Raiders are at ${o.pct} to ${o.goalPhrase} as the race stands.`
		if (o.best && !o.best.small) out["rooting-guide"] = `Top game to root for: ${o.best.matchup}.`
	}
	if (input.next) out["matchups"] = `Next up: ${input.next.venue === "at" ? "at" : "vs."} ${teamNick(input.next.opp)}.`
	if (input.next) out["scouting"] = `Scouting the ${teamNick(input.next.opp)} for Sunday.`
	const players = input.players.players.length
	if (players) out["players"] = `${players.toLocaleString("en-US")} players graded through Week ${input.players.week}.`
	const un = drops.find((d) => d.kind === "units")
	if (un) out["teams"] = un.stat ? `Raiders: best unit ${un.stat.value.split(" / ")[0]}, worst ${un.stat.value.split(" / ")[1]}.` : ""
	const tw = drops.find((d) => d.kind === "twin")
	if (tw?.stat) out["season-twins"] = `Closest match so far: the ${tw.stat.value}.`
	const pl = drops.find((d) => d.kind === "play")
	if (pl?.stat) out["top-plays"] = `Biggest swing: ${pl.stat.value} points of win probability.`
	for (const k of Object.keys(out)) if (!out[k]) delete out[k]
	return out
}
