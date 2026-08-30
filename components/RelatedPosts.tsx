import Image from "next/image"

import urlFor from "../lib/urlFor"
import ClientSideRoute from "./ClientSideRoute"
import { Card } from "@/components/ui/card"

type RelatedPost = {
	_id: string
	title: string
	slug: { current: string }
	mainImage: any
	_createdAt: string
}

function RelatedPosts({ posts }: { posts: RelatedPost[] }) {
	if (!posts?.length) return null

	return (
		<section className="container max-w-4xl py-10">
			<h2 className="mb-6 font-serif text-2xl font-bold tracking-tight">Related Stories</h2>
			<div className="grid gap-6 sm:grid-cols-3">
				{posts.map((post) => (
					<ClientSideRoute key={post._id} route={`/post/${post.slug.current}`}>
						<article className="group cursor-pointer">
							<Card className="h-full overflow-hidden border-border/70 transition-shadow hover:shadow-md">
								<div className="relative h-32 w-full overflow-hidden">
									<Image
										className="object-cover transition-transform duration-300 group-hover:scale-105"
										src={urlFor(post.mainImage).url()}
										alt={post.title}
										fill
										sizes="(min-width: 640px) 33vw, 100vw"
									/>
								</div>
								<div className="p-3">
									<p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
										{post.title}
									</p>
								</div>
							</Card>
						</article>
					</ClientSideRoute>
				))}
			</div>
		</section>
	)
}

export default RelatedPosts
