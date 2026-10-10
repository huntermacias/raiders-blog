// The share card for the Sunday Rooting Guide (/lab/rooting-guide): one team's goal, the chance it has now, and the three
// games to root in, each with what it is worth in percentage points.
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// buildRootingSpec turns the page's own view (lib/rooting/view.ts) into a small plain spec, so the card and the page can never
// disagree, and so the card can be tested from fixed data. renderRootingCard turns the spec into JSX. See lib/og/kit.tsx for the
// Satori notes: inline styles only, every element with more than one child is display:flex, and no text inside an <svg>.

import type { ReactElement } from "react"

import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { teamByAbbr } from "../nfl"
import { GOAL_INFO, pctText } from "../rooting/guide"
import type { GuideView } from "../rooting/view"
import type { Goal } from "../rooting/types"
import { BRIGHT, Brand, Button, DIM, Eyebrow, Frame, GOLD, HIT, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type RootingPick = {
	rank: number
	/** The team to root for, and the one it plays. */
	abbr: string
	nick: string
	color: string
	opp: string
	/** "at" when the team to root for is the visitor. */
	venue: "vs" | "at"
	/** One of the two teams is the followed team. */
	yours: boolean
	/** The best result minus the worst, in points: what the games are ranked by. */
	swing: number
	/** The big number: "+20" for a gain, or "12" when the game is worth avoiding a bad result rather than hoping for a good one. */
	big: string
	unit: string
	/** Chance at the goal now, and after the result that helps, 0-100. */
	now: number
	then: number
	nowText: string
	thenText: string
}

export type RootingCardSpec = {
	type: "rooting"
	size: ShareSize
	season: number
	week: number | null
	team: string
	nick: string
	color: string
	goal: Goal
	/** "Make the playoffs", "Win the division", "Get the No. 1 seed". */
	goalLabel: string
	record: string
	standing: string
	/** What the big number on the left shows. */
	hero: { big: string; small: string; note: string; muted: boolean }
	picks: RootingPick[]
	/** Said instead of the list when there are no picks. */
	message: string
}

const GOAL_NOTE: Record<Goal, string> = { playoffs: "to make the playoffs", division: "to win the division", bye: "to get the No. 1 seed" }

const wholePct = (p: number) => Math.round(p * 100)

/** Builds the card from the page's view; the same numbers, ranked the same way, as the page shows. */
export function buildRootingSpec(view: GuideView, input: { season: number; size: ShareSize }): RootingCardSpec {
	const info = teamByAbbr(view.team)
	const goal = view.goals.find((g) => g.goal === view.goal)
	const picks: RootingPick[] = view.recs.slice(0, 3).flatMap((r, i) => {
		if (!r.rootFor || r.rootAgainst === null || r.bestP === null || r.gain === null) return []
		const t = teamByAbbr(r.rootFor)
		const gainPts = wholePct(r.gain)
		const swing = wholePct(r.spread)
		return [
			{
				rank: i + 1,
				abbr: t.abbr,
				nick: t.nick,
				color: t.color,
				opp: r.rootAgainst,
				venue: r.rootFor === r.away ? ("at" as const) : ("vs" as const),
				yours: r.yours,
				swing,
				big: gainPts >= 1 ? `+${gainPts}` : String(Math.max(1, swing)),
				unit: gainPts >= 1 ? (gainPts === 1 ? "pt" : "pts") : "pt swing",
				now: wholePct(r.baseline),
				then: wholePct(r.bestP),
				nowText: pctText(r.baseline),
				thenText: pctText(r.bestP),
			},
		]
	})

	const status = view.status
	const live = status === "live"
	const hero = live
		? { big: pctText(view.goals.find((g) => g.goal === view.goal)?.baseline ?? 0).replace("%", ""), small: "%", note: `chance ${GOAL_NOTE[view.goal]}`, muted: false }
		: status === "clinched"
			? { big: "IN", small: "", note: view.goal === "playoffs" ? "playoff spot clinched" : view.goal === "division" ? "division clinched" : "No. 1 seed clinched", muted: false }
			: { big: "OUT", small: "", note: view.goal === "playoffs" ? "eliminated" : "out of reach", muted: true }

	let message = ""
	if (!picks.length) {
		if (!live) message = view.emptyText.replace(/ Try another goal\.$/, "")
		else if (view.empty === "season-over") message = "The regular season is over. The Playoff Machine shows the final bracket."
		else message = `No game left moves the ${info.nick}' chance ${GOAL_NOTE[view.goal]} by a point or more.`
	}

	return {
		type: "rooting",
		size: input.size,
		season: input.season,
		week: view.week,
		team: view.team,
		nick: info.nick,
		color: accent(info.color),
		goal: view.goal,
		goalLabel: goal?.label ?? GOAL_INFO[view.goal].label,
		record: view.standing.record,
		standing: view.standing.text,
		hero,
		picks,
		message,
	}
}

export const rootingCardSize = (spec: Pick<RootingCardSpec, "size">) => SIZE_PIXELS[spec.size]

// ---- drawing -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

/** The 0-100% bar for one pick: a tick where the team is now and a fill to where the good result takes it. */
function Meter({ pick, w, h }: { pick: RootingPick; w: number; h: number }) {
	const c = accent(pick.color)
	const to = Math.max(1, Math.min(100, pick.then))
	const from = Math.max(0, Math.min(100, pick.now))
	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: h / 2 }}>
			<div style={{ display: "flex", width: Math.round((w * to) / 100), height: h, backgroundColor: c, borderRadius: h / 2 }} />
			<div style={{ display: "flex", position: "absolute", left: Math.round((w * from) / 100) - 1, top: -4, width: 3, height: h + 8, backgroundColor: WHITE }} />
		</div>
	)
}

function Row({ pick, tall, w }: { pick: RootingPick; tall: boolean; w: number }) {
	const c = accent(pick.color)
	const h = tall ? 178 : 120
	const abbrSize = tall ? 74 : 52
	const bigSize = tall ? 92 : 64
	const rank = tall ? 52 : 36
	const meterW = tall ? 360 : 232
	return (
		<div style={{ display: "flex", alignItems: "center", width: w, height: h, marginTop: tall ? 14 : 12, paddingRight: tall ? 28 : 18, backgroundColor: "rgba(15,16,18,0.92)", border: `2px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
			<div style={{ display: "flex", width: tall ? 14 : 9, height: h, backgroundColor: c }} />
			<div style={{ display: "flex", justifyContent: "center", width: rank + 14, fontFamily: "Anton", fontSize: rank, color: pick.rank === 1 ? GOLD : BRIGHT }}>{String(pick.rank)}</div>
			<div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
				<div style={label({ fontSize: tall ? 24 : 15, letterSpacing: 5, color: SILVER })}>Root for</div>
				<div style={{ display: "flex", alignItems: "flex-end" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: abbrSize, lineHeight: 1.05, letterSpacing: 1, color: WHITE }}>{pick.abbr}</div>
					<div style={label({ fontSize: tall ? 30 : 19, letterSpacing: 3, color: BRIGHT, marginLeft: 14, marginBottom: tall ? 12 : 7 })}>{`${pick.venue} ${pick.opp}`}</div>
					{pick.yours ? <div style={label({ fontSize: tall ? 20 : 13, letterSpacing: 4, color: GOLD, marginLeft: 14, marginBottom: tall ? 16 : 10 })}>Your game</div> : null}
				</div>
				<div style={{ display: "flex", alignItems: "center", marginTop: tall ? 14 : 8 }}>
					<Meter pick={pick} w={meterW} h={tall ? 14 : 9} />
					<div style={label({ fontSize: tall ? 26 : 16, letterSpacing: 2, color: BRIGHT, marginLeft: 16 })}>{`${pick.nowText} to ${pick.thenText}`}</div>
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: bigSize, lineHeight: 1, color: HIT }}>{pick.big}</div>
				<div style={label({ fontSize: tall ? 24 : 15, letterSpacing: 4, color: SILVER })}>{pick.unit}</div>
				{pick.unit === "pt swing" ? null : <div style={label({ fontSize: tall ? 20 : 13, letterSpacing: 3, color: DIM, marginTop: 2 })}>{`${Math.max(1, pick.swing)} pt swing`}</div>}
			</div>
		</div>
	)
}

export function renderRootingCard(spec: RootingCardSpec): ReactElement {
	const { width: w, height: h } = SIZE_PIXELS[spec.size]
	const tall = spec.size === "tall"
	const eyebrow = spec.week ? `${spec.season} · Week ${spec.week} rooting guide` : `${spec.season} · Rooting guide`
	const hr = spec.hero
	const bigSize = tall ? (hr.big.length > 3 ? 220 : 250) : hr.big.length > 3 ? 120 : 150

	const chip = (text: string, hot = false) => (
		<div style={{ display: "flex", alignSelf: "flex-start", padding: tall ? "10px 24px" : "7px 18px", marginRight: 12, marginTop: tall ? 14 : 8, border: `2px solid ${hot ? spec.color : LINE}`, color: hot ? WHITE : BRIGHT, fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 28 : 21, letterSpacing: 3, ...caps }}>{text}</div>
	)

	// The glow behind the number is a gradient, not a blurred shadow: a blur of that size is what made the picture take seconds to draw.
	const number = (
		<div style={{ display: "flex", flexDirection: "column", padding: tall ? "30px 60px 30px 30px" : "24px 50px 24px 24px", margin: tall ? "-30px -60px -30px -30px" : "-24px -50px -24px -24px", backgroundImage: `radial-gradient(ellipse closest-side at 50% 50%, ${rgba(spec.color, 0.3)} 0%, ${rgba(spec.color, 0)} 100%)` }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 84 : 54, lineHeight: 1.02, letterSpacing: 2, color: WHITE, ...caps }}>{spec.nick}</div>
			<div style={{ display: "flex", alignItems: "flex-end", marginTop: tall ? 8 : 0 }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: bigSize, lineHeight: 1, color: hr.muted ? DIM : WHITE }}>{hr.big}</div>
				{hr.small ? <div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(bigSize * 0.4), lineHeight: 1.5, color: SILVER, marginLeft: 6 }}>{hr.small}</div> : null}
			</div>
			<div style={label({ fontSize: tall ? 30 : 22, color: SILVER, marginTop: tall ? 6 : 2 })}>{hr.note}</div>
		</div>
	)

	const chips = (
		<div style={{ display: "flex", flexWrap: "wrap" }}>
			{chip(spec.record, true)}
			{tall ? null : chip(clip(spec.standing.split(",")[0], 24))}
		</div>
	)

	const listW = tall ? w - 144 : 560
	const list = spec.picks.length ? (
		<div style={{ display: "flex", flexDirection: "column", width: listW }}>
			<div style={label({ fontSize: tall ? 28 : 19, color: SILVER, fontWeight: 600, letterSpacing: 5 })}>{spec.picks.length === 1 ? "The game to root in" : `Root for these ${spec.picks.length}`}</div>
			{spec.picks.map((p) => (
				<Row key={p.rank} pick={p} tall={tall} w={listW} />
			))}
		</div>
	) : (
		<div style={{ display: "flex", flexDirection: "column", width: listW, padding: tall ? "40px 40px" : "28px 30px", backgroundColor: "rgba(12,13,15,0.72)", border: `2px solid ${LINE}`, borderRadius: 20 }}>
			<div style={label({ fontSize: tall ? 28 : 19, color: SILVER, fontWeight: 600, letterSpacing: 5 })}>Nothing to root for</div>
			<div style={{ display: "flex", marginTop: 14, fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 38 : 26, lineHeight: 1.28, color: BRIGHT }}>{clip(spec.message, 170)}</div>
		</div>
	)

	const fine = "Odds from a simulation of the rest of the season · Data: nflverse, CC BY 4.0"

	if (!tall) {
		return (
			<Frame glow={spec.color} w={w} h={h}>
				<div style={{ display: "flex", width: w, height: h, padding: "44px 56px 52px 64px", justifyContent: "space-between" }}>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470, height: h - 96 }}>
						<Eyebrow text={eyebrow} color={spec.color} />
						<div style={{ display: "flex", flexDirection: "column" }}>
							{number}
							{chips}
						</div>
						<div style={{ display: "flex", flexDirection: "column" }}>
							<Button text="See the guide" />
							<div style={{ display: "flex", marginTop: 20 }}>
								<Brand />
							</div>
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 12 }}>{list}</div>
				</div>
				<div style={{ display: "flex", position: "absolute", right: 56, bottom: 16, fontFamily: "Oswald", fontWeight: 400, fontSize: 14, letterSpacing: 1, color: DIM }}>{fine}</div>
			</Frame>
		)
	}

	return (
		<Frame glow={spec.color} w={w} h={h}>
			<div style={{ display: "flex", flexDirection: "column", width: w, height: h, padding: "60px 72px 48px" }}>
				<Eyebrow text={eyebrow} color={spec.color} />
				<div style={{ display: "flex", marginTop: 26 }}>
					{number}
					<div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 44, justifyContent: "flex-end", paddingBottom: 8 }}>
						{chips}
						<div style={{ display: "flex", marginTop: 18, fontFamily: "Oswald", fontWeight: 400, fontSize: 30, lineHeight: 1.25, color: BRIGHT }}>{clip(spec.standing, 60)}</div>
					</div>
				</div>
				<div style={{ display: "flex", marginTop: 34 }}>{list}</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<Button text="See the guide" />
				</div>
				<div style={{ display: "flex", marginTop: 16, fontFamily: "Oswald", fontWeight: 400, fontSize: 17, letterSpacing: 1, color: DIM }}>{fine}</div>
			</div>
		</Frame>
	)
}
