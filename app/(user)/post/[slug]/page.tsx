import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import Image from "next/image"
import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"

import { client } from "../../../../lib/sanity.client"
import urlFor, { heroImageUrl, hotspotPosition, ogImageUrl } from "../../../../lib/urlFor"
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

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata({ params: { slug } }: Props): Promise<Metadata> {
	const query = groq`
	*[_type=='post' && slug.current == $slug && !(_id in path('drafts.**'))][0]{
		title, description, mainImage, _createdAt, author->{name}
	}`
	const post = await client.fetch(query, { slug })
	if (!post) return {}

	const title = `${post.title} | Raiders Rundown`
	const description = post.description || "Las Vegas Raiders news, analysis and commentary from Raiders Rundown."
	const url = `${SITE_URL}/post/${slug}`
	// This Next version (13.2.1) doesn't support `metadataBase`, so image/
	// canonical URLs here must already be absolute strings rather than
	// relying on it to resolve relative ones.
	const rawImage = ogImageUrl(post.mainImage)
	const image = rawImage.startsWith("/") ? `${SITE_URL}${rawImage}` : rawImage

	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: {
			type: "article",
			title,
			description,
			url,
			siteName: "Raiders Rundown",
			images: [{ url: image, width: 1200, height: 630, alt: post.title }],
			publishedTime: post._createdAt,
			authors: post.author?.name ? [post.author.name] : undefined,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [image],
		},
	}
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

	if (!post) return notFound()

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

				{/* Stacked on mobile (author/date, then share + comment count on
				    their own row) instead of one wide flex-wrap row that was
				    squeezing the share icons up against the author block on
				    narrow screens. Back to a single row with justify-between
				    from sm: up. */}
				<div className="mt-8 flex flex-col gap-3 border-y border-border/70 py-4 sm:flex-row sm:items-center sm:justify-between">
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

					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<SocialShare customurl={`https://www.raidersrundown.com/post/${post.slug.current}`} />
						<div className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
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
