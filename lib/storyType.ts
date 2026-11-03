// What kind of story a post is: a preview, a power ranking, a free agency piece, and so on.
//
// An editor picks the type in Studio ("Story type"). Posts written before that field existed have none, so the type is worked out
// from their categories and title instead, and the two always agree on the ids below. Plain strings and no imports, so a test (and the
// script that fills the field in) can use it as is.

export type StoryTypeId =
	| "preview"
	| "game-report"
	| "power-rankings"
	| "free-agency"
	| "trade"
	| "draft"
	| "film-room"
	| "profile"
	| "opinion"
	| "news"

export type StoryType = {
	id: StoryTypeId
	/** One story: "Preview". */
	label: string
	/** Many stories: "Previews". */
	plural: string
	/** What the reader gets from this kind of story, in a line. */
	blurb: string
	/** Posts can be this type. Game reports are their own kind of page, so Studio does not offer it on a post. */
	onPost: boolean
}

export const STORY_TYPES: StoryType[] = [
	{ id: "preview", label: "Preview", plural: "Previews", blurb: "The matchup before kickoff: what to watch, the keys, the pick.", onPost: true },
	{ id: "game-report", label: "Game Report", plural: "Game Reports", blurb: "The result, the box score and the numbers behind it.", onPost: false },
	{ id: "power-rankings", label: "Power Rankings", plural: "Power Rankings", blurb: "All 32 teams ranked, every week.", onPost: true },
	{ id: "free-agency", label: "Free Agency", plural: "Free Agency", blurb: "Signings, departures and contracts.", onPost: true },
	{ id: "trade", label: "Trade", plural: "Trades", blurb: "Deals done and deals rumored.", onPost: true },
	{ id: "draft", label: "NFL Draft", plural: "NFL Draft", blurb: "Prospects, mocks and picks.", onPost: true },
	{ id: "film-room", label: "Film Room", plural: "Film Room", blurb: "The tape, play by play.", onPost: true },
	{ id: "profile", label: "Player Profile", plural: "Player Profiles", blurb: "Who a player is and what he brings.", onPost: true },
	{ id: "opinion", label: "Opinion", plural: "Opinion", blurb: "A take, argued.", onPost: true },
	{ id: "news", label: "News & Analysis", plural: "News & Analysis", blurb: "What happened and what it means.", onPost: true },
]

const BY_ID = new Map(STORY_TYPES.map((t) => [t.id, t]))

export function isStoryType(value: unknown): value is StoryTypeId {
	return typeof value === "string" && BY_ID.has(value as StoryTypeId)
}

export function storyTypeInfo(id: StoryTypeId): StoryType {
	return BY_ID.get(id) ?? (BY_ID.get("news") as StoryType)
}

/** The choices Studio offers on a post. */
export function postTypeOptions() {
	return STORY_TYPES.filter((t) => t.onPost).map((t) => ({ title: t.label, value: t.id }))
}

const CATEGORY_TO_TYPE: Record<string, StoryTypeId> = {
	"preview matchup": "preview",
	"nfl power rankings": "power-rankings",
	"free agency": "free-agency",
	trades: "trade",
	"nfl draft": "draft",
	"film room": "film-room",
	"meet the raiders": "profile",
	"game recaps": "game-report",
}

// When a post has more than one category, the most specific kind wins.
const PRIORITY: StoryTypeId[] = ["power-rankings", "preview", "game-report", "film-room", "free-agency", "trade", "draft", "profile"]

const TITLE_RULES: [RegExp, StoryTypeId][] = [
	[/power rankings/i, "power-rankings"],
	[/\bpreview\b/i, "preview"],
	[/film room/i, "film-room"],
	[/mock draft|scouting report|combine/i, "draft"],
	[/\bfree agen(cy|t)\b|signs? |signing/i, "free-agency"],
	[/\btrade[sd]?\b/i, "trade"],
	[/^who is /i, "profile"],
]

export type TypedStory = {
	storyType?: string | null
	title?: string | null
	categories?: ({ title?: string | null } | string | null)[] | null
}

/**
 * The story's type: the one picked in Studio, otherwise worked out from its categories, then its title, otherwise News & Analysis.
 * Never throws and always returns a real type.
 */
export function storyTypeOf(story: TypedStory | null | undefined): StoryTypeId {
	if (!story) return "news"
	if (isStoryType(story.storyType)) return story.storyType
	const fromCategories = new Set<StoryTypeId>()
	for (const c of story.categories ?? []) {
		const name = (typeof c === "string" ? c : c?.title ?? "").trim().toLowerCase()
		const id = CATEGORY_TO_TYPE[name]
		if (id) fromCategories.add(id)
	}
	for (const id of PRIORITY) if (fromCategories.has(id)) return id
	const title = story.title ?? ""
	for (const [re, id] of TITLE_RULES) if (re.test(title)) return id
	return "news"
}

/**
 * The week a story is about, read from its title ("Week 8 Preview", "Power Rankings After Week 8"). Null when there isn't one.
 * A power ranking is "after Week 8", so it belongs to week 8 (its slug may say 9: the slug number and the Power Rankings document are numbered one ahead, see rankingsWeekForPost).
 */
export function storyWeek(story: { title?: string | null } | null | undefined): number | null {
	const m = (story?.title ?? "").match(/\bweek\s+(\d{1,2})\b/i)
	if (!m) return null
	const n = parseInt(m[1], 10)
	return n >= 1 && n <= 22 ? n : null
}

/** Chips for a list: each type that has at least one story, with its count, in the order above. */
export function typeCounts(ids: StoryTypeId[]): { type: StoryType; count: number }[] {
	const counts = new Map<StoryTypeId, number>()
	for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
	return STORY_TYPES.filter((t) => counts.has(t.id)).map((t) => ({ type: t, count: counts.get(t.id) as number }))
}
