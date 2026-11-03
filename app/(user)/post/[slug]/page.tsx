import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"
import { toPlainText } from "@portabletext/react"

import { isrFetch } from "../../../../lib/sanity.client"
import urlFor, { backdropImageUrl } from "../../../../lib/urlFor"
import CommentField from "../../../../components/CommentField"
import SocialShare from "../../../../components/SocialShare"
import RelatedPosts from "../../../../components/RelatedPosts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import SubscribeBox from "../../../../components/SubscribeBox"
import KeysScorecard from "../../../../components/predictions/KeysScorecard"
import type { PickKey } from "../../../../lib/predictions"
import { readingMinutes } from "../../../../lib/home"
import { headings } from "../../../../lib/report/story"
import PostHero from "../../../../components/post/PostHero"
import Figure from "../../../../components/post/Figure"
import Recap from "../../../../components/report/Recap"
import RecapRail from "../../../../components/report/RecapRail"
import ReportNav, { type NavSection } from "../../../../components/report/ReportNav"

type RelatedStory = { _id: string; title: string; slug: { current: string }; mainImage: unknown; _createdAt: string; words?: number }

type Props = {
	params: Promise<{
		slug: string
	}>
}

// Served through ISR: Next keeps the rendered page and refreshes it in the background every minute, so most
// visits are answered from the CDN instead of waiting on Sanity. Slugs are rendered on first request rather
// than at build (the empty generateStaticParams below is what lets Next cache them on demand;
// without it Next 15 renders every request fresh), so a post published after a deploy just works. The old
// "Expected pageData to be a string" error was a Next 13.2.1 bug and is gone on Next 15.
export const revalidate = 60

export async function generateStaticParams() {
	return []
}

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
    const post = await isrFetch(query, { slug })
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

// Dates are Pacific so a Sunday-night post isn't dated Monday.
function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "America/Los_Angeles",
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

    const post: Post = await isrFetch(query, { slug })

    if (!post) return notFound()

    // If this post is a game preview linked in Studio (Game Prediction ->
    // previewPost), show its keys to the game with live grading.
    const keysDoc: { keys?: PickKey[] | null } | null = await isrFetch(
		groq`*[_type=="gamePrediction" && previewPost._ref == $id && !(_id in path("drafts.**"))][0]{ keys[]{_key, text, result} }`,
		{ id: post._id }
	)

    const latestQuery = groq`
	*[_type=='post' && !(_id in path('drafts.**')) && slug.current != $slug && !(_id in $exclude)]
	| order(_createdAt desc) [0...3] {
		_id, title, slug, mainImage, _createdAt,
		"words": length(string::split(pt::text(body), " "))
	}
	`
    const categoryIds = post.categories?.map((c) => c._id) ?? []
    const relatedQuery = groq`
	*[_type=='post' && !(_id in path('drafts.**')) && slug.current != $slug && count((categories[]->_id)[@ in $categoryIds]) > 0]
	| order(_createdAt desc) [0...3] {
		_id, title, slug, mainImage, _createdAt,
		"words": length(string::split(pt::text(body), " "))
	}
	`
    const sameCategory: RelatedStory[] = categoryIds.length
		? await isrFetch(relatedQuery, { slug, categoryIds })
		: []
    // A story with no category match (or fewer than three) is topped up with the newest others, so the end of a post never dead-ends.
    let related = sameCategory
    if (sameCategory.length < 3) {
		const latest: RelatedStory[] = await isrFetch(latestQuery, { slug, exclude: sameCategory.map((p) => p._id) })
		related = [...sameCategory, ...(latest ?? [])].slice(0, 3)
    }

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

    const minutes = readingMinutes(post.body)
    const heads = headings(post.body)
    const railHeads = heads.filter((h) => h.level === 2)
    const hasRail = railHeads.length >= 3
    const cover = post.mainImage as (typeof post.mainImage & { alt?: string; caption?: string }) | undefined
    const hasCover = !!(cover && (cover as { asset?: unknown }).asset)
    const commentCount = post.comments?.length ?? 0
    const authorName = post.author?.name || "Raiders Rundown"
    const bio = post.author?.bio ? toPlainText(post.author.bio as never).trim() : ""
    const bioShort = bio.length > 240 ? `${bio.slice(0, 237).trimEnd()}...` : bio
    const hasKeys = !!(keysDoc?.keys && keysDoc.keys.length > 0)

    const sections: NavSection[] = [
		{ id: "story", label: "The story" },
		...(related.length ? [{ id: "related", label: "More stories" }] : []),
		{ id: "comments", label: commentCount ? `Comments (${commentCount})` : "Comments" },
    ]

    return (
		<article>
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

			<PostHero
				title={post.title}
				description={post.description}
				categories={post.categories ?? []}
				author={authorName}
				authorImageUrl={post.author?.image ? urlFor(post.author.image).width(96).height(96).url() : null}
				published={formatDate(post._createdAt)}
				minutes={minutes}
				ambientUrl={hasCover ? backdropImageUrl(post.mainImage) : undefined}
				actions={
					<>
						<SocialShare customurl={pageUrl} />
						<a href="#comments" className="flex shrink-0 items-center gap-1.5 text-sm text-white/70 hover:text-white">
							<MessageCircle className="h-4 w-4" />
							{commentCount}
						</a>
					</>
				}
			/>

			<ReportNav sections={sections} progressFor="story-body" />

			{/* The cover at its own shape: nothing trimmed, capped at 80% of the screen, centered on a blurred copy of itself. The wide crop
			    for link previews lives in /api/og and never reaches this page. */}
			{hasCover && (
				<div className="container max-w-6xl pt-6 sm:pt-8">
					<Figure image={post.mainImage} alt={cover?.alt || post.title} caption={cover?.caption} variant="cover" priority />
				</div>
			)}

			<section id="story" className="container max-w-6xl scroll-mt-32 pb-14 pt-8 sm:pt-10">
				<div className={hasRail ? "grid gap-x-14 lg:grid-cols-[minmax(0,720px)_260px] lg:justify-center" : "mx-auto max-w-[720px]"}>
					<div id="story-body" className={hasRail ? "order-last min-w-0 lg:order-none lg:col-start-1 lg:row-start-1" : "min-w-0"}>
						{hasKeys && <KeysScorecard keys={keysDoc!.keys!} className="mb-10" />}

						{post.body && <Recap body={post.body as unknown[]} headings={heads} />}

						<div className="mt-12 space-y-8">
							{/* Who wrote it, and a way to pass it on. */}
							<div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-start gap-4">
									<Avatar className="h-12 w-12">
										{post.author?.image && <AvatarImage src={urlFor(post.author.image).width(120).height(120).url()} alt={authorName} />}
										<AvatarFallback>{authorName[0]}</AvatarFallback>
									</Avatar>
									<div className="min-w-0 text-sm">
										<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Written by</p>
										<p className="font-serif text-lg font-bold leading-tight">{authorName}</p>
										{bioShort && <p className="mt-1 text-muted-foreground">{bioShort}</p>}
									</div>
								</div>
								<div className="flex shrink-0 flex-col gap-2 sm:items-end">
									<p className="text-sm font-semibold">Pass it on</p>
									<SocialShare customurl={pageUrl} />
								</div>
							</div>

							<SubscribeBox source="post" />
						</div>
					</div>
					{hasRail && (
						<div className="lg:col-start-2 lg:row-start-1">
							<RecapRail headings={railHeads} minutes={minutes} label="In this story" />
						</div>
					)}
				</div>
			</section>

			<div id="related" className="scroll-mt-32 border-t border-border/70 bg-muted/30">
				<RelatedPosts posts={related} />
			</div>

			<section id="comments" className="scroll-mt-32">
				<div className="container max-w-2xl pt-12">
					<h2 className="font-serif text-2xl font-bold tracking-tight">
						Comments <span className="text-muted-foreground">({commentCount})</span>
					</h2>
					{commentCount > 0 ? (
						<ul className="mt-4 flex flex-col divide-y divide-border">
							{post.comments.map((comment) => (
								<li key={comment._id} className="flex gap-3 py-4">
									<span aria-hidden className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground">
										{comment.name?.[0] ?? "?"}
									</span>
									<div className="min-w-0 text-sm">
										<p className="font-semibold text-primary">@{comment.name}</p>
										<p className="mt-0.5 whitespace-pre-line break-words text-foreground">{comment.comment}</p>
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="mt-3 text-sm text-muted-foreground">No comments yet. Be the first to weigh in.</p>
					)}
				</div>
				<CommentField postId={post._id} />
			</section>
		</article>
	)
}

export default Post
