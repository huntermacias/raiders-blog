"use client"

import { useMemo, useState } from "react"

import { cardImageUrl, hotspotPosition } from "../lib/urlFor"
import { readingMinutes } from "../lib/home"
import CategoryFilter from "./CategoryFilter"
import SearchBar from "./SearchBar"
import StoryCard, { StoryMeta } from "./StoryCard"

type Props = {
	posts: Post[]
	/** Stories already shown in the homepage's "Top stories". Hidden from the default (unfiltered) list so nothing repeats. */
	featuredIds?: string[]
}

function BlogList({ posts, featuredIds = [] }: Props) {
	const [query, setQuery] = useState("")
	const [category, setCategory] = useState("All")

	const categories = useMemo(() => {
		const set = new Set<string>()
		posts?.forEach((post) => post.categories?.forEach((c) => set.add(c.title)))
		return Array.from(set).sort()
	}, [posts])

	const filteredPosts = useMemo(() => {
		const unfiltered = category === "All" && !query
		return (posts ?? []).filter((post) => {
			if (unfiltered && featuredIds.includes(post._id)) return false
			const matchesCategory =
				category === "All" || post.categories?.some((c) => c.title === category)
			const matchesQuery =
				!query ||
				post.title?.toLowerCase().includes(query.toLowerCase()) ||
				post.description?.toLowerCase().includes(query.toLowerCase())
			return matchesCategory && matchesQuery
		})
	}, [posts, category, query, featuredIds])

	return (
		<div id="latest" className="scroll-mt-28">
			<div className="container flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">{featuredIds.length > 0 ? "More stories" : "Latest Stories"}</h2>
					<p className="text-sm text-muted-foreground">
						{filteredPosts.length} article{filteredPosts.length === 1 ? "" : "s"}
					</p>
				</div>

				<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
					<SearchBar value={query} onChange={setQuery} resultCount={filteredPosts.length} />
				</div>
			</div>

			<div className="container pb-4">
				<CategoryFilter categories={categories} active={category} onChange={setCategory} />
			</div>

			<div className="container pb-24 pt-6">
				{filteredPosts.length === 0 ? (
					<div className="rounded-lg border border-dashed py-24 text-center text-muted-foreground">
						No articles match &ldquo;{query}&rdquo;.
					</div>
				) : (
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{filteredPosts.map((post) => (
							<StoryCard
								key={post._id}
								href={`/post/${post.slug.current}`}
								imageUrl={cardImageUrl(post.mainImage)}
								imagePosition={hotspotPosition(post.mainImage)}
								sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
								badges={(post.categories ?? []).slice(0, 2).map((c) => c.title)}
								title={post.title}
								description={post.description}
								meta={<StoryMeta date={post._createdAt} minutes={post.readMinutes ?? readingMinutes(post.body)} />}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export default BlogList
