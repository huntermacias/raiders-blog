// Static NFL team reference data. Plain TypeScript with no framework imports so
// it can be shared by the Next.js app *and* the Sanity Studio schemas (the
// Studio uses TEAM_NAMES for its dropdowns).

export type Conference = "AFC" | "NFC"

export type TeamInfo = {
	/** Full name, exactly as stored in Sanity (e.g. "Las Vegas Raiders"). */
	name: string
	/** Short display name (e.g. "Raiders"). */
	nick: string
	abbr: string
	conference: Conference
	/** e.g. "AFC West" */
	division: string
	/** Approximate primary color, used only as a small decorative dot. */
	color: string
}

export const RAIDERS = "Las Vegas Raiders"

export const TEAMS: TeamInfo[] = [
	// AFC East
	{ name: "Buffalo Bills", nick: "Bills", abbr: "BUF", conference: "AFC", division: "AFC East", color: "#00338D" },
	{ name: "Miami Dolphins", nick: "Dolphins", abbr: "MIA", conference: "AFC", division: "AFC East", color: "#008E97" },
	{ name: "New England Patriots", nick: "Patriots", abbr: "NE", conference: "AFC", division: "AFC East", color: "#C60C30" },
	{ name: "New York Jets", nick: "Jets", abbr: "NYJ", conference: "AFC", division: "AFC East", color: "#125740" },
	// AFC North
	{ name: "Baltimore Ravens", nick: "Ravens", abbr: "BAL", conference: "AFC", division: "AFC North", color: "#241773" },
	{ name: "Cincinnati Bengals", nick: "Bengals", abbr: "CIN", conference: "AFC", division: "AFC North", color: "#FB4F14" },
	{ name: "Cleveland Browns", nick: "Browns", abbr: "CLE", conference: "AFC", division: "AFC North", color: "#FF3C00" },
	{ name: "Pittsburgh Steelers", nick: "Steelers", abbr: "PIT", conference: "AFC", division: "AFC North", color: "#FFB612" },
	// AFC South
	{ name: "Houston Texans", nick: "Texans", abbr: "HOU", conference: "AFC", division: "AFC South", color: "#A71930" },
	{ name: "Indianapolis Colts", nick: "Colts", abbr: "IND", conference: "AFC", division: "AFC South", color: "#002C5F" },
	{ name: "Jacksonville Jaguars", nick: "Jaguars", abbr: "JAX", conference: "AFC", division: "AFC South", color: "#006778" },
	{ name: "Tennessee Titans", nick: "Titans", abbr: "TEN", conference: "AFC", division: "AFC South", color: "#4B92DB" },
	// AFC West
	{ name: "Denver Broncos", nick: "Broncos", abbr: "DEN", conference: "AFC", division: "AFC West", color: "#FB4F14" },
	{ name: "Kansas City Chiefs", nick: "Chiefs", abbr: "KC", conference: "AFC", division: "AFC West", color: "#E31837" },
	{ name: "Las Vegas Raiders", nick: "Raiders", abbr: "LV", conference: "AFC", division: "AFC West", color: "#A5ACAF" },
	{ name: "Los Angeles Chargers", nick: "Chargers", abbr: "LAC", conference: "AFC", division: "AFC West", color: "#0080C6" },
	// NFC East
	{ name: "Dallas Cowboys", nick: "Cowboys", abbr: "DAL", conference: "NFC", division: "NFC East", color: "#003594" },
	{ name: "New York Giants", nick: "Giants", abbr: "NYG", conference: "NFC", division: "NFC East", color: "#0B2265" },
	{ name: "Philadelphia Eagles", nick: "Eagles", abbr: "PHI", conference: "NFC", division: "NFC East", color: "#004C54" },
	{ name: "Washington Commanders", nick: "Commanders", abbr: "WAS", conference: "NFC", division: "NFC East", color: "#5A1414" },
	// NFC North
	{ name: "Chicago Bears", nick: "Bears", abbr: "CHI", conference: "NFC", division: "NFC North", color: "#C83803" },
	{ name: "Detroit Lions", nick: "Lions", abbr: "DET", conference: "NFC", division: "NFC North", color: "#0076B6" },
	{ name: "Green Bay Packers", nick: "Packers", abbr: "GB", conference: "NFC", division: "NFC North", color: "#203731" },
	{ name: "Minnesota Vikings", nick: "Vikings", abbr: "MIN", conference: "NFC", division: "NFC North", color: "#4F2683" },
	// NFC South
	{ name: "Atlanta Falcons", nick: "Falcons", abbr: "ATL", conference: "NFC", division: "NFC South", color: "#A71930" },
	{ name: "Carolina Panthers", nick: "Panthers", abbr: "CAR", conference: "NFC", division: "NFC South", color: "#0085CA" },
	{ name: "New Orleans Saints", nick: "Saints", abbr: "NO", conference: "NFC", division: "NFC South", color: "#D3BC8D" },
	{ name: "Tampa Bay Buccaneers", nick: "Buccaneers", abbr: "TB", conference: "NFC", division: "NFC South", color: "#D50A0A" },
	// NFC West
	{ name: "Arizona Cardinals", nick: "Cardinals", abbr: "ARI", conference: "NFC", division: "NFC West", color: "#97233F" },
	{ name: "Los Angeles Rams", nick: "Rams", abbr: "LAR", conference: "NFC", division: "NFC West", color: "#003594" },
	{ name: "San Francisco 49ers", nick: "49ers", abbr: "SF", conference: "NFC", division: "NFC West", color: "#AA0000" },
	{ name: "Seattle Seahawks", nick: "Seahawks", abbr: "SEA", conference: "NFC", division: "NFC West", color: "#69BE28" },
]

export const TEAM_NAMES: string[] = TEAMS.map((t) => t.name)

export const DIVISIONS: string[] = [
	"AFC East",
	"AFC North",
	"AFC South",
	"AFC West",
	"NFC East",
	"NFC North",
	"NFC South",
	"NFC West",
]

const BY_NAME = new Map(TEAMS.map((t) => [t.name, t]))

/** Look a team up by its full name. Unknown names get a neutral fallback so a typo in Studio never crashes the page. */
export function teamInfo(name?: string | null): TeamInfo {
	const hit = name ? BY_NAME.get(name) : undefined
	if (hit) return hit
	const label = name || "TBD"
	return {
		name: label,
		nick: label,
		abbr: label.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "TBD",
		conference: "AFC",
		division: "",
		color: "#71717a",
	}
}
