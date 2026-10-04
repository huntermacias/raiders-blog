// Team colors for the Lab, in both themes.
//
// The opponent is drawn in its own team color (the same hex the power rankings use, from
// lib/nfl.ts), nudged only as far as needed so it stays readable:
//
//  - dark theme: lifted into a lightness band that reads on near-black, and kept away from
//    the Raiders' silver (so New Orleans gold does not melt into it)
//  - light theme: pulled into a band that reads on white, and kept away from the Raiders' black
//
// Hue is preserved, so Miami is still aqua and Dallas is still blue. Both sides are also named
// in text everywhere, so the colors are never the only way to tell them apart.
//
// Math is in OKLab, where equal numeric steps look like equal color steps.

import { TEAMS } from "@/lib/nfl"

export type Mode = "dark" | "light"

/** The Raiders: silver on dark, black on light. */
export const TEAM_COLOR: Record<Mode, string> = { dark: "#dfe3ea", light: "#14171c" }
/** The turf the drive routes are drawn on (mirrors --lab-field in styles/globals.css). */
export const FIELD: Record<Mode, string> = { dark: "#12281c", light: "#b4d3ab" }
/** The chart surfaces the colors sit on. */
export const SURFACE: Record<Mode, string> = { dark: "#0b0d10", light: "#ffffff" }
/** Ink for text that sits on a team color. */
const INK_DARK = "#0b0d10"
const INK_LIGHT = "#ffffff"
const FALLBACK = "#d95926"

type Lab = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "")
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

function hexToOklab(hex: string): Lab {
	const [r, g, b] = hexToRgb(hex).map(toLinear)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

function oklabToLinear([L, a, b]: Lab): [number, number, number] {
	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
	const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
	return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)

function toHex(rgbLinear: number[]): string {
	return (
		"#" +
		rgbLinear
			.map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255))
			.map((v) => v.toString(16).padStart(2, "0"))
			.join("")
	)
}

/** A color from lightness, chroma and hue, with chroma reduced until it fits in sRGB. */
function fromLCh(L: number, C: number, h: number): string {
	let c = C
	for (let i = 0; i < 40; i++) {
		const rgb = oklabToLinear([L, c * Math.cos(h), c * Math.sin(h)])
		if (inGamut(rgb)) return toHex(rgb)
		c *= 0.94
	}
	return toHex(oklabToLinear([L, 0, 0]))
}

function luminance(hex: string): number {
	const [r, g, b] = hexToRgb(hex).map(toLinear)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

/** Perceptual distance in OKLab, scaled by 100. About 2 is just noticeable; 20+ is obvious. */
export function deltaE(a: string, b: string): number {
	const [x, y] = [hexToOklab(a), hexToOklab(b)]
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100
}

const BAND: Record<Mode, [number, number]> = { dark: [0.66, 0.8], light: [0.4, 0.54] }
/** How far the opponent must sit from the Raiders color. */
const MIN_APART = 24

/** The opponent's team color, adjusted to read on the given theme's surface. */
export function teamColorFor(baseHex: string, mode: Mode): string {
	const [L, a, b] = hexToOklab(baseHex)
	const h = Math.atan2(b, a)
	const C = Math.max(Math.hypot(a, b), 0.07)
	const [lo, hi] = BAND[mode]
	const mine = TEAM_COLOR[mode]
	// Away from the Raiders color means lighter-than-silver is impossible, so go darker on dark
	// surfaces; on light surfaces go lighter than black.
	const step = mode === "dark" ? -0.02 : 0.02
	const floor = mode === "dark" ? 0.5 : 0.4
	const ceil = mode === "dark" ? 0.8 : 0.66
	let l = Math.min(hi, Math.max(lo, L))
	let out = fromLCh(l, C, h)
	for (let i = 0; i < 30 && deltaE(out, mine) < MIN_APART; i++) {
		const next = l + step
		if (next < floor || next > ceil) break
		l = next
		out = fromLCh(l, C, h)
	}
	return out
}

/** Black or white, whichever is easier to read on this color. */
export function inkOn(hex: string): string {
	return contrast(hex, INK_DARK) >= contrast(hex, INK_LIGHT) ? INK_DARK : INK_LIGHT
}

export type OpponentColors = {
	dark: string
	light: string
	onDark: string
	onLight: string
}

export function baseColor(abbr: string): string {
	return TEAMS.find((t) => t.abbr === abbr)?.color ?? FALLBACK
}

export function opponentColors(abbr: string): OpponentColors {
	const base = baseColor(abbr)
	const dark = teamColorFor(base, "dark")
	const light = teamColorFor(base, "light")
	return { dark, light, onDark: inkOn(dark), onLight: inkOn(light) }
}

/**
 * Inline custom properties for a game's wrapper element. The stylesheet (.lab-opp in
 * styles/globals.css) picks the light or dark pair to match the theme.
 */
export function labColorVars(abbr: string): Record<string, string> {
	const c = opponentColors(abbr)
	return {
		"--lab-opp-dark": c.dark,
		"--lab-opp-light": c.light,
		"--lab-on-opp-dark": c.onDark,
		"--lab-on-opp-light": c.onLight,
	}
}
