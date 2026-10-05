// Colors for the Lab, as CSS variable references so the same markup works in light and dark.
//
// The values live in styles/globals.css (.lab and .lab-opp). The opponent's color is set per game
// from lib/lab/colors.ts. Use these in `style` props and SVG attributes; in class names use the
// matching Tailwind colors (bg-lab-surface, text-lab-ink, border-lab-line, ...).
//
// The Raiders are silver on dark and black on light. The opponent wears its own team color.
// Both sides are named in text next to every chart, so color is never the only cue.
export const LAB = {
	page: "var(--lab-page)",
	surface: "var(--lab-surface)",
	line: "var(--lab-line)",
	grid: "var(--lab-grid)",
	axis: "var(--lab-axis)",
	ink: "var(--lab-ink)",
	inkSoft: "var(--lab-ink-soft)",
	inkMuted: "var(--lab-ink-muted)",
	team: "var(--lab-team)",
	opp: "var(--lab-opp)",
	opp2: "var(--lab-opp2)",
	onTeam: "var(--lab-on-team)",
	onOpp: "var(--lab-on-opp)",
	onOpp2: "var(--lab-on-opp2)",
	field: "var(--lab-field)",
	fieldBand: "var(--lab-field-band)",
	fieldLine: "var(--lab-field-line)",
	fieldNum: "var(--lab-field-num)",
	fieldGlow: "var(--lab-field-glow)",
	fieldShade: "var(--lab-field-shade)",
	casing: "var(--lab-casing)",
	firstDown: "var(--lab-first-down)",
	scrimmage: "var(--lab-scrimmage)",
	bad: "var(--lab-bad)",
	onFirstDown: "var(--lab-on-first-down)",
	ball: "var(--lab-ball)",
	ballDark: "var(--lab-ball-dark)",
	lace: "var(--lab-lace)",
	board: "var(--lab-board)",
	boardLine: "var(--lab-board-line)",
	stand: "var(--lab-stand)",
	sky: "var(--lab-sky)",
	post: "var(--lab-post)",
	lightPool: "var(--lab-light-pool)",
} as const
