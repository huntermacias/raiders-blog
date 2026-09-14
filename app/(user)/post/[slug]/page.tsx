import { groq } from "next-sanity"
import Image from "next/image"
import { MessageCircle } from "lucide-react"

import { client } from "../../../../lib/sanity.client"
import urlFor, { heroImageUrl, hotspotPosition } from "../../../../lib/urlFor"
import { PortableText } from "@portabletext/react"
import { RichTextComponents } from "../../../../components/RichTextComponents"
import CommentField from "../../../../components/CommentField"
import SocialShare from "../../../../components/SocialShare"
import RelatedPosts from "../../../../components/RelatedPosts"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

type Props = {
	params: {
		slug: string
	}
}

export const revalidate = 60 // revalidate this page every 60 seconds

export async function generateStaticParams() {
	const query = groq`
	*[_type=="post" && !(_id in path("drafts.**"))]
	{
		slug
	}`

	const slugs: Post[] = await client.fetch(query)
	const slugRoutes = slugs.map((slug) => slug.slug.current)

	return slugRoutes.map((slug) => ({
		slug,
	}))
}

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	})
}

async function Post({ params: { slug } }: Props) {
	const query = groq`
	*[_type=='post' && slug.current == $slug && !(_id in path('drafts.**'))][0]
	{
		...,
		author->,
		categories[]->,
		'comments': *[
		_type=="comment" &&
		post._ref == ^._id &&
		approved == true
		],
	}
	`

	const post: Post = await client.fetch(query, { slug })

	const categoryIds = post.categories?.map((c) => c._id) ?? []
	const relatedQuery = groq`
	*[_type=='post' && !(_id in path('drafts.**')) && slug.current != $slug && count((categories[]->_id)[@ in $categoryIds]) > 0]
	| order(_createdAt desc) [0...3] {
		_id, title, slug, mainImage, _createdAt
	}
	`
	const related = categoryIds.length
		? await client.fetch(relatedQuery, { slug, categoryIds })
		: []

	return (
		<article>
			{/* header */}
			<div className="container max-w-3xl py-12">
				<div className="mb-4 flex flex-wrap gap-2">
					{post.categories?.map((category) => (
						<Badge key={category._id} variant="secondary">
							{category.title}
						</Badge>
					))}
				</div>

				<h1 className="font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
					{post.title}
				</h1>

				{post.description && (
					<p className="mt-4 text-xl text-muted-foreground">{post.description}</p>
				)}

				<div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-border/70 py-4">
					<div className="flex items-center gap-3">
						<Avatar>
							{post.author.image && (
							<AvatarImage src={urlFor(post.author.image).url()} alt={post.author.name} />
						)}
							<AvatarFallback>{post.author.name?.[0]}</AvatarFallback>
						</Avatar>
						<div className="text-sm">
							<p className="font-semibold">{post.author.name}</p>
							<p className="text-muted-foreground">{formatDate(post._createdAt)}</p>
						</div>
					</div>

					<div className="flex items-center gap-4">
						<SocialShare customurl={`https://www.raidersrundown.com/post/${post.slug.current}`} />
						<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<MessageCircle className="h-4 w-4" />
							{post.comments?.length ?? 0}
						</div>
					</div>
				</div>
			</div>

			{/* hero image */}
			<div className="container max-w-5xl">
				<div className="relative h-72 w-full overflow-hidden rounded-lg sm:h-[28rem]">
					<Image
						className="object-cover"
						src={heroImageUrl(post.mainImage)}
						alt={post.title}
						fill
						style={{ objectPosition: hotspotPosition(post.mainImage) }}
						sizes="100vw"
						priority
					/>
				</div>
			</div>

			{/* body */}
			<div className="container max-w-3xl py-12">
				<div className="prose prose-neutral max-w-none dark:prose-invert lg:prose-lg prose-headings:font-serif prose-blockquote:not-italic">
					<PortableText value={post.body} components={RichTextComponents} />
				</div>
			</div>

			<Separator className="container max-w-5xl" />

			<RelatedPosts posts={related} />

			{/* comment form */}
			<CommentField postId={post._id} />

			{/* comments */}
			{post.comments?.length > 0 && (
				<div className="container max-w-2xl py-10">
					<h3 className="mb-4 font-serif text-2xl font-bold">
						Comments <span className="text-muted-foreground">({post.comments.length})</span>
					</h3>
					<div className="flex flex-col divide-y divide-border">
						{post.comments.map((comment) => (
							<div key={comment._id} className="py-4">
								<p className="text-sm">
									<span className="font-semibold text-primary">@{comment.name}</span>
									<span className="ml-2 text-foreground">{comment.comment}</span>
								</p>
							</div>
						))}
					</div>
				</div>
			)}
		</article>
	)
}

export default Post
