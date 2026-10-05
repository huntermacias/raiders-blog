// Shared pieces for the 1200x630 share cards that use the "stage" look (the league and rankings cards): the
// near-black stage with a silver spotlight, speed lines and a colored glow, plus the small parts they share.
// Satori only understands a flexbox subset of CSS, so styling is inline and every element with more than one
// child is display:flex. (A drop shadow on a rotated box crashes resvg; put the glow on a plain box behind it.)

import type { ReactElement } from "react"

export const W = 1200
export const H = 630

export const BG = "#0a0a0b"
export const PANEL = "#111214"
export const WHITE = "#e6e7e9"
export const SILVER = "#a7aeb3"
export const BRIGHT = "#cfd3d6"
export const DIM = "#80868b"
export const LINE = "#2b2d30"
export const HIT = "#4ade80"
export const GOLD = "#f2c14e"
export const BRONZE = "#d99a6c"
export const MISS = "#fb7185"

export const caps = { textTransform: "uppercase" as const }

export function clip(text: string, max: number): string {
	const t = text.replace(/\s+/g, " ").trim()
	return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/** A team's colour for glows and bars, unless it would vanish into the dark card. */
export function accent(hex: string): string {
	const m = /^#([0-9a-f]{6})$/i.exec(hex)
	if (!m) return SILVER
	const n = parseInt(m[1], 16)
	const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
	return lum < 0.1 ? SILVER : hex
}

export const rgba = (hex: string, a: number): string => {
	const m = /^#([0-9a-f]{6})$/i.exec(hex)
	if (!m) return `rgba(167,174,179,${a})`
	const n = parseInt(m[1], 16)
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function RRMark({ size, color = SILVER }: { size: number; color?: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, border: `${Math.max(2, Math.round(size / 40))}px solid ${color}`, fontFamily: "Anton", fontSize: size * 0.56, color: WHITE, letterSpacing: 1 }}>RR</div>
	)
}

export function Brand() {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<RRMark size={44} />
			<div style={{ display: "flex", marginLeft: 18, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 5, color: SILVER, ...caps }}>raidersrundown.com</div>
		</div>
	)
}

export function Eyebrow({ text, color = SILVER }: { text: string; color?: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 6, color: DIM, ...caps }}>{text}</div>
			<div style={{ display: "flex", width: 84, height: 4, marginTop: 14, backgroundColor: color, boxShadow: `0 0 18px ${rgba(color, 0.8)}` }} />
		</div>
	)
}

/** Slanted speed lines, brightest toward the right, behind everything. */
export function Speed() {
	const lines: ReactElement[] = []
	for (let i = -8; i < 24; i++) {
		const op = Math.max(0.015, Math.min(0.09, 0.012 + (i + 8) * 0.0028))
		lines.push(<line key={i} x1={i * 64 + 220} y1={H} x2={i * 64 + 220 + H * 0.62} y2={0} stroke="#ffffff" strokeOpacity={op} strokeWidth={i % 4 === 0 ? 4 : 2} />)
	}
	return (
		<svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
			{lines}
		</svg>
	)
}

/**
 * The stage every league card stands on: near-black, a silver spotlight from the top left (the blogger's
 * side), a glow in `glow` from the bottom right (the player's side, or this week's opponent), the speed
 * lines, and a bar across the top that fades from silver into the glow color.
 */
export function Frame({ glow = SILVER, ghost, children }: { glow?: string; ghost?: string; children: (ReactElement | null)[] | ReactElement }) {
	return (
		<div style={{ display: "flex", position: "relative", width: W, height: H, overflow: "hidden", backgroundColor: BG, backgroundImage: `radial-gradient(circle at 92% 108%, ${rgba(glow, 0.34)} 0%, ${rgba(glow, 0)} 52%), radial-gradient(circle at 6% -8%, rgba(207,211,214,0.2) 0%, rgba(207,211,214,0) 46%)`, color: WHITE }}>
			<Speed />
			{ghost ? <div style={{ display: "flex", position: "absolute", right: -30, top: 70, fontFamily: "Anton", fontSize: 560, lineHeight: 1, color: "rgba(255,255,255,0.035)" }}>{ghost}</div> : null}
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 7, backgroundImage: `linear-gradient(90deg, #e6e7e9 0%, #a7aeb3 35%, ${glow} 100%)` }} />
			{children}
		</div>
	)
}


export function Button({ text, note }: { text: string; note?: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<div style={{ display: "flex", padding: "11px 34px", backgroundImage: "linear-gradient(180deg, #f4f5f6 0%, #b9bfc4 100%)", color: BG, fontFamily: "Oswald", fontWeight: 700, fontSize: 28, letterSpacing: 4, boxShadow: "0 0 34px rgba(207,211,214,0.38)", ...caps }}>{text}</div>
			{note ? <div style={{ display: "flex", marginLeft: 22, fontFamily: "Oswald", fontWeight: 500, fontSize: 20, letterSpacing: 3, color: DIM, ...caps }}>{note}</div> : null}
		</div>
	)
}

