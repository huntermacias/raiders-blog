// Generated social share cards (1200x630 PNG).
//
//   /api/og?type=post&slug=<post slug>
//   /api/og?type=game&slug=<game report slug>
//   /api/og?type=pick&id=<gamePrediction id>
//   /api/og?type=scoreboard
//   /api/og?type=rankings
//   /api/og?type=league[&handle=<league handle>]
//   /api/og?type=live[&game=<ESPN event id>]   (the live page; the Raiders' game when no id is given)
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
import { buildBoards, raidersRow, type RankingsDoc } from "../../lib/rankings"
import { SEASON, gradeGame, summarize, summarizeFlags, summarizeKeys, type FlagPlant, type GamePrediction } from "../../lib/predictions"
import { OG_HEIGHT, OG_WIDTH, renderCard, type CardSpec } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { client } from "../../lib/sanity.client"
import { featuredGame, getGame, getScoreboard } from "../../lib/live/service"
import { buildLiveSpec } from "../../lib/og/liveCard"
import { buildLeagueSpec } from "../../lib/og/leagueCard"
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
		const p: GamePrediction | null = await readClient.fetch(pickQuery, { id })
		if (!p) return null
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
		const lv = raidersRow(latest.rows)
		return { type: "rankings", season: SEASON, week: latest.week, raidersRank: lv?.rank ?? null, change: lv?.change ?? null }
	}

	if (type === "league") {
		// League documents have dotted ids (private in Sanity), so this needs the token client.
		const data = normalizeLeagueData(await client.fetch(LEAGUE_QUERY, { season: SEASON }))
		// A challenge link carries the challenger's handle; an unknown one still gets the plain invite.
		const challenger = first(query.challenge)
		if (challenger) return buildLeagueSpec(data, SEASON, challenger, { challenge: true }) ?? buildLeagueSpec(data, SEASON)
		return buildLeagueSpec(data, SEASON, first(query.handle), { view: first(query.view) })
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

	if (type === "scoreboard") {
		const [picks, flags]: [GamePrediction[], FlagPlant[]] = await Promise.all([
			readClient.fetch(picksQuery, { season: SEASON }),
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
	if (spec.type === "league") return "public, s-maxage=3600, stale-while-revalidate=86400"
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
			const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
			out.svgBytes = svg.length
			const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
			out.pngBytes = png.length
			out.stage = "done"
		}
	} catch (err) {
		out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
		out.where = err instanceof Error ? (err.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()) : []
	}
	return out
}

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

		const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
		const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()

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
