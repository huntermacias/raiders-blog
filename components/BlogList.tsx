"use client"

import { useMemo, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import Image from "next/image"

import { featuredImageUrl, cardImageUrl } from "../lib/urlFor"
import ClientSideRoute from "./ClientSideRoute"
import CategoryFilter from "./CategoryFilter"
import SearchBar from "./SearchBar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

type Props = {
	posts: Post[]
}

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	})
}

function BlogList({ posts }: Props) {
	const [query, setQuery] = useState("")
	const [category, setCategory] = useState("All")

	const categories = useMemo(() => {
		const set = new Set<string>()
		posts?.forEach((post) => post.categories?.forEach((c) => set.add(c.title)))
		return Array.from(set).sort()
	}, [posts])

	const filteredPosts = useMemo(() => {
		return (posts ?? []).filter((post) => {
			const matchesCategory =
				category === "All" || post.categories?.some((c) => c.title === category)
			const matchesQuery =
				!query ||
				post.title?.toLowerCase().includes(query.toLowerCase()) ||
				post.description?.toLowerCase().includes(query.toLowerCase())
			return matchesCategory && matchesQuery
		})
	}, [posts, category, query])

	const [featured, ...rest] = filteredPosts
	const showFeatured = featured && category === "All" && !query

	return (
		<div id="latest" className="scroll-mt-20">
			<div className="container flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">Latest Stories</h2>
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
					<div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
						{showFeatured && (
							<ClientSideRoute route={`/post/${featured.slug.current}`}>
								<article className="group cursor-pointer lg:col-span-3">
									<Card className="grid overflow-hidden border-border/70 transition-shadow hover:shadow-lg lg:grid-cols-2">
										<div className="relative h-72 w-full overflow-hidden lg:h-[28rem]">
											<Image
												className="object-cover transition-transform duration-300 group-hover:scale-105"
												src={featuredImageUrl(featured.mainImage)}
												alt={featured.title}
												fill
												sizes="(min-width: 1024px) 50vw, 100vw"
												priority
											/>
										</div>
										<div className="flex flex-col justify-center gap-4 p-8">
											<div className="flex flex-wrap gap-2">
												{featured.categories?.map((c) => (
													<Badge key={c._id} variant="secondary">
														{c.title}
													</Badge>
												))}
											</div>
											<h3 className="font-serif text-3xl font-bold leading-tight tracking-tight group-hover:underline">
												{featured.title}
											</h3>
											<p className="line-clamp-3 text-muted-foreground">{featured.description}</p>
											<div className="flex items-center justify-between text-sm text-muted-foreground">
												<span>{formatDate(featured._createdAt)}</span>
												<span className="flex items-center gap-1 font-medium text-foreground">
													Read story <ArrowUpRight className="h-4 w-4" />
												</span>
											</div>
										</div>
									</Card>
								</article>
							</ClientSideRoute>
						)}

						{(showFeatured ? rest : filteredPosts).map((post) => (
							<ClientSideRoute key={post._id} route={`/post/${post.slug.current}`}>
								<article className="group flex cursor-pointer flex-col">
									<Card className="flex h-full flex-col overflow-hidden border-border/70 transition-shadow hover:shadow-lg">
										<div className="relative h-52 w-full overflow-hidden">
											<Image
												className="object-cover transition-transform duration-300 group-hover:scale-105"
												src={cardImageUrl(post.mainImage)}
												alt={post.title}
												fill
												sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
											/>
										</div>
										<div className="flex flex-1 flex-col gap-3 p-5">
											<div className="flex flex-wrap gap-2">
												{post.categories?.map((c) => (
													<Badge key={c._id} variant="outline">
														{c.title}
													</Badge>
												))}
											</div>
											<h3 className="font-serif text-xl font-bold leading-snug tracking-tight group-hover:underline">
												{post.title}
											</h3>
											<p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
												{post.description}
											</p>
											<div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
												<span>{formatDate(post._createdAt)}</span>
												<span className="flex items-center gap-1 font-medium text-foreground group-hover:underline">
													Read <ArrowUpRight className="h-3.5 w-3.5" />
												</span>
											</div>
										</div>
									</Card>
								</article>
							</ClientSideRoute>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export default BlogList
