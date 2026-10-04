import { thumbImageUrl, hotspotPosition } from "../lib/urlFor"
import { minutesFromWords } from "../lib/home"
import StoryCard, { StoryMeta } from "./StoryCard"

type RelatedPost = {
	_id: string
	title: string
	slug: { current: string }
	mainImage: any
	_createdAt: string
	/** Word count of the body, from the GROQ query. */
	words?: number
}

function RelatedPosts({ posts }: { posts: RelatedPost[] }) {
	if (!posts?.length) return null

	return (
		<section className="container max-w-4xl py-10">
			<h2 className="mb-6 font-serif text-2xl font-bold tracking-tight">Related Stories</h2>
			<div className="grid gap-6 sm:grid-cols-3">
				{posts.map((post) => (
					<StoryCard
						key={post._id}
						size="compact"
						className="min-h-[15rem]"
						href={`/post/${post.slug.current}`}
						imageUrl={thumbImageUrl(post.mainImage)}
						imagePosition={hotspotPosition(post.mainImage)}
						sizes="(min-width: 640px) 33vw, 100vw"
						title={post.title}
						meta={<StoryMeta date={post._createdAt} minutes={typeof post.words === "number" ? minutesFromWords(post.words) : null} />}
						cta=""
					/>
				))}
			</div>
		</section>
	)
}

export default RelatedPosts
