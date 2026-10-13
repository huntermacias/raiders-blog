// The share card for a Player Lab leaderboard (1200x630): the stat and what it means, the five leaders with their photos, and the
// Raider (or the player named in the link) with his place, so a post that links the board has a face on it.
//
//   /api/og?type=playerboard&group=rb&stat=yards-after-contact[&slug=ashton-jeanty]
//
// buildPlayerBoardSpec turns the Lab's data into a plain spec (no network); the route fetches each `headshot` into `photo`.
// See lib/og/kit.tsx for the Satori notes: inline styles only, and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { teamNick } from "../lab/playerView"
import { type PlayerGroup, type PlayerRow, type PlayersData, GROUP_META, boardFor, contextOf, formatBox, formatStat, headshotUrl, leaders, ordinal, shotUrl, statInfo } from "../lab/playersKit"
import { SOURCES, sourceLine } from "./basis"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type PlayerBoardRow = {
	rank: number
	name: string
	/** "Raiders" */
	team: string
	value: string
	/** The team's colour on the dark card. */
	color: string
	initials: string
	/** Where his photo is, for the route to fetch; null when he has none. */
	headshot: string | null
	/** His photo as a data: URI, put in by the route; absent or null draws his initials. */
	photo?: string | null
}

export type PlayerBoardCardSpec = {
	type: "playerboard"
	/** "Running backs" */
	title: string
	/** "running backs" */
	peers: string
	label: string
	/** One plain sentence on what the number is. */
	blurb: string
	/** True when fewer is better. */
	lower: boolean
	rows: PlayerBoardRow[]
	/** Who is on the card, in words: "running backs with 30+ carries". */
	qualifier: string
	/** The player the link is about (or the best-placed Raider), with his place among the same players; place is null for a small sample. */
	focal: (PlayerBoardRow & { of: number; place: number | null }) | null
	season: number
	week: number
}

const W = 1200
const H = 630
const PAD = 56
const TOP = 5

/** The first sentence of a stat's description, trimmed so it fits under the title. */
function firstSentence(text: string, max: number): string {
	const first = text.split(/(?<=[.!?])\s+/)[0] ?? text
	return clip(first, max)
}

const initialsOf = (name: string) => {
	const parts = name.replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean)
	return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase()
}

function rowOf(data: PlayersData, p: PlayerRow, rank: number, value: string): PlayerBoardRow {
	return {
		rank,
		name: p.name,
		team: teamNick(p.team),
		value,
		color: p.team === "LV" ? WHITE : accent(opponentColors(p.team).dark),
		initials: initialsOf(p.name),
		// The NFL.com images are served as whatever the browser accepts (often webp), which the card cannot draw; ask for a png.
		headshot: p.espn ? headshotUrl(p.espn) : p.shot ? shotUrl(p.shot).replace("f_auto,q_auto", "f_png,w_400") : null,
	}
}

/** The spec for a board's card, or null when the group or the board does not exist or has fewer than three players. */
export function buildPlayerBoardSpec(data: PlayersData, group: PlayerGroup, path: string, slug?: string): PlayerBoardCardSpec | null {
	const board = boardFor(group, path)
	if (!board) return null
	const meta = GROUP_META[group]
	const info = board.kind === "stat" ? statInfo(group, board.key) : null
	// A line's number is shared by the five who start together, so no card ranks linemen on it.
	if (info?.unit) return null
	const fmt = (v: number) => (board.kind === "box" ? formatBox(group, board.key, v) : formatStat(group, board.key, v))
	// The card ranks by the number it shows, among the players who have carried the load (half the typical volume or more), so the
	// five read in order of their values. The page ranks on a value pulled toward the league for small samples; its ranks can differ.
	let pool = leaders(data, board)
	let qualifier = `every ${meta.single.toLowerCase()}`
	if (board.kind === "stat" && info) {
		const vols = pool.map((r) => r.volume ?? 0).sort((a, b) => a - b)
		const minVol = Math.max(1, Math.round((vols[Math.floor(vols.length / 2)] ?? 0) * 0.5))
		pool = pool.filter((r) => (r.volume ?? 0) >= minVol && contextOf(data, r.player, r.player.stats.find((s) => s.k === board.key)!)?.signal !== "luck")
		pool.sort((a, b) => (info.higher === false ? a.value - b.value : b.value - a.value) || (b.volume ?? 0) - (a.volume ?? 0) || a.player.name.localeCompare(b.player.name))
		qualifier = `${meta.peers} with ${minVol}+ ${info.per}`
	}
	if (pool.length < 3) return null
	const rows = pool.slice(0, TOP).map((r, i) => rowOf(data, r.player, i + 1, fmt(r.value)))
	const at = slug ? pool.findIndex((r) => r.player.slug === slug) : -1
	const raider = at >= 0 ? at : pool.findIndex((r) => r.player.team === data.team)
	let focal: PlayerBoardCardSpec["focal"] = null
	if (raider >= 0) focal = { ...rowOf(data, pool[raider].player, raider + 1, fmt(pool[raider].value)), of: pool.length, place: raider + 1 }
	else {
		// Named in the link (or a Raider) but short of the volume: shown with his number and no place.
		const named = leaders(data, board).find((r) => (slug ? r.player.slug === slug : r.player.team === data.team))
		if (named) focal = { ...rowOf(data, named.player, 0, fmt(named.value)), of: pool.length, place: null }
	}
	return {
		type: "playerboard",
		title: meta.title,
		peers: meta.peers,
		label: board.label,
		blurb: info ? firstSentence(info.what, 118) : `Season total for every NFL ${meta.single.toLowerCase()}.`,
		lower: info?.higher === false,
		rows,
		qualifier,
		focal,
		season: data.season,
		week: data.week,
	}
}

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

function Face({ row, size }: { row: PlayerBoardRow; size: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: size, height: size, borderRadius: size, overflow: "hidden", border: `${Math.max(3, Math.round(size / 16))}px solid ${row.color}`, backgroundColor: rgba(row.color, 0.3) }}>
			{row.photo ? (
				// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
				<img src={row.photo} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", objectPosition: "50% 15%" }} />
			) : (
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(size * 0.4), color: WHITE }}>{row.initials}</div>
			)}
		</div>
	)
}

export function renderPlayerBoardCard(spec: PlayerBoardCardSpec): ReactElement {
	const leftW = 480
	const rightW = W - PAD * 2 - leftW - 44
	const title = clip(spec.label, 30).toUpperCase()
	const size = title.length <= 14 ? 88 : title.length <= 20 ? 72 : 58
	const glow = spec.rows[0]?.color ?? SILVER
	return (
		<Frame glow={glow} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `32px ${PAD}px 24px` }}>
				<Eyebrow text={`Player Lab · ${spec.title} leaders`} color={glow} />
				<div style={{ display: "flex", marginTop: 18, width: W - PAD * 2 }}>
					<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1.02, color: WHITE, ...caps }}>{title}</div>
						<div style={label({ fontSize: 20, letterSpacing: 3, marginTop: 12, color: BRIGHT })}>{`${spec.peers}, ${spec.season} through week ${spec.week}${spec.lower ? " · lower is better" : ""}`}</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 23, lineHeight: 1.3, color: SILVER, marginTop: 14, width: leftW }}>{spec.blurb}</div>
						{spec.focal ? (
							<div style={{ display: "flex", alignItems: "center", marginTop: 20, padding: "12px 18px", width: leftW, backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${rgba(spec.focal.color, 0.75)}` }}>
								<Face row={spec.focal} size={84} />
								<div style={{ display: "flex", flexDirection: "column", marginLeft: 18, width: leftW - 160 }}>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: 36, lineHeight: 1.05, color: WHITE, ...caps }}>{clip(spec.focal.name, 17)}</div>
									<div style={{ display: "flex", alignItems: "baseline", marginTop: 6 }}>
										<div style={{ display: "flex", fontFamily: "Anton", fontSize: 40, lineHeight: 1, color: spec.focal.color }}>{spec.focal.value}</div>
										<div style={{ display: "flex", marginLeft: 14, fontFamily: "Oswald", fontWeight: 500, fontSize: 21, color: BRIGHT }}>{spec.focal.place ? `${ordinal(spec.focal.place)} of ${spec.focal.of}` : "small sample"}</div>
									</div>
								</div>
							</div>
						) : null}
					</div>
					<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: 44, alignSelf: "flex-start", padding: "14px 22px 4px", backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
						<div style={label({ fontSize: 15, letterSpacing: 3 })}>{`The ${spec.rows.length} best · ${clip(spec.qualifier, 40)}`}</div>
						{spec.rows.map((r, i) => (
							<div key={r.name} style={{ display: "flex", alignItems: "center", marginTop: 10, paddingBottom: 10, borderBottom: i === spec.rows.length - 1 ? "none" : `1px solid ${LINE}`, width: rightW - 44 }}>
								<div style={{ display: "flex", width: 44, fontFamily: "Anton", fontSize: 30, color: i === 0 ? r.color : DIM }}>{r.rank}</div>
								<Face row={r} size={58} />
								<div style={{ display: "flex", flexDirection: "column", marginLeft: 16, flex: 1 }}>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 27, color: WHITE, ...caps }}>{clip(r.name, 22)}</div>
									<div style={label({ fontSize: 15, letterSpacing: 2, color: DIM })}>{r.team}</div>
								</div>
								<div style={{ display: "flex", fontFamily: "Anton", fontSize: 36, color: WHITE }}>{r.value}</div>
							</div>
						))}
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 15, letterSpacing: 1, color: DIM }}>{sourceLine(SOURCES.grades, spec.season, spec.week)}</div>
				</div>
			</div>
		</Frame>
	)
}
