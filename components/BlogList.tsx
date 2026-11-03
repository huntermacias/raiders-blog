"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight } from "lucide-react"

import { cardImageUrl, hotspotPosition } from "../lib/urlFor"
import { readingMinutes } from "../lib/home"
import { type StoryTypeId, isStoryType, storyTypeInfo, typeCounts } from "../lib/storyType"
import SearchBar from "./SearchBar"
import StoryCard, { StoryMeta, storyDate } from "./StoryCard"
import TypeChips from "./TypeChips"

/** The part of a story the list shows. The homepage sends just this, with the read time already worked out. */
export type ListPost = {
	_id: string
	_createdAt: string
	title: string
	description?: string | null
	slug: { current: string }
	mainImage?: unknown
	/** The kind of story (preview, power rankings...), already worked out on the server. */
	type: StoryTypeId
	/** The week of the season it is about, when it has one. */
	week?: number | null
	/** Where it lives. Defaults to the post page; game reports point at their own page. */
	href?: string
	readMinutes?: number | null
	/** Only for callers that still hand over a whole post; the read time is worked out from it when there is no `readMinutes`. */
	body?: unknown
}

type Props = {
	posts: ListPost[]
	/** Stories already shown in the homepage's "Top stories". Hidden from the default (unfiltered) list so nothing repeats. */
	featuredIds?: string[]
	/** A type picked in the address (?type=preview), so a link to "all the previews" opens already filtered. */
	initialType?: string | null
}

const hrefOf = (post: ListPost) => post.href ?? `/post/${post.slug.current}`

function BlogList({ posts, featuredIds = [], initialType = null }: Props) {
	const [query, setQuery] = useState("")
	const [type, setType] = useState<StoryTypeId | "all">(isStoryType(initialType) ? initialType : "all")

	const counts = useMemo(() => typeCounts((posts ?? []).map((p) => p.type)), [posts])

	// Keep the address in step with the chip, so a filtered list can be shared. No navigation, no refetch.
	useEffect(() => {
		try {
			const url = new URL(window.location.href)
			if (type === "all") url.searchParams.delete("type")
			else url.searchParams.set("type", type)
			if (url.href !== window.location.href) window.history.replaceState(null, "", url.href)
		} catch {
			/* the address bar is a convenience, not a requirement */
		}
	}, [type])

	const filteredPosts = useMemo(() => {
		const unfiltered = type === "all" && !query
		const q = query.toLowerCase()
		return (posts ?? []).filter((post) => {
			if (unfiltered && featuredIds.includes(post._id)) return false
			const matchesType = type === "all" || post.type === type
			const matchesQuery = !query || post.title?.toLowerCase().includes(q) || post.description?.toLowerCase().includes(q)
			return matchesType && matchesQuery
		})
	}, [posts, type, query, featuredIds])

	// One tile per kind of story with the newest one in it: a way in for someone who wants "just the previews".
	const latestPerType = useMemo(() => counts.map(({ type: t, count }) => ({ t, count, latest: (posts ?? []).find((p) => p.type === t.id) })), [counts, posts])
	const active = type === "all" ? null : storyTypeInfo(type)

	return (
		<div id="latest" className="scroll-mt-28">
			<div className="container flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">{active ? active.plural : featuredIds.length > 0 ? "More stories" : "Latest Stories"}</h2>
					<p className="text-sm text-muted-foreground">
						{active ? `${active.blurb} ` : ""}
						{filteredPosts.length} article{filteredPosts.length === 1 ? "" : "s"}
					</p>
				</div>

				<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
					<SearchBar value={query} onChange={setQuery} resultCount={filteredPosts.length} />
				</div>
			</div>

			<div className="container pb-4">
				<TypeChips total={(posts ?? []).length} types={counts} active={type} onChange={setType} />
			</div>

			{type === "all" && !query && latestPerType.length > 1 && (
				<div className="container pt-4">
					<h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Newest of each kind</h3>
					<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{latestPerType.map(({ t, count, latest }) => (
							<li key={t.id}>
								<button
									type="button"
									onClick={() => {
										setType(t.id)
										document.getElementById("latest")?.scrollIntoView({ behavior: "smooth", block: "start" })
									}}
									className="group flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/40"
								>
									<span className="flex items-center justify-between text-sm font-bold">
										{t.plural}
										<span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
											{count} <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
										</span>
									</span>
									{latest && <span className="line-clamp-2 text-sm text-muted-foreground">{latest.title}</span>}
									{latest && <span className="mt-auto pt-1 text-xs text-muted-foreground/80">{storyDate(latest._createdAt)}</span>}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="container pb-24 pt-6">
				{filteredPosts.length === 0 ? (
					<div className="rounded-lg border border-dashed py-24 text-center text-muted-foreground">
						{query ? <>No articles match &ldquo;{query}&rdquo;.</> : "Nothing here yet."}
					</div>
				) : (
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{filteredPosts.map((post) => (
							<StoryCard
								key={post._id}
								href={hrefOf(post)}
								imageUrl={cardImageUrl(post.mainImage)}
								imagePosition={hotspotPosition(post.mainImage)}
								sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
								badges={[storyTypeInfo(post.type).label, ...(post.week ? [`Week ${post.week}`] : [])]}
								title={post.title}
								description={post.description}
								meta={<StoryMeta date={post._createdAt} minutes={post.type === "game-report" ? null : post.readMinutes ?? readingMinutes(post.body)} />}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export default BlogList
