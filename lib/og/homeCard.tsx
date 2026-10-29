// The "Season so far" share card from the homepage: the Raiders' record game by game, their playoff odds, their power rank and how the
// picks have done, on one 1200x630 card. Everything the card shows is a small number carried in its own address, so it is drawn without a
// trip to Sanity; the address is read back strictly (whole numbers in a sane range, nothing free-form) so a card can never be made to say
// anything but a record and a few percentages. Pure: the route fetches the logo and passes it in.

import type { ReactElement } from "react"

import { Brand, DIM, Eyebrow, Frame, HIT, LINE, MISS, SILVER, WHITE, caps, rgba } from "./kit"

const FONT_HEAD = "Anton"
const FONT_TEXT = "Oswald"

export type HomeCardSpec = {
	type: "home"
	kind: "season"
	/** The week of the latest finished game. */
	week: number
	record: { w: number; l: number; t: number }
	/** Result of each finished game, oldest first. */
	results: ("W" | "L" | "T")[]
	/** Playoff chance in percent and the move since last week in points (null when not known). */
	odds: { pct: number; delta: number | null } | null
	rank: { n: number; change: number | null } | null
	picks: { hits: number; misses: number; pct: number } | null
	streak: { kind: "hit" | "miss"; length: number } | null
	/** data: URI of the Raiders' logo, set by the route. */
	logo: string | null
}

export const HOME_LOGO_TEAM = "LV"

const int = (v: string | undefined, min: number, max: number): number | null => {
	if (v == null || !/^-?\d{1,3}$/.test(v)) return null
	const n = Number(v)
	return n >= min && n <= max ? n : null
}

/** The card's address: only whole numbers and a string of W/L/T. */
export function homeQuery(s: Omit<HomeCardSpec, "type" | "logo" | "kind">): string {
	const q = new URLSearchParams()
	q.set("kind", "season")
	q.set("wk", String(s.week))
	q.set("w", String(s.record.w))
	q.set("l", String(s.record.l))
	q.set("t", String(s.record.t))
	if (s.results.length) q.set("res", s.results.join(""))
	if (s.odds) {
		q.set("odds", String(s.odds.pct))
		if (s.odds.delta != null) q.set("oddsd", String(s.odds.delta))
	}
	if (s.rank) {
		q.set("rank", String(s.rank.n))
		if (s.rank.change != null) q.set("rankd", String(s.rank.change))
	}
	if (s.picks) {
		q.set("hit", String(s.picks.hits))
		q.set("miss", String(s.picks.misses))
	}
	if (s.streak) {
		q.set("sk", s.streak.kind)
		q.set("sl", String(s.streak.length))
	}
	return q.toString()
}

/** Reads the address back. Null when it is not a record we could draw. */
export function parseHomeQuery(get: (key: string) => string | undefined): Omit<HomeCardSpec, "logo"> | null {
	if ((get("kind") ?? "season") !== "season") return null
	const w = int(get("w"), 0, 30)
	const l = int(get("l"), 0, 30)
	const t = int(get("t"), 0, 30)
	const week = int(get("wk"), 0, 30)
	if (w == null || l == null || t == null || week == null) return null
	const res = (get("res") ?? "").replace(/[^WLT]/g, "").slice(0, 20).split("") as ("W" | "L" | "T")[]
	const odds = int(get("odds"), 0, 100)
	const oddsd = int(get("oddsd"), -100, 100)
	const rank = int(get("rank"), 1, 32)
	const rankd = int(get("rankd"), -31, 31)
	const hit = int(get("hit"), 0, 40)
	const miss = int(get("miss"), 0, 40)
	const sk = get("sk")
	const sl = int(get("sl"), 1, 40)
	return {
		type: "home",
		kind: "season",
		week,
		record: { w, l, t },
		results: res,
		odds: odds == null ? null : { pct: odds, delta: oddsd },
		rank: rank == null ? null : { n: rank, change: rankd },
		picks: hit == null || miss == null || hit + miss === 0 ? null : { hits: hit, misses: miss, pct: Math.round((hit / (hit + miss)) * 100) },
		streak: (sk === "hit" || sk === "miss") && sl != null ? { kind: sk, length: sl } : null,
	}
}

/** "Last pick missed", "3 straight picks right": one is not a streak. */
export function streakText(s: { kind: "hit" | "miss"; length: number }): string {
	if (s.length <= 1) return s.kind === "hit" ? "Last pick right" : "Last pick missed"
	return `${s.length} straight picks ${s.kind === "hit" ? "right" : "missed"}`
}

export const homeCardSize = () => ({ width: 1200, height: 630 })

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0")
const tone = (n: number | null) => (n == null || n === 0 ? DIM : n > 0 ? HIT : MISS)

function Stat({ label, value, note, noteColor, width }: { label: string; value: string; note: string | null; noteColor: string; width: number }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", width, paddingLeft: 24, borderLeft: `2px solid ${LINE}` }}>
			<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 19, letterSpacing: 4, color: DIM, ...caps }}>{label}</div>
			<div style={{ display: "flex", fontFamily: FONT_HEAD, fontSize: 74, lineHeight: 1.05, color: WHITE, marginTop: 6 }}>{value}</div>
			<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 22, letterSpacing: 2, color: noteColor, marginTop: 4, minHeight: 28 }}>{note ?? ""}</div>
		</div>
	)
}

export function renderHomeCard(spec: HomeCardSpec): ReactElement {
	const rec = `${spec.record.w}–${spec.record.l}${spec.record.t ? `–${spec.record.t}` : ""}`
	const stats = [
		spec.odds ? { label: "Playoff odds", value: `${spec.odds.pct}%`, note: spec.odds.delta ? `${sign(spec.odds.delta)} pts this week` : "model estimate", color: tone(spec.odds.delta) } : null,
		spec.rank ? { label: "Power rank", value: `No. ${spec.rank.n}`, note: spec.rank.change ? `${spec.rank.change > 0 ? "up" : "down"} ${Math.abs(spec.rank.change)} spots` : "unchanged", color: tone(spec.rank.change) } : null,
		spec.picks ? { label: "Pick accuracy", value: `${spec.picks.pct}%`, note: `${spec.picks.hits}–${spec.picks.misses} on the winner`, color: DIM } : null,
	].filter((x): x is NonNullable<typeof x> => x != null)
	const colW = stats.length ? Math.floor(1072 / stats.length) - 12 : 0

	return (
		<Frame glow={SILVER}>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 44 }}>
				<Eyebrow text={`The Raiders · after week ${spec.week}`} color={SILVER} />
			</div>
			<div style={{ display: "flex", alignItems: "center", position: "absolute", left: 64, top: 112 }}>
				{spec.logo ? (
					// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
					<img src={spec.logo} width={132} height={132} style={{ width: 132, height: 132, objectFit: "contain" }} />
				) : (
					<div style={{ display: "flex", width: 132, height: 132, borderRadius: 132, border: `4px solid ${SILVER}`, alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 52, color: WHITE }}>LV</div>
				)}
				<div style={{ display: "flex", flexDirection: "column", marginLeft: 34 }}>
					<div style={{ display: "flex", fontFamily: FONT_HEAD, fontSize: 168, lineHeight: 1, color: WHITE }}>{rec}</div>
				</div>
				<div style={{ display: "flex", flexDirection: "column", marginLeft: 44, width: 500 }}>
					<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 19, letterSpacing: 4, color: DIM, ...caps }}>Game by game</div>
					<div style={{ display: "flex", flexWrap: "wrap", marginTop: 12 }}>
						{spec.results.map((r, i) => (
							<div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, marginRight: 10, marginBottom: 10, borderRadius: 10, border: `3px solid ${r === "W" ? HIT : r === "L" ? MISS : DIM}`, backgroundColor: rgba(r === "W" ? HIT : r === "L" ? MISS : DIM, 0.14), fontFamily: FONT_HEAD, fontSize: 28, color: r === "W" ? HIT : r === "L" ? MISS : WHITE }}>{r}</div>
						))}
					</div>
					{spec.streak ? <div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 21, letterSpacing: 3, color: DIM, marginTop: 2, ...caps }}>{streakText(spec.streak)}</div> : null}
				</div>
			</div>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 340, width: 1072 }}>
				{stats.map((s) => (
					<Stat key={s.label} label={s.label} value={s.value} note={s.note} noteColor={s.color} width={colW} />
				))}
			</div>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 548 }}>
				<Brand />
			</div>
		</Frame>
	)
}
