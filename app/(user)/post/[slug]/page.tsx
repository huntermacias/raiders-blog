import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import Image from "next/image"
import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"

import { readClient as client } from "../../../../lib/sanity.client"
import urlFor, { heroImageUrl, hotspotPosition, ogImageUrl } from "../../../../lib/urlFor"
import { PortableText } from "@portabletext/react"
import { RichTextComponents } from "../../../../components/RichTextComponents"
import CommentField from "../../../../components/CommentField"
import SocialShare from "../../../../components/SocialShare"
import RelatedPosts from "../../../../components/RelatedPosts"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import SubscribeBox from "../../../../components/SubscribeBox"
import KeysScorecard from "../../../../components/predictions/KeysScorecard"
import type { PickKey } from "../../../../lib/predictions"
import { readingMinutes } from "../../../../lib/home"

type Props = {
	params: Promise<{
		slug: string
	}>
}

// Rendered on every request, not through ISR. On Next 13.2.1, `revalidate` plus
// `generateStaticParams` makes the server throw "invariant: Expected pageData to
// be a string for app data request" whenever a client navigation or link
// prefetch (an RSC request) reaches a page that was not pre-rendered at build,
// which is every one published after the last deploy. Move back to ISR after
// upgrading Next.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;

    const {
        slug
    } = params;

    const query = groq`
	*[_type=='post' && slug.current == $slug && !(_id in path('drafts.**'))][0]{
		title, description, _createdAt, _updatedAt, author->{name}
	}`
    const post = await client.fetch(query, { slug })
    if (!post) return {}

    const title = `${post.title} | Raiders Rundown`
    const description = post.description || "Las Vegas Raiders news, analysis and commentary from Raiders Rundown."
    const url = `${SITE_URL}/post/${slug}`
    // Designed share card (see pages/api/og.tsx). `v` changes when the post
    // is edited so social networks re-fetch instead of serving a stale image.
    // Absolute URL because this Next version (13.2.1) has no `metadataBase`.
    const stamp = post._updatedAt ? new Date(post._updatedAt).getTime() : 0
    const image = `${SITE_URL}/api/og?type=post&slug=${encodeURIComponent(slug)}&v=${stamp}`

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
			// A plain string entry first, then the structured object with
			// width/height/alt as a second entry. This Next.js version's
			// metadata API only emits a real `og:image` tag from a plain
			// string -- the object-only form was rendering `og:image:url`
			// (a secondary property with no corresponding primary tag),
			// which strict Open Graph consumers ignore entirely.
			images: [image, { url: image, width: 1200, height: 630, alt: post.title }],
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

async function Post(props: Props) {
    const params = await props.params;

    const {
        slug
    } = params;

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

    // If this post is a game preview linked in Studio (Game Prediction ->
    // previewPost), show its keys to the game with live grading.
    const keysDoc: { keys?: PickKey[] | null } | null = await client.fetch(
		groq`*[_type=="gamePrediction" && previewPost._ref == $id && !(_id in path("drafts.**"))][0]{ keys[]{_key, text, result} }`,
		{ id: post._id }
	)

    const categoryIds = post.categories?.map((c) => c._id) ?? []
    const relatedQuery = groq`
	*[_type=='post' && !(_id in path('drafts.**')) && slug.current != $slug && count((categories[]->_id)[@ in $categoryIds]) > 0]
	| order(_createdAt desc) [0...3] {
		_id, title, slug, mainImage, _createdAt,
		"words": length(string::split(pt::text(body), " "))
	}
	`
    const related = categoryIds.length
		? await client.fetch(relatedQuery, { slug, categoryIds })
		: []

    const pageUrl = `${SITE_URL}/post/${post.slug.current}`
    const jsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "NewsArticle",
			headline: post.title,
			description: post.description || undefined,
			image: [`${SITE_URL}/api/og?type=post&slug=${encodeURIComponent(post.slug.current)}`],
			datePublished: post._createdAt,
			dateModified: (post as { _updatedAt?: string })._updatedAt ?? post._createdAt,
			author: [{ "@type": "Person", name: post.author?.name || "Raiders Rundown" }],
			publisher: {
				"@type": "Organization",
				name: "Raiders Rundown",
				logo: { "@type": "ImageObject", url: `${SITE_URL}/og-default-v2.png` },
			},
			mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
				{ "@type": "ListItem", position: 2, name: post.title, item: pageUrl },
			],
		},
	]

    return (
		<article>
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
							<p className="text-muted-foreground">
								{formatDate(post._createdAt)} &middot; {readingMinutes(post.body)} min read
							</p>
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
				{keysDoc?.keys && keysDoc.keys.length > 0 && (
					<KeysScorecard keys={keysDoc.keys} className="mb-10" />
				)}
				<div className="prose prose-neutral max-w-none dark:prose-invert lg:prose-lg prose-headings:font-serif prose-blockquote:not-italic">
					<PortableText value={post.body} components={RichTextComponents} />
				</div>
			</div>

			<div className="container max-w-3xl pb-12">
				<SubscribeBox source="post" />
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
