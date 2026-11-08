// A team's color made readable on a near-black ground. Navy, purple and black would vanish on the dark masthead, so they are lightened toward
// white until they reach a contrast of 3.4:1; the Raiders are silver, as on the share cards. Pure.

const DARK = "#09090b"
export const RAIDERS_SILVER = "#cfd3d6"

function rgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "")
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
	const f = (v: number) => {
		const c = v / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")).join("")}`

/** WCAG contrast of `hex` against the masthead's ground. */
export function contrastOnDark(hex: string): number {
	return (luminance(rgb(hex)) + 0.05) / (luminance(rgb(DARK)) + 0.05)
}

/** `hex`, lightened until it reads on the dark ground. */
export function accentOnDark(hex: string, abbr?: string, minContrast = 3.4): string {
	if (abbr === "LV") return RAIDERS_SILVER
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#a1a1aa"
	let [r, g, b] = rgb(hex)
	for (let i = 0; i < 24 && contrastOnDark(toHex(r, g, b)) < minContrast; i++) {
		r += (255 - r) * 0.12
		g += (255 - g) * 0.12
		b += (255 - b) * 0.12
	}
	return toHex(r, g, b)
}

/** `#rrggbb` as an rgba() string, for glows and washes. */
export function withAlpha(hex: string, alpha: number): string {
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return `rgba(161,161,170,${alpha})`
	const [r, g, b] = rgb(hex)
	return `rgba(${r},${g},${b},${alpha})`
}
