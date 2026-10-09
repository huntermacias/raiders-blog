// Share-card layouts (1200x630) for /api/og. Everything here is a plain
// function of a small spec, with no Sanity or network access, so any card
// can be rendered and eyeballed from fixed data. Satori (the renderer behind
// @vercel/og) only understands a flexbox subset of CSS and inline styles, so
// styling is done with style objects rather than Tailwind classes.
//
// The look follows the site's default card: near-black ground, bone-white
// and silver Anton headlines, Oswald small caps, and the boxed "RR" mark.

import type { ReactElement } from "react"

import { type PlayCardSpec, type ScoutCardSpec, renderPlayCard, renderScoutCard } from "./insightCards"
import { type LastCardSpec, lastCardSize, renderLastCard } from "./lastCards"
import { type MatchupCardSpec, matchupCardSize, renderMatchupCard } from "./matchupCards"
import { type BoardCardSpec, type SlateCardSpec, renderBoardCard, renderSlateCard } from "./unitsCards"
import { type TwinsCardSpec, renderTwinsCard, twinsCardSize } from "./twinsCards"
import { type PlayoffsCardSpec, playoffsCardSize, renderPlayoffsCard } from "./playoffsCard"
import { type LabCardSpec, renderLabCard } from "./labCard"
import { type LeagueCardSpec, renderLeagueCard } from "./leagueCard"
import { type LiveCardSpec, renderLiveCard } from "./liveCard"
import { type MathCardSpec, renderMathCard } from "./mathCard"
import { type RankingsCardSpec, renderRankingsCard } from "./rankingsCard"

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const BG = "#0a0a0b"
const WHITE = "#e6e7e9"
const SILVER = "#a7aeb3"
const DIM = "#80868b"
const LINE = "#2b2d30"
const HIT = "#4ade80"
const MISS = "#fb7185"

export type CardSpec =
	| {
			type: "article"
			eyebrow: string
			title: string
			/** data: URI of a JPEG/PNG, already sized for the photo panel */
			photo?: string | null
	  }
	| {
			type: "game"
			title: string
			opponent: string
			raidersScore: number
			opponentScore: number
			photo?: string | null
	  }
	| {
			type: "pick"
			week: number
			awayNick: string
			homeNick: string
			awayAbbr: string
			homeAbbr: string
			predictedAway: number
			predictedHome: number
			/** Set once the game is final */
			final?: { away: number; home: number; result: "hit" | "miss" | "push" } | null
	  }
	| RankingsCardSpec
	| LeagueCardSpec
	| MathCardSpec
	| LabCardSpec
	| PlayCardSpec
	| ScoutCardSpec
	| LastCardSpec
	| TwinsCardSpec
	| PlayoffsCardSpec
	| MatchupCardSpec
	| SlateCardSpec
	| BoardCardSpec
	| {
			type: "scoreboard"
			season: number
			/** All zeros / null before anything is graded */
			hits: number
			misses: number
			accuracy: number | null
			keys?: { hit: number; miss: number } | null
			flags?: { hit: number; miss: number } | null
	  }
	| LiveCardSpec

/** The pixel size of a card: 1200x630 for every card but the tall version of a "will it last?", "season twins", playoff machine or matchup card (1080x1350). */
export function cardSize(spec: CardSpec): { width: number; height: number } {
	return spec.type === "last" ? lastCardSize(spec) : spec.type === "twins" ? twinsCardSize(spec) : spec.type === "playoffs" ? playoffsCardSize(spec) : spec.type === "matchup" || spec.type === "slate" || spec.type === "board" ? matchupCardSize(spec) : { width: OG_WIDTH, height: OG_HEIGHT }
}

/** Trim to a word boundary so a title never runs off the card. */
export function clip(text: string, max: number): string {
	const t = text.replace(/\s+/g, " ").trim()
	if (t.length <= max) return t
	const cut = t.slice(0, max)
	const sp = cut.lastIndexOf(" ")
	return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.:;\-–—]+$/, "")}…`
}

function titleSize(len: number): number {
	if (len <= 22) return 104
	if (len <= 36) return 88
	if (len <= 54) return 74
	if (len <= 76) return 62
	if (len <= 100) return 52
	return 46
}

const caps = { textTransform: "uppercase" as const }

function Eyebrow({ text }: { text: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div
				style={{
					display: "flex",
					fontFamily: "Oswald",
					fontWeight: 500,
					fontSize: 24,
					letterSpacing: 6,
					color: DIM,
					...caps,
				}}
			>
				{text}
			</div>
			<div style={{ display: "flex", width: 84, height: 3, marginTop: 14, backgroundColor: SILVER }} />
		</div>
	)
}

function RRMark({ size }: { size: number }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				border: `${Math.max(2, Math.round(size / 40))}px solid ${SILVER}`,
				fontFamily: "Anton",
				fontSize: size * 0.56,
				color: WHITE,
				letterSpacing: 1,
			}}
		>
			RR
		</div>
	)
}

function Brand() {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<RRMark size={44} />
			<div
				style={{
					display: "flex",
					marginLeft: 18,
					fontFamily: "Oswald",
					fontWeight: 500,
					fontSize: 24,
					letterSpacing: 5,
					color: SILVER,
					...caps,
				}}
			>
				raidersrundown.com
			</div>
		</div>
	)
}

function Shell({ children, right }: { children: ReactElement | ReactElement[]; right: ReactElement }) {
	return (
		<div
			style={{
				display: "flex",
				width: OG_WIDTH,
				height: OG_HEIGHT,
				backgroundColor: BG,
				backgroundImage: "radial-gradient(circle at 18% 12%, #17181a 0%, #0a0a0b 62%)",
				color: WHITE,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					flex: 1,
					padding: "62px 40px 52px 72px",
				}}
			>
				{children}
			</div>
			{right}
		</div>
	)
}

/** Right column for cards with no photo: hairline divider + a centerpiece. */
function Panel({ children }: { children: ReactElement | ReactElement[] }) {
	return (
		<div style={{ display: "flex", alignItems: "center", width: 360, padding: "0 0 0 0" }}>
			<div style={{ display: "flex", width: 2, height: 440, backgroundColor: LINE }} />
			<div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
				{children}
			</div>
		</div>
	)
}

function PhotoPanel({ src }: { src: string }) {
	return (
		<div style={{ display: "flex", position: "relative", width: 420, height: OG_HEIGHT }}>
			{/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
			<img src={src} width={420} height={OG_HEIGHT} style={{ width: 420, height: OG_HEIGHT, objectFit: "cover" }} />
			<div
				style={{
					display: "flex",
					position: "absolute",
					top: 0,
					left: 0,
					width: 420,
					height: OG_HEIGHT,
					backgroundImage: `linear-gradient(90deg, ${BG} 0%, rgba(10,10,11,0.55) 28%, rgba(10,10,11,0) 62%)`,
				}}
			/>
		</div>
	)
}

function Headline({ text, size }: { text: string; size: number }) {
	return (
		<div
			style={{
				display: "flex",
				fontFamily: "Anton",
				fontSize: size,
				lineHeight: 1.04,
				letterSpacing: 0.5,
				color: WHITE,
				...caps,
			}}
		>
			{text}
		</div>
	)
}

function Chip({ label, color }: { label: string; color: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				padding: "8px 18px",
				border: `2px solid ${color}`,
				color,
				fontFamily: "Oswald",
				fontWeight: 700,
				fontSize: 26,
				letterSpacing: 4,
				...caps,
			}}
		>
			{label}
		</div>
	)
}

function pct(n: number | null): string {
	return n === null ? "--" : `${Math.round(n * 100)}%`
}

/* ------------------------------------------------------------------ */

export function renderCard(spec: CardSpec): ReactElement {
	switch (spec.type) {
		case "article": {
			const title = clip(spec.title, 110)
			return (
				<Shell
					right={
						spec.photo ? (
							<PhotoPanel src={spec.photo} />
						) : (
							<Panel>
								<RRMark size={210} />
							</Panel>
						)
					}
				>
					<Eyebrow text={spec.eyebrow} />
					<Headline text={title} size={titleSize(title.length)} />
					<Brand />
				</Shell>
			)
		}

		case "game": {
			const title = clip(spec.title, 96)
			const won = spec.raidersScore > spec.opponentScore
			const tied = spec.raidersScore === spec.opponentScore
			return (
				<Shell
					right={
						spec.photo ? (
							<PhotoPanel src={spec.photo} />
						) : (
							<Panel>
								<RRMark size={210} />
							</Panel>
						)
					}
				>
					<Eyebrow text="Game report" />
					<div style={{ display: "flex", flexDirection: "column" }}>
						<Headline text={title} size={Math.min(titleSize(title.length), 74)} />
						<div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
							<Chip label={tied ? "Tie" : won ? "Win" : "Loss"} color={tied ? SILVER : won ? HIT : MISS} />
							<div
								style={{
									display: "flex",
									marginLeft: 22,
									fontFamily: "Oswald",
									fontWeight: 700,
									fontSize: 40,
									letterSpacing: 2,
									color: WHITE,
									...caps,
								}}
							>
								{`Raiders ${spec.raidersScore}  ·  ${spec.opponent.trim().split(" ").slice(-1)[0]} ${spec.opponentScore}`}
							</div>
						</div>
					</div>
					<Brand />
				</Shell>
			)
		}

		case "pick": {
			const f = spec.final
			const status = f ? (f.result === "hit" ? "Called it" : f.result === "miss" ? "Missed" : "Push") : null
			const statusColor = f ? (f.result === "hit" ? HIT : f.result === "miss" ? MISS : SILVER) : SILVER
			return (
				<Shell
					right={
						<Panel>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									width: 250,
									height: 300,
									border: `4px solid ${SILVER}`,
								}}
							>
								<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 5, color: DIM }}>
									MY PICK
								</div>
								<div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 30, letterSpacing: 3, width: 78, color: SILVER }}>
										{spec.awayAbbr}
									</div>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.05, color: WHITE }}>
										{spec.predictedAway}
									</div>
								</div>
								<div style={{ display: "flex", alignItems: "baseline" }}>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 30, letterSpacing: 3, width: 78, color: SILVER }}>
										{spec.homeAbbr}
									</div>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.05, color: WHITE }}>
										{spec.predictedHome}
									</div>
								</div>
							</div>
						</Panel>
					}
				>
					<Eyebrow text={`Week ${spec.week}  ·  The pick`} />
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div
							style={{
								display: "flex",
								fontFamily: "Anton",
								fontSize: 128,
								lineHeight: 1.0,
								letterSpacing: 0.5,
								color: WHITE,
								...caps,
							}}
						>
							{spec.awayNick}
						</div>
						<div
							style={{
								display: "flex",
								fontFamily: "Anton",
								fontSize: 128,
								lineHeight: 1.0,
								letterSpacing: 0.5,
								color: SILVER,
								...caps,
							}}
						>
							{`AT ${spec.homeNick}`}
						</div>
						<div style={{ display: "flex", alignItems: "center", marginTop: 24, height: 48 }}>
							{status && f ? (
								<div style={{ display: "flex", alignItems: "center" }}>
									<Chip label={status} color={statusColor} />
									<div
										style={{
											display: "flex",
											marginLeft: 20,
											fontFamily: "Oswald",
											fontWeight: 600,
											fontSize: 32,
											letterSpacing: 3,
											color: SILVER,
											...caps,
										}}
									>
										{`Final ${f.away}-${f.home}`}
									</div>
								</div>
							) : (
								<div
									style={{
										display: "flex",
										fontFamily: "Oswald",
										fontWeight: 600,
										fontSize: 32,
										letterSpacing: 4,
										color: SILVER,
										...caps,
									}}
								>
									Who you got?
								</div>
							)}
						</div>
					</div>
					<Brand />
				</Shell>
			)
		}

		case "rankings":
			return renderRankingsCard(spec)

		case "league":
			return renderLeagueCard(spec)

		case "live":
			return renderLiveCard(spec)

		case "math":
			return renderMathCard(spec)
		case "lab":
			return renderLabCard(spec)

		case "play":
			return renderPlayCard(spec)


		case "scout":
			return renderScoutCard(spec)

		case "last":
			return renderLastCard(spec)
		case "twins":
			return renderTwinsCard(spec)
		case "playoffs":
			return renderPlayoffsCard(spec)

		case "matchup":
			return renderMatchupCard(spec)
		case "slate":
			return renderSlateCard(spec)
		case "board":
			return renderBoardCard(spec)

		case "scoreboard": {
			const graded = spec.hits + spec.misses > 0
			const stat = (label: string, value: string) => (
				<div style={{ display: "flex", flexDirection: "column", marginRight: 56 }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 54, lineHeight: 1.05, color: WHITE }}>{value}</div>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 20, letterSpacing: 4, color: DIM, ...caps }}>
						{label}
					</div>
				</div>
			)
			return (
				<Shell
					right={
						<Panel>
							{graded ? (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										justifyContent: "center",
										width: 250,
										height: 300,
										border: `4px solid ${SILVER}`,
									}}
								>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: 88, lineHeight: 1.05, color: WHITE }}>
										{pct(spec.accuracy)}
									</div>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 5, color: DIM }}>
										WINNERS PICKED
									</div>
								</div>
							) : (
								<RRMark size={210} />
							)}
						</Panel>
					}
				>
					<Eyebrow text={`Prediction scoreboard  ·  ${spec.season}`} />
					{graded ? (
						<div style={{ display: "flex", flexDirection: "column" }}>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: 190, lineHeight: 0.98, color: WHITE }}>
								{`${spec.hits}-${spec.misses}`}
							</div>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: 58, lineHeight: 1.1, color: SILVER, ...caps }}>
								Graded in public
							</div>
							<div style={{ display: "flex", marginTop: 26 }}>
								{spec.keys && spec.keys.hit + spec.keys.miss > 0
									? stat("Keys hit", `${spec.keys.hit}-${spec.keys.miss}`)
									: null}
								{spec.flags && spec.flags.hit + spec.flags.miss > 0
									? stat("Flags called", `${spec.flags.hit}-${spec.flags.miss}`)
									: null}
							</div>
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column" }}>
							<Headline text="Every pick." size={92} />
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.04, color: SILVER, ...caps }}>
								Graded in public.
							</div>
						</div>
					)}
					<Brand />
				</Shell>
			)
		}
	}
}
