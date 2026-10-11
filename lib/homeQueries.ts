// What the homepage asks Sanity for its stories. Plain strings with no client, so a test can read them.
//
// The page only ever shows a card for each story (picture, title, categories, date, read time), so that is all it asks for.
// It used to fetch every post whole, with the author, categories and the full article body, which was most of a megabyte on every
// visit (about 300,000 characters of article text across 39 posts) only to throw the bodies away before the page was sent.
// The read time is worked out here from the word count, the same way a story's "related" card does it.

/** The fields one story card needs. No body, no author. */
export const STORY_CARD_FIELDS = `
	_id,
	_createdAt,
	title,
	description,
	slug,
	mainImage,
	"categories": categories[]->{ _id, title },
	"words": length(string::split(pt::text(body), " "))
`

/** Every published story, newest first. */
export const homePostsQuery = `
	*[_type == 'post' && !(_id in path('drafts.**'))] | order(_createdAt desc) {${STORY_CARD_FIELDS}}
`

/** The three newest game recaps. */
export const homeGameReportsQuery = `
	*[_type == 'gameReport' && !(_id in path('drafts.**'))] | order(gameDate desc) [0...3] {
		_id, title, slug, opponent, gameDate, raidersScore, opponentScore, mainImage
	}
`

/** A story as the homepage query returns it. */
export type HomePostRow = {
	_id: string
	_createdAt: string
	title: string
	description?: string | null
	slug: { current: string }
	mainImage?: unknown
	categories?: { _id?: string; title: string }[] | null
	words?: number | null
}
