// Generated social share cards (1200x630 PNG).
//
//   /api/og?type=post&slug=<post slug>
//   /api/og?type=game&slug=<game report slug>
//   /api/og?type=pick&id=<gamePrediction id>
//   /api/og?type=scoreboard
//   /api/og?type=rankings   (the top of the ladder, the Raiders' spot and all 32 teams)
//   /api/og?type=nflleague&mode=winners|confidence|upset[&week=N][&view=me|board|alert][&handle=<league handle>][&size=wide|tall]   (the public NFL formats: a player's week, the week's standings, the upset of the week)
//   /api/og?type=league[&handle=<league handle>]
//   /api/og?type=live[&game=<ESPN event id>]   (the live page; the Raiders' game when no id is given)
//   /api/og?type=math[&team=XX | &take=XX][&week=N][&model=season]   (Blogger vs. the Math: the Raiders by default)
//   /api/og?type=lab&slug=week-N[&view=drive][&drive=N]   (a game lab: the win-probability story, or the best drive)
//   /api/og?type=lab&slug=week-N|season&view=play[&rank=N]   (a top play: the play that moved the game or the season most)
//   /api/og?type=scout&opp=XX[&week=N]   (the scouting report for an opponent)
//   /api/og?type=last[&kind=chart|wins|fifths|checklist|season|bottom][&size=wide|tall][&stat=def.turnovers]
//           [&scope=all][&team=KC][&po=made|missed][&years=2016,2021][&pin=2016-LV][&y=wins]
//           (will it last?: a card for each part of the page; wide 1200x630 or tall 1080x1350)
//   /api/og?type=matchup&a=LV&b=NE[&view=overview|pairs|tape|style|coaches|injuries][&size=wide|tall]   (two teams' position groups: a card for each part of the matchup page)
//   /api/og?type=slate[&size=wide|tall]   (the week's games, how each team's position groups line up)
//   /api/og?type=board[&sort=composite|off|def|qb|ol|rec|run|rush|rund|cov][&show=AFC|NFC|<division>][&team=XX][&size=wide|tall]   (the league's position-group heat map)
//   /api/og?type=twins[&size=wide|tall][&mode=off|def][&twin=2022-JAX]   (season twins: the Raiders' closest team-season)
//   /api/og?type=rooting&team=LV&goal=playoffs|division|bye[&week=8][&size=wide|tall]   (the rooting guide: a team's goal and the top three games to root in)
//   /api/og?type=flags&kind=flag&id=2026_04_KC_LV-1234|team&team=LV|player&slug=<slug>|compare&a=LV&b=KC|board&board=latest|worst|players|teams|types|penalty&ty=<penalty-name>|situation&dim=score[&team=LV]
//           [&season=2026][&size=wide|tall]   (the penalty flags: a flag, a team, a player, two teams, a leaderboard, a penalty, a situation)
//   /api/og?type=hub   (the Lab hub: the week's findings on one card)
//   /api/og?type=playoffs[&s=<scenario code>][&t=KC][&size=wide|tall]   (the playoff machine: a team's seed and bracket in a scenario, or its odds as the race stands)
//   /api/og?type=player&slug=brock-bowers[&pos=te]   (a Player Lab profile: grade, league-best badges and strongest numbers)
//   /api/og?type=compare&a=brock-bowers&b=trey-mcbride[&r=form|earlier][&m=epaTgt,croe][&g=te][&y=2024|&ya=2022&yb=2025][&f=h2h|radar|spot][&side=a|b][&size=wide|tall][&scale=2]
//           (two players side by side: head to head, radar or one player's case; scale=2 is the high-resolution download)
//
// Any `v` param is ignored here; pages add `&v=<_updatedAt ms>` so that a
// content edit produces a new URL and X/Facebook re-scrape a fresh image.
// Whatever goes wrong (missing doc, Sanity down, a render error) the response
// is a redirect to the static default card, so a shared link always has an
// image. Layouts live in lib/og/cards.tsx.

import type { NextApiRequest, NextApiResponse } from "next"
import { groq } from "next-sanity"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { readClient } from "../../lib/sanity.client"
import urlFor from "../../lib/urlFor"
import { teamInfo } from "../../lib/nfl"
import { withEspnFinals } from "../../lib/live/service"
import { buildBoards, type RankingsDoc } from "../../lib/rankings"
import { SEASON, gradeGame, summarize, summarizeFlags, summarizeKeys, type FlagPlant, type GamePrediction } from "../../lib/predictions"
import { OG_HEIGHT, cardSize, renderCard, type CardSpec } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { client } from "../../lib/sanity.client"
import { featuredGame, getGame, getScoreboard } from "../../lib/live/service"
import { buildLiveSpec } from "../../lib/og/liveCard"
import { buildLeagueSpec } from "../../lib/og/leagueCard"
import { loadNflCardSpec } from "../../lib/league2/ogData"
import { buildMathSpec } from "../../lib/og/mathCard"
import { buildLabSpec } from "../../lib/og/labCard"
import { insightSpec } from "../../lib/og/insightSpecs"
import { buildRankingsSpec } from "../../lib/og/rankingsCard"
import { getGameBySlug, getSeason } from "../../lib/lab/data"
import { loadMath } from "../../lib/math/server"
import { LEAGUE_QUERY, normalizeLeagueData } from "../../lib/league"

const FALLBACK = "/og-default-v2.png"
const PHOTO_W = 420

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const DOC_ID = /^[A-Za-z0-9._-]{1,80}$/

function first(v: string | string[] | undefined): string {
	return Array.isArray(v) ? v[0] ?? "" : v ?? ""
}

/** Fetch a Sanity image as a data: URI sized for the photo panel, or null. */
async function photoDataUri(image: unknown): Promise<string | null> {
	if (!image) return null
	let url: string
	try {
		url = urlFor(image).width(PHOTO_W).height(OG_HEIGHT).fit("crop").format("jpg").quality(80).url()
	} catch {
		return null
	}
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), 4000)
	try {
		const res = await fetch(url, { signal: ctrl.signal })
		if (!res.ok) return null
		const type = res.headers.get("content-type") || ""
		if (!/^image\/(jpeg|png)/.test(type)) return null
		const buf = Buffer.from(await res.arrayBuffer())
		if (buf.length === 0 || buf.length > 3_000_000) return null
		return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

/** A player's photo as a data: URI for the card, or null: a slow or missing photo never costs the card. */
async function headshotDataUri(url: string): Promise<string | null> {
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), 3000)
	try {
		const res = await fetch(url, { signal: ctrl.signal })
		if (!res.ok) return null
		const type = (res.headers.get("content-type") || "").split(";")[0]
		if (!/^image\/(jpeg|png)$/.test(type)) return null
		const buf = Buffer.from(await res.arrayBuffer())
		if (buf.length === 0 || buf.length > 2_000_000) return null
		return `data:${type};base64,${buf.toString("base64")}`
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

/** A short label above the headline, from the title when it says what the piece is. */
function eyebrowFor(title: string, category?: string | null): string {
	if (/power rankings?/i.test(title)) return "Power Rankings"
	if (/film (study|room)|breakdown/i.test(title)) return "Film Room"
	if (/\bpreview\b|make him do it|game plan|plan for/i.test(title)) return "Preview"
	if (/mock draft|draft board/i.test(title)) return "Draft"
	if (category && category.length <= 24) return category
	return "News & Analysis"
}

const postQuery = groq`
	*[_type == "post" && slug.current == $slug && !(_id in path("drafts.**"))][0]{
		title, mainImage, "category": categories[0]->title
	}`

const gameQuery = groq`
	*[_type == "gameReport" && slug.current == $slug && !(_id in path("drafts.**"))][0]{
		title, opponent, raidersScore, opponentScore, mainImage
	}`

const pickQuery = groq`
	*[_type == "gamePrediction" && _id == $id && !(_id in path("drafts.**"))][0]{
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
		actualAwayScore, actualHomeScore
	}`

const picksQuery = groq`
	*[_type == "gamePrediction" && season == $season && !(_id in path("drafts.**"))]{
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
		actualAwayScore, actualHomeScore,
		readerVotesAway, readerVotesHome,
		keys[]{ _key, text, result }
	}`

const rankingsQuery = groq`
	*[_type == "powerRankings" && season == $season && !(_id in path("drafts.**"))] | order(_updatedAt asc){
		_id, season, week, teams[]{ _key, team }
	}`

const flagsQuery = groq`
	*[_type == "flagPlant" && season == $season && !(_id in path("drafts.**"))]{
		_id, week, text, result
	}`

async function specFor(query: NextApiRequest["query"]): Promise<CardSpec | null> {
	const type = first(query.type)

	if (type === "post") {
		const slug = first(query.slug)
		if (!SLUG.test(slug)) return null
		const post = await readClient.fetch(postQuery, { slug })
		if (!post?.title) return null
		return {
			type: "article",
			eyebrow: eyebrowFor(post.title, post.category),
			title: post.title,
			photo: await photoDataUri(post.mainImage),
		}
	}

	if (type === "game") {
		const slug = first(query.slug)
		if (!SLUG.test(slug)) return null
		const g = await readClient.fetch(gameQuery, { slug })
		if (!g?.title || typeof g.raidersScore !== "number" || typeof g.opponentScore !== "number") return null
		return {
			type: "game",
			title: g.title,
			opponent: g.opponent || "Opponent",
			raidersScore: g.raidersScore,
			opponentScore: g.opponentScore,
			photo: await photoDataUri(g.mainImage),
		}
	}

	if (type === "pick") {
		const id = first(query.id)
		if (!DOC_ID.test(id) || id.startsWith("drafts.")) return null
		const raw: GamePrediction | null = await readClient.fetch(pickQuery, { id })
		if (!raw) return null
		const [p] = await withEspnFinals([raw])
		const away = teamInfo(p.awayTeam)
		const home = teamInfo(p.homeTeam)
		const grade = gradeGame(p)
		return {
			type: "pick",
			week: p.week,
			awayNick: away.nick,
			homeNick: home.nick,
			awayAbbr: away.abbr,
			homeAbbr: home.abbr,
			predictedAway: p.predictedAwayScore,
			predictedHome: p.predictedHomeScore,
			final:
				grade.final && grade.result !== "pending"
					? { away: p.actualAwayScore as number, home: p.actualHomeScore as number, result: grade.result }
					: null,
		}
	}

	if (type === "rankings") {
		const docs: RankingsDoc[] = (await readClient.fetch(rankingsQuery, { season: SEASON })) ?? []
		const boards = buildBoards(docs)
		const latest = boards[boards.length - 1]
		if (!latest) return null
		return buildRankingsSpec(latest, SEASON)
	}

	if (type === "league") {
		// League documents have dotted ids (private in Sanity), so this needs the token client.
		const raw = normalizeLeagueData(await client.fetch(LEAGUE_QUERY, { season: SEASON }))
		const data = { ...raw, games: await withEspnFinals(raw.games) }
		// A challenge link carries the challenger's handle; an unknown one still gets the plain invite.
		const challenger = first(query.challenge)
		if (challenger) return buildLeagueSpec(data, SEASON, challenger, { challenge: true }) ?? buildLeagueSpec(data, SEASON)
		return buildLeagueSpec(data, SEASON, first(query.handle), { view: first(query.view) })
	}

	if (type === "nflleague") {
		const size = first(query.size) === "tall" ? "tall" : "wide"
		return loadNflCardSpec({ mode: first(query.mode), week: first(query.week), view: first(query.view), handle: first(query.handle), size })
	}

	if (type === "live") {
		const id = first(query.game)
		let gameId = id
		if (id) {
			if (!/^\d{6,12}$/.test(id)) return null
		} else {
			const featured = featuredGame((await getScoreboard()).value)
			if (!featured) return null
			gameId = featured.id
		}
		const result = await getGame(gameId)
		return result ? buildLiveSpec(result.game) : null
	}

	if (type === "math") {
		const week = Number(first(query.week))
		// A smaller box-score budget than the page's: the card should render fast, and falls back to results alone.
		const page = await loadMath(Number.isInteger(week) && week > 0 ? week : undefined, { boxBudgetMs: 3000, model: first(query.model) === "season" ? "season" : "full" })
		return page.report ? buildMathSpec(page.report, { team: first(query.team), take: first(query.take) }) : null
	}

	const insight = insightSpec({
		type,
		slug: first(query.slug),
		view: first(query.view),
		rank: first(query.rank),
		opp: first(query.opp),
		week: first(query.week),
		kind: first(query.kind),
		size: first(query.size),
		stat: first(query.stat),
		scope: first(query.scope),
		team: first(query.team),
		of: first(query.of),
		po: first(query.po),
		years: first(query.years),
		pin: first(query.pin),
		y: first(query.y),
		mode: first(query.mode),
		twin: first(query.twin),
		a: first(query.a),
		b: first(query.b),
		sort: first(query.sort),
		show: first(query.show),
		s: first(query.s),
		t: first(query.t),
		goal: first(query.goal),
		pos: first(query.pos),
		group: first(query.group),
		r: first(query.r),
		m: first(query.m),
		g: first(query.g),
		ya: first(query.ya),
		yb: first(query.yb),
		f: first(query.f),
		side: first(query.side),
		season: first(query.season),
		id: first(query.id),
		board: first(query.board),
		ty: first(query.ty),
		dim: first(query.dim),
	})
	if (insight) {
		if (insight.type === "compare") {
			const [pa, pb] = await Promise.all([insight.a.headshot ? headshotDataUri(insight.a.headshot) : null, insight.b.headshot ? headshotDataUri(insight.b.headshot) : null])
			return { ...insight, a: { ...insight.a, photo: pa }, b: { ...insight.b, photo: pb } }
		}
		if (insight.type === "flags") {
			// Every face on the card, fetched together: each is cut off after 3 seconds, so a slow image host costs one wait, not eight.
			const photos = await Promise.all(insight.heads.map((h) => (h.url ? headshotDataUri(h.url) : Promise.resolve(null))))
			return { ...insight, heads: insight.heads.map((h, i) => ({ ...h, photo: photos[i] })) }
		}
		if (insight.type === "player" && insight.headshot) return { ...insight, photo: await headshotDataUri(insight.headshot) }
		if (insight.type === "hub") {
			const photos = await Promise.all(insight.rows.map((r) => (r.headshot ? headshotDataUri(r.headshot) : Promise.resolve(null))))
			return { ...insight, rows: insight.rows.map((r, i) => ({ ...r, photo: photos[i] })) }
		}
		if (insight.type === "playerboard") {
			// Every face on the card, fetched together: each one is cut off after 3 seconds, so a slow image host costs one wait, not six.
			const photos = await Promise.all([...insight.rows, ...(insight.focal ? [insight.focal] : [])].map((r) => (r.headshot ? headshotDataUri(r.headshot) : Promise.resolve(null))))
			return { ...insight, rows: insight.rows.map((r, i) => ({ ...r, photo: photos[i] })), focal: insight.focal ? { ...insight.focal, photo: photos[insight.rows.length] } : null }
		}
		return insight
	}
	if (type === "scout" || type === "flags" || type === "last" || type === "twins" || type === "playoffs" || type === "rooting" || type === "matchup" || type === "slate" || type === "board" || type === "player" || type === "playerboard" || type === "compare" || type === "hub") return null

	if (type === "lab") {
		const slug = first(query.slug)
		if (!slug || !SLUG.test(slug)) return null
		const game = getGameBySlug(slug)
		if (!game) return null
		const drive = Number(first(query.drive))
		return buildLabSpec(game, getSeason().team, { view: first(query.view), drive: Number.isInteger(drive) && drive > 0 ? drive : null })
	}

	if (type === "scoreboard") {
		const [picks, flags]: [GamePrediction[], FlagPlant[]] = await Promise.all([
			readClient.fetch(picksQuery, { season: SEASON }).then((p: GamePrediction[] | null) => withEspnFinals(p ?? [])),
			readClient.fetch(flagsQuery, { season: SEASON }),
		])
		const s = summarize(picks ?? [])
		const k = summarizeKeys(picks ?? [])
		const f = summarizeFlags(flags ?? [])
		return {
			type: "scoreboard",
			season: SEASON,
			hits: s.hits,
			misses: s.misses,
			accuracy: s.accuracy,
			keys: { hit: k.hit, miss: k.miss },
			flags: { hit: f.hit, miss: f.miss },
		}
	}

	return null
}

function cacheFor(spec: CardSpec): string {
	if (spec.type === "live") {
		if (spec.state === "in") return "public, s-maxage=20, stale-while-revalidate=40"
		if (spec.state === "pre") return "public, s-maxage=300, stale-while-revalidate=900"
	}
	// The league cards show standings and the open game, and the pages stamp their links hourly.
	// The lab data is a static file that only changes with a deploy, and the page stamps its links.
	if (spec.type === "flags") return "public, s-maxage=86400, stale-while-revalidate=604800"
	if (spec.type === "lab" || spec.type === "play" || spec.type === "scout" || spec.type === "last" || spec.type === "twins" || spec.type === "playoffs" || spec.type === "rooting" || spec.type === "matchup" || spec.type === "slate" || spec.type === "board" || spec.type === "player" || spec.type === "playerboard" || spec.type === "compare" || spec.type === "hub") return "public, s-maxage=604800, stale-while-revalidate=2592000"
	if (spec.type === "league" || spec.type === "math" || spec.type === "nflleague") return "public, s-maxage=3600, stale-while-revalidate=86400"
	return "public, s-maxage=86400, stale-while-revalidate=604800"
}

function fallback(res: NextApiResponse) {
	// Short cache so a transient failure does not stick to a shared link.
	res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
	res.redirect(302, FALLBACK)
}

/**
 * `?debug=1` answers with JSON saying where a card failed instead of redirecting to the default image,
 * so a card that "doesn't show up" can be diagnosed from a browser. Only public feed facts and the
 * error message go in it.
 */
async function debugReport(query: NextApiRequest["query"]) {
	const out: Record<string, unknown> = { type: first(query.type) || null, game: first(query.game) || null }
	try {
		if (out.type === "live") {
			const board = await getScoreboard()
			out.scoreboardGames = board.value.map((g) => `${g.id} ${g.away.abbr}@${g.home.abbr} ${g.state}`)
			out.scoreboardStale = board.stale
			const id = (out.game as string | null) || featuredGame(board.value)?.id || null
			out.resolvedGame = id
			out.onScoreboard = id ? board.value.some((g) => g.id === id) : false
		}
		out.stage = "spec"
		const spec = await specFor(query)
		out.spec = spec ? "ok" : "null (the route would redirect to the default image)"
		if (spec) {
			out.stage = "render"
			const { width, height } = cardSize(spec)
			const svg = await satori(renderCard(spec), { width, height, fonts: ogFonts() })
			out.svgBytes = svg.length
			const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng()
			out.pngBytes = png.length
			out.stage = "done"
		}
	} catch (err) {
		out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
		out.where = err instanceof Error ? (err.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()) : []
	}
	return out
}

// A card is drawn on request (the playoff card plays the rest of the season first), so allow longer than the platform default.
export const config = { maxDuration: 30 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.setHeader("Allow", "GET, HEAD")
		return res.status(405).end()
	}

	if (first(req.query.debug) === "1") {
		res.setHeader("Cache-Control", "no-store")
		return res.status(200).json(await debugReport(req.query))
	}

	try {
		const spec = await specFor(req.query)
		if (!spec) return fallback(res)

		const { width, height } = cardSize(spec)
		const svg = await satori(renderCard(spec), { width, height, fonts: ogFonts() })
		// scale=2 is the download: the same card at twice the pixels (comparison cards only, so no other card can be asked for a huge image).
		const scale = spec.type === "compare" && first(req.query.scale) === "2" ? 2 : 1
		const png = new Resvg(svg, { fitTo: { mode: "width", value: width * scale } }).render().asPng()

		res.setHeader("Content-Type", "image/png")
		// The page URL carries `v=<updatedAt>`, so a long cache is safe: an edit
		// changes the URL. Reader votes are not on the card, only results.
		// A live card changes by the minute, a pre-game one as the line moves, and a final one never.
		res.setHeader("Cache-Control", cacheFor(spec))
		res.status(200)
		res.end(png)
	} catch (err) {
		console.error("og card failed", err)
		fallback(res)
	}
}
