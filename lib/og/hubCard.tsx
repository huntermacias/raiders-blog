// The share card for the Lab hub (1200x630): "The Lab Report", the week's findings on one card. The Raiders' record and playoff odds on the
// left, five findings on the right, each with its number (and a face when it is about a player), so a post that links /lab has the
// whole week in the picture.
//
//   /api/og?type=hub
//
// buildHubSpec turns the hub's drops into a plain spec (no network); the route fetches each `headshot` into `photo`.
// See lib/og/kit.tsx for the Satori notes: inline styles only, and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import type { Drop, Pulse } from "../lab/hubKit"
import { SOURCES } from "./basis"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, HIT, LINE, MISS, SILVER, WHITE, caps, clip, rgba } from "./kit"

export type HubRow = {
	kicker: string
	headline: string
	value: string
	tone: Drop["tone"]
	initials: string | null
	headshot: string | null
	/** A face as a data: URI, put in by the route; absent or null draws the initials (or the tone dot for a finding with no face). */
	photo?: string | null
}

export type HubCardSpec = {
	type: "hub"
	season: number
	week: number | null
	record: string | null
	oddsText: string | null
	oddsGoal: string | null
	rows: HubRow[]
}

const W = 1200
const H = 630
const PAD = 56
const MAX_ROWS = 5

/** The findings that fit on a card, in the order the page shows them. */
export function buildHubSpec(drops: Drop[], pulse: Pulse, season: number): HubCardSpec | null {
	if (drops.length < 3) return null
	const odds = drops.find((d) => d.kind === "odds")
	return {
		type: "hub",
		season,
		week: pulse.week,
		record: pulse.record,
		oddsText: pulse.oddsText,
		oddsGoal: odds?.stat?.label ?? null,
		rows: drops
			.filter((d) => d.kind !== "odds")
			.slice(0, MAX_ROWS)
			.map((d) => ({
				kicker: d.kicker,
				headline: d.headline,
				value: d.stat?.value ?? "",
				tone: d.tone,
				initials: d.face?.initials ?? null,
				headshot: d.face?.headshot ?? null,
			})),
	}
}

const toneColor = (t: Drop["tone"]) => (t === "up" ? HIT : t === "down" ? MISS : SILVER)

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

function Face({ row, size }: { row: HubRow; size: number }) {
	const color = toneColor(row.tone)
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: size, height: size, borderRadius: size, overflow: "hidden", border: `3px solid ${color}`, backgroundColor: rgba(color, 0.22) }}>
			{row.photo ? (
				// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
				<img src={row.photo} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", objectPosition: "50% 15%" }} />
			) : row.initials ? (
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(size * 0.4), color: WHITE }}>{row.initials}</div>
			) : (
				<div style={{ display: "flex", width: Math.round(size * 0.3), height: Math.round(size * 0.3), borderRadius: size, backgroundColor: color }} />
			)}
		</div>
	)
}

export function renderHubCard(spec: HubCardSpec): ReactElement {
	const leftW = 400
	const rightW = W - PAD * 2 - leftW - 44
	return (
		<Frame glow={SILVER} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `32px ${PAD}px 24px` }}>
				<Eyebrow text={`The Lab · ${spec.week ? `Week ${spec.week}` : `${spec.season} season`}`} color={SILVER} />
				<div style={{ display: "flex", marginTop: 16, width: W - PAD * 2 }}>
					<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1, color: WHITE, ...caps }}>The Lab</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1, color: SILVER, ...caps }}>Report</div>
						<div style={label({ fontSize: 20, letterSpacing: 3, marginTop: 14, color: BRIGHT })}>{`${spec.rows.length} findings from the numbers`}</div>
						{spec.oddsText ? (
							<div style={{ display: "flex", flexDirection: "column", marginTop: 26, padding: "16px 22px", width: leftW, backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
								<div style={label({ fontSize: 15, letterSpacing: 3 })}>{spec.record ? `Raiders ${spec.record}` : "Raiders"}</div>
								<div style={{ display: "flex", alignItems: "baseline", marginTop: 6 }}>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: 76, lineHeight: 1, color: WHITE }}>{spec.oddsText}</div>
								</div>
								<div style={label({ fontSize: 16, letterSpacing: 2, marginTop: 6, color: BRIGHT })}>{clip(spec.oddsGoal ?? "playoff odds", 34)}</div>
							</div>
						) : null}
					</div>
					<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: 44, alignSelf: "flex-start", padding: "10px 22px 2px", backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
						{spec.rows.map((r, i) => (
							<div key={`${r.kicker}-${i}`} style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 4 : 10, paddingBottom: 10, borderBottom: i === spec.rows.length - 1 ? "none" : `1px solid ${LINE}`, width: rightW - 44 }}>
								<Face row={r} size={58} />
								<div style={{ display: "flex", flexDirection: "column", marginLeft: 16, flex: 1 }}>
									<div style={label({ fontSize: 14, letterSpacing: 3, color: toneColor(r.tone) })}>{clip(r.kicker, 30)}</div>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 21, lineHeight: 1.2, color: WHITE, marginTop: 2, width: rightW - 44 - 58 - 16 - 130 }}>{clip(r.headline, 74)}</div>
								</div>
								<div style={{ display: "flex", justifyContent: "flex-end", width: 130, fontFamily: "Anton", fontSize: r.value.length > 8 ? 22 : 32, color: WHITE, textAlign: "right" }}>{clip(r.value, 14)}</div>
							</div>
						))}
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 15, letterSpacing: 1, color: DIM }}>{`Data: ${SOURCES.grades}`}</div>
				</div>
			</div>
		</Frame>
	)
}
