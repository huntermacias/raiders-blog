// The share card for the NFL Playoff Machine (/lab/playoff-machine): one team's scenario, with the seed it lands, the story of
// its first-round game, and the conference bracket with the team lit up.
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// Two looks. With no picks it is the state of the race right now: the team's playoff odds as the hero number. With picks it
// is the reader's scenario: the seed the picks produce as the hero, and a sentence saying what that means.
//
// buildPlayoffsSpec turns a simulation into a small plain spec (no network, so it can be tested from fixed data) and
// renderPlayoffsCard turns the spec into JSX. See lib/og/kit.tsx for the Satori notes: inline styles only, every element with
// more than one child is display:flex, and no text inside an <svg>.

import type { ReactElement } from "react"

import { teamByAbbr } from "../nfl"
import { oddsText } from "../playoffs/format"
import type { OddsResult } from "../playoffs/odds"
import { recordText } from "../playoffs/season"
import type { SimulationResult } from "../playoffs/simulator"
import { scenarioStory, standingLabel } from "../playoffs/summary"
import type { Conference } from "../playoffs/types"
import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { BRIGHT, Brand, Button, DIM, Eyebrow, Frame, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type PlayoffSeat = {
	seed: number
	abbr: string
	nick: string
	color: string
	record: string
	/** The followed team: drawn lit. */
	me: boolean
}

export type PlayoffsCardSpec = {
	type: "playoffs"
	size: ShareSize
	season: number
	throughWeek: number
	team: string
	nick: string
	/** The team's color for glows and bars, lifted so it shows on the dark card. */
	color: string
	conference: Conference
	/** How many games the reader picked. 0 means the card is the state of the race now. */
	picks: number
	/** True when every game has a result in this scenario. */
	complete: boolean
	record: string
	/** The conference seed, or null when the team is not in. */
	seed: number | null
	status: string
	/** One sentence on how the scenario turned out. */
	story: string
	/** The team's playoff odds from the rest of the season (null when the season is complete or no odds were worked out). */
	odds: number | null
	bracket: {
		/** Seed 1 first. */
		byes: PlayoffSeat[]
		/** 2 hosts 7, 3 hosts 6, 4 hosts 5: the visitor first. */
		games: { away: PlayoffSeat; home: PlayoffSeat }[]
	}
	/** The other conference's seven seeds, for the tall card. */
	other: { conference: Conference; seeds: PlayoffSeat[] }
}

export type PlayoffsCardInput = {
	sim: SimulationResult
	odds: OddsResult | null
	team: string
	picks: number
	season: number
	throughWeek: number
	size: ShareSize
}

/** Builds the card for one team's scenario; null when the team is not in the league. */
export function buildPlayoffsSpec(input: PlayoffsCardInput): PlayoffsCardSpec | null {
	const { sim, odds, team } = input
	const t = sim.teams[team]
	if (!t) return null
	const seat = (id: string, seed: number): PlayoffSeat => {
		const info = teamByAbbr(id)
		return { seed, abbr: info.abbr, nick: info.nick, color: info.color, record: recordText(sim.teams[id].overall), me: id === team }
	}
	const b = sim.bracket[t.conference]
	const otherConf = (t.conference === "AFC" ? "NFC" : "AFC") as Conference
	const info = teamByAbbr(team)
	const complete = sim.complete
	return {
		type: "playoffs",
		size: input.size,
		season: input.season,
		throughWeek: input.throughWeek,
		team,
		nick: info.nick,
		color: accent(info.color),
		conference: t.conference,
		picks: input.picks,
		complete,
		record: recordText(t.overall),
		seed: t.seed,
		status: standingLabel(t),
		story: scenarioStory(sim, team) ?? "",
		odds: !complete && odds && !odds.exact ? (odds.teams[team]?.playoffs ?? null) : null,
		bracket: {
			byes: b.byes.map((x) => seat(x.team, x.seed)),
			games: b.wildCard.map((g) => ({ away: seat(g.away, g.awaySeed), home: seat(g.home, g.homeSeed) })),
		},
		other: { conference: otherConf, seeds: sim.conferences[otherConf].seeds.map((id, i) => seat(id, i + 1)) },
	}
}

export const playoffsCardSize = (spec: Pick<PlayoffsCardSpec, "size">) => SIZE_PIXELS[spec.size]

// ---- drawing -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

const LIT = { backgroundImage: "linear-gradient(90deg, rgba(230,231,233,0.28) 0%, rgba(230,231,233,0.06) 100%)", borderTop: `1px solid ${BRIGHT}`, borderBottom: `1px solid ${BRIGHT}` }

/** One team in the bracket: its color bar, seed, abbreviation and record. */
function Seat({ s, h, size }: { s: PlayoffSeat; h: number; size: number }) {
	const c = accent(s.color)
	return (
		<div style={{ display: "flex", alignItems: "center", height: h, paddingRight: 14, ...(s.me ? LIT : {}) }}>
			<div style={{ display: "flex", width: 7, height: h - 14, marginLeft: 8, backgroundColor: c }} />
			<div style={{ display: "flex", justifyContent: "center", width: size * 1.3, fontFamily: "Anton", fontSize: size, color: s.seed === 1 ? "#f2c14e" : s.me ? WHITE : BRIGHT }}>{String(s.seed)}</div>
			<div style={{ display: "flex", flex: 1, fontFamily: "Anton", fontSize: size, letterSpacing: 1, color: WHITE }}>{s.abbr}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: Math.round(size * 0.62), letterSpacing: 1, color: s.me ? WHITE : DIM }}>{s.record}</div>
		</div>
	)
}

function Card({ children, dashed = false, w }: { children: ReactElement | ReactElement[]; dashed?: boolean; w?: number }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", ...(w ? { width: w } : { flex: 1 }), backgroundColor: "rgba(15,16,18,0.92)", border: `2px ${dashed ? "dashed" : "solid"} ${LINE}`, borderRadius: 14, overflow: "hidden" }}>{children}</div>
	)
}

function At({ size }: { size: number }) {
	return <div style={{ display: "flex", justifyContent: "center", height: size, fontFamily: "Oswald", fontWeight: 600, fontSize: Math.round(size * 0.62), letterSpacing: 5, color: LINE, ...caps, alignItems: "center", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>at</div>
}

/** What the big number on the left is, in words. */
function hero(spec: PlayoffsCardSpec): { big: string; small: string; note: string } {
	if (spec.picks === 0 && spec.odds !== null) return { big: oddsText(spec.odds).replace("%", ""), small: "%", note: `chance to make the playoffs` }
	if (spec.seed === null) return { big: "OUT", small: "", note: `${spec.conference} playoff picture` }
	return { big: String(spec.seed), small: "", note: `${spec.conference} seed` }
}

export function renderPlayoffsCard(spec: PlayoffsCardSpec): ReactElement {
	const { width: w, height: h } = SIZE_PIXELS[spec.size]
	const tall = spec.size === "tall"
	const hr = hero(spec)
	const racing = spec.picks === 0
	const eyebrow = `${spec.season} season · ${racing ? `Through week ${spec.throughWeek}` : "Playoff scenario"}`
	const bigSize = tall ? (hr.big.length > 3 ? 280 : 340) : hr.big.length > 3 ? 150 : racing ? 190 : 176
	const heroLabel = racing ? `${spec.nick}' playoff odds` : `${spec.nick} in this scenario`

	const chip = (text: string, hot = false) => (
		<div style={{ display: "flex", alignSelf: "flex-start", padding: tall ? "10px 24px" : "7px 18px", marginRight: 12, marginTop: tall ? 14 : 8, border: `2px solid ${hot ? spec.color : LINE}`, color: hot ? WHITE : BRIGHT, fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 28 : 21, letterSpacing: 3, ...caps }}>{text}</div>
	)
	const chips = (
		<div style={{ display: "flex", flexDirection: tall ? "column" : "row", flexWrap: "wrap" }}>
			{chip(spec.record, true)}
			{chip(spec.status)}
			{racing && spec.seed !== null ? chip(`${spec.conference} #${spec.seed} now`) : null}
			{!racing && spec.odds !== null ? chip(`${oddsText(spec.odds)} from here`) : null}
		</div>
	)
	const number = (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={label({ fontSize: tall ? 30 : 22, color: BRIGHT, marginTop: tall ? 0 : 6 })}>{heroLabel}</div>
			<div style={{ display: "flex", alignItems: "flex-end" }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: bigSize, lineHeight: 1, color: spec.seed === null && !racing ? DIM : WHITE, textShadow: `0 0 ${tall ? 70 : 50}px ${rgba(spec.color, 0.5)}` }}>{hr.big}</div>
				{hr.small ? <div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(bigSize * 0.4), lineHeight: 1.5, color: SILVER, marginLeft: 6 }}>{hr.small}</div> : null}
			</div>
			<div style={label({ fontSize: tall ? 30 : 22, color: SILVER, marginTop: tall ? 6 : 2 })}>{hr.note}</div>
		</div>
	)
	const story = !racing && spec.story ? <div style={{ display: "flex", marginTop: tall ? 22 : 16, ...(tall ? {} : { width: 530 }), fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 36 : 24, lineHeight: 1.26, color: BRIGHT }}>{clip(spec.story, tall ? 150 : 120)}</div> : null

	const rowH = tall ? 60 : 44
	const size = tall ? 38 : 29
	const gameCard = (g: PlayoffsCardSpec["bracket"]["games"][number], cw?: number) => (
		<Card key={g.home.seed} w={cw}>
			<Seat s={g.away} h={rowH} size={size} />
			<At size={tall ? 24 : 18} />
			<Seat s={g.home} h={rowH} size={size} />
		</Card>
	)

	const bracket = (
		<div style={{ display: "flex", flexDirection: "column", backgroundColor: "rgba(15,16,18,0.6)", border: `2px solid ${LINE}`, borderRadius: 20, padding: tall ? "24px 26px 26px" : "18px 18px 20px", boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 60px ${rgba(spec.color, 0.14)}`, width: tall ? w - 144 : 490 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: tall ? 16 : 10 }}>
				<div style={label({ fontSize: tall ? 26 : 19, color: SILVER, fontWeight: 600, letterSpacing: 5 })}>{`${spec.conference} bracket`}</div>
				<div style={label({ fontSize: tall ? 22 : 16 })}>{racing ? "If the season ended today" : "In this scenario"}</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column" }}>
				{spec.bracket.byes.map((b) => (
					<div key={b.seed} style={{ display: "flex", marginBottom: tall ? 14 : 10 }}>
						<Card dashed>
							<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: tall ? 24 : 18, fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 15 : 11, letterSpacing: 5, color: DIM, borderBottom: `1px solid ${LINE}`, ...caps }}>Bye</div>
							<Seat s={b} h={rowH} size={size} />
						</Card>
					</div>
				))}
				{tall ? (
					<div style={{ display: "flex" }}>
						{spec.bracket.games.map((g, i) => (
							<div key={g.home.seed} style={{ display: "flex", flex: 1, marginLeft: i === 0 ? 0 : 14 }}>
								{gameCard(g)}
							</div>
						))}
					</div>
				) : (
					spec.bracket.games.map((g, i) => (
						<div key={g.home.seed} style={{ display: "flex", marginTop: i === 0 ? 0 : 10 }}>
							{gameCard(g, 450)}
						</div>
					))
				)}
			</div>
		</div>
	)

	const otherStrip = (
		<div style={{ display: "flex", flexDirection: "column", width: w - 144 }}>
			<div style={label({ fontSize: 24, color: SILVER, fontWeight: 600, letterSpacing: 5 })}>{`${spec.other.conference} seeds ${racing ? "today" : "in this scenario"}`}</div>
			<div style={{ display: "flex", marginTop: 14 }}>
				{spec.other.seeds.map((s, i) => (
					<div key={s.seed} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, marginLeft: i === 0 ? 0 : 8, paddingTop: 12, paddingBottom: 12, border: `2px solid ${LINE}`, borderRadius: 12, backgroundColor: "rgba(15,16,18,0.7)" }}>
						<div style={{ display: "flex", width: 36, height: 5, backgroundColor: accent(s.color) }} />
						<div style={{ display: "flex", marginTop: 8, fontFamily: "Anton", fontSize: 26, color: s.seed === 1 ? "#f2c14e" : BRIGHT }}>{String(s.seed)}</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 30, letterSpacing: 1, color: WHITE }}>{s.abbr}</div>
					</div>
				))}
			</div>
		</div>
	)

	if (!tall) {
		return (
			<Frame glow={spec.color} w={w} h={h}>
				<div style={{ display: "flex", width: w, height: h, padding: "44px 56px 52px 64px", justifyContent: "space-between" }}>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, height: h - 96 }}>
						<Eyebrow text={eyebrow} color={spec.color} />
						<div style={{ display: "flex", flexDirection: "column" }}>
							{number}
							{chips}
							{story}
						</div>
						<div style={{ display: "flex", flexDirection: "column" }}>
							<Button text="Build yours" note="Free · no sign-up" />
							<div style={{ display: "flex", marginTop: 20 }}>
								<Brand />
							</div>
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>{bracket}</div>
				</div>
				<div style={{ display: "flex", position: "absolute", right: 56, bottom: 16, fontFamily: "Oswald", fontWeight: 400, fontSize: 14, letterSpacing: 1, color: DIM }}>A simulation, not the official standings · Data: nflverse, CC BY 4.0</div>
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
						{story}
					</div>
				</div>
				<div style={{ display: "flex", marginTop: 34 }}>{bracket}</div>
				<div style={{ display: "flex", marginTop: 28 }}>{otherStrip}</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<Button text="Build yours" />
				</div>
				<div style={{ display: "flex", marginTop: 16, fontFamily: "Oswald", fontWeight: 400, fontSize: 17, letterSpacing: 1, color: DIM }}>A simulation, not the official standings · Data: nflverse, CC BY 4.0</div>
			</div>
		</Frame>
	)
}
