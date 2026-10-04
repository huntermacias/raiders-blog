import StoryCard, { StoryMeta } from "@/components/StoryCard"

export type FeaturedPost = {
	_id: string
	slug: string
	title: string
	description?: string | null
	createdAt: string
	categories: string[]
	minutes: number
	imageUrl: string
	imagePosition: string
}

/**
 * Editorial front of the page: one lead story with the picture doing the
 * talking, two secondary stories beside it. Server component; the page hands
 * in resolved image URLs so this stays pure.
 */
export default function FeaturedStories({ posts }: { posts: FeaturedPost[] }) {
	if (posts.length === 0) return null
	const [lead, ...rest] = posts
	const side = rest.slice(0, 2)

	return (
		<section aria-labelledby="top-stories" className="container pt-14">
			<div className="mb-6 flex items-end justify-between gap-4">
				<h2 id="top-stories" className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
					Top stories
				</h2>
				{/* A plain anchor, not next/link: on Next 13.2 a hash-only Link updates the URL but does not scroll. */}
				<a href="#latest" className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
					More stories
				</a>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
				<StoryCard
					size="lead"
					priority
					href={`/post/${lead.slug}`}
					imageUrl={lead.imageUrl}
					imagePosition={lead.imagePosition}
					sizes="(min-width: 1024px) 60vw, 100vw"
					badges={lead.categories.slice(0, 2)}
					title={lead.title}
					description={lead.description}
					meta={<StoryMeta date={lead.createdAt} minutes={lead.minutes} />}
				/>

				<div className="flex flex-col gap-6">
					{side.map((post) => (
						<StoryCard
							key={post._id}
							size="compact"
							className="flex-1"
							href={`/post/${post.slug}`}
							imageUrl={post.imageUrl}
							imagePosition={post.imagePosition}
							sizes="(min-width: 1024px) 30vw, 100vw"
							badges={post.categories.slice(0, 1)}
							title={post.title}
							meta={<StoryMeta date={post.createdAt} minutes={post.minutes} />}
						/>
					))}
				</div>
			</div>
		</section>
	)
}
