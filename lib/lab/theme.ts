// Colors for the Lab. The Lab is always dark (broadcast graphics), whatever
// theme the rest of the site is in.
//
// The Raiders are silver, the one neutral on the page, so the eye goes there
// first. The opponent is a warm orange that stays ~30 delta-E away from silver
// for every kind of color vision (checked with the dataviz palette validator on
// a dark surface). Both sides are also named in text on the chart, so the
// colors are never the only way to tell them apart.
export const LAB = {
	surface: "#0b0d10",
	panel: "#12151a",
	line: "rgba(255,255,255,0.10)",
	grid: "rgba(255,255,255,0.07)",
	ink: "#f3f4f6",
	inkSoft: "#b4bac4",
	inkMuted: "#8b93a0",
	team: "#dfe3ea",
	opp: "#d95926",
	yardLine: "#e5e7eb",
	firstDown: "#f5d90a",
	scrimmage: "#4da3ff",
} as const
