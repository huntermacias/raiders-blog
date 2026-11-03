// Which stories sit next to this one: the one before and after of the same kind, and the "more stories" picks. Pure, so a test can run it
// on a list without Sanity.

import { type StoryTypeId, storyTypeOf, storyWeek } from "./storyType"

export type PostRow = {
	_id: string
	title: string
	slug: { current: string }
	_createdAt: string
	storyType?: string | null
	week?: number | null
	categories?: { title?: string | null }[] | null
	mainImage?: unknown
}

export type TypedRow = PostRow & { type: StoryTypeId; weekOf: number | null }

export function withTypes(rows: PostRow[] | null | undefined): TypedRow[] {
	return (rows ?? []).map((r) => ({ ...r, type: storyTypeOf(r), weekOf: r.week ?? storyWeek(r) }))
}

const byDate = (a: TypedRow, b: TypedRow) => +new Date(a._createdAt) - +new Date(b._createdAt)

/** The earlier and later story of the same kind. Either can be null at the ends of the series. */
export function seriesNeighbors(rows: TypedRow[], id: string): { prev: TypedRow | null; next: TypedRow | null } {
	const me = rows.find((r) => r._id === id)
	if (!me) return { prev: null, next: null }
	const same = rows.filter((r) => r.type === me.type).sort(byDate)
	const i = same.findIndex((r) => r._id === id)
	return { prev: same[i - 1] ?? null, next: same[i + 1] ?? null }
}

/** Up to `limit` other stories: the newest of the same kind first, then the newest of anything. */
export function morePicks(rows: TypedRow[], id: string, limit = 3): { picks: TypedRow[]; allSameKind: boolean } {
	const me = rows.find((r) => r._id === id)
	const others = rows.filter((r) => r._id !== id).sort((a, b) => byDate(b, a))
	const same = me ? others.filter((r) => r.type === me.type) : []
	const rest = others.filter((r) => !same.includes(r))
	const picks = [...same, ...rest].slice(0, limit)
	return { picks, allSameKind: picks.length > 0 && picks.every((r) => r.type === me?.type) }
}
