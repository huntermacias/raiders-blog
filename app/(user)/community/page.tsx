import { groq } from "next-sanity"
import Image from "next/image"
import { MessageCircle, ExternalLink } from "lucide-react"
import type { Metadata } from "next"

import { client } from "../../../lib/sanity.client"
import { cardImageUrl } from "../../../lib/urlFor"
import ClientSideRoute from "../../../components/ClientSideRoute"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const revalidate = 60

const COMMUNITY_URL = "https://www.raidersrundown.com/community"

export const metadata: Metadata = {
	title: "Raiders Discussion | Raiders Rundown",
	description: "Every conversation happening across Raiders Rundown, in one place — plus where fans are talking Raiders elsewhere.",
	alternates: { canonical: COMMUNITY_URL },
	openGraph: {
		type: "website",
		title: "Raiders Discussion | Raiders Rundown",
		description: "Every conversation happening across Raiders Rundown, in one place — plus where fans are talking Raiders elsewhere.",
		url: COMMUNITY_URL,
		siteName: "Raiders Rundown",
	},
	twitter: {
		card: "summary_large_image",
		title: "Raiders Discussion | Raiders Rundown",
		description: "Every conversation happening across Raiders Rundown, in one place.",
	},
}

type TrendingItem = {
	_id: string
	_type: "post" | "gameReport"
	title: string
	slug: { current: string }
	mainImage: any
	commentCount: number
	opponent?: string
	raidersScore?: number
	opponentScore?: number
}

type RecentComment = {
	_id: string
	name: string
	comment: string
	_createdAt: string
	parent: {
		_id: string
		_type: "post" | "gameReport"
		title: string
		slug: string
	} | null
}

function hrefFor(type: "post" | "gameReport", slug: string) {
	return type === "gameReport" ? `/games/${slug}` : `/post/${slug}`
}

function timeAgo(dateStr: string) {
	const ms = Date.now() - new Date(dateStr).getTime()
	const mins = Math.floor(ms / 60000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hours = Math.floor(mins / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d ago`
	return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const EXTERNAL_LINKS = [
	{
		name: "r/raiders",
		description: "The main Raiders community on Reddit — game threads, roster talk, and reactions.",
		url: "https://www.reddit.com/r/raiders/",
	},
	{
		name: "X / Twitter search",
		description: "Live #RaiderNation and #Raiders chatter as it happens.",
		url: "https://twitter.com/search?q=%23RaiderNation%20OR%20%23Raiders&f=live",
	},
	{
		name: "Raiders.com",
		description: "Official team news, transactions, and press conferences.",
		url: "https://www.raiders.com/",
	},
]

async function CommunityPage() {
	const query = groq`{
		"posts": *[_type=="post" && !(_id in path("drafts.**"))]{
			_id, _type, title, slug, mainImage,
			"commentCount": count(*[_type=="comment" && approved==true && post._ref==^._id])
		} | order(commentCount desc) [0...6],
		"games": *[_type=="gameReport" && !(_id in path("drafts.**"))]{
			_id, _type, title, slug, mainImage, opponent, raidersScore, opponentScore,
			"commentCount": count(*[_type=="comment" && approved==true && post._ref==^._id])
		} | order(commentCount desc) [0...6],
		"recentComments": *[_type=="comment" && approved==true] | order(_createdAt desc) [0...15] {
			_id, name, comment, _createdAt,
			"parent": post->{_id, _type, title, "slug": slug.current}
		}
	}`

	const { posts, games, recentComments }: { posts: TrendingItem[]; games: TrendingItem[]; recentComments: RecentComment[] } =
		await client.fetch(query)

	const trending = [...posts, ...games]
		.sort((a, b) => b.commentCount - a.commentCount)
		.slice(0, 6)

	return (
		<div className="container py-12">
			<div className="mb-10 max-w-2xl">
				<h1 className="font-serif text-4xl font-bold tracking-tight">Raiders Discussion</h1>
				<p className="mt-2 text-muted-foreground">
					Every comment, reaction, and take from across Raiders Rundown in one place — plus where else fans
					are talking Raiders right now.
				</p>
			</div>

			{trending.length > 0 && (
				<section className="mb-14">
					<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight">Most Discussed</h2>
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{trending.map((item) => (
							<ClientSideRoute key={item._id} route={hrefFor(item._type, item.slug.current)}>
								<article className="group cursor-pointer">
									<Card className="flex h-full flex-col overflow-hidden border-border/70 transition-shadow hover:shadow-lg">
										<div className="relative h-36 w-full overflow-hidden">
											<Image
												className="object-cover transition-transform duration-300 group-hover:scale-105"
												src={cardImageUrl(item.mainImage)}
												alt={item.title}
												fill
												sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
											/>
											{item._type === "gameReport" && item.raidersScore != null && (
												<Badge
													className="absolute left-2 top-2 text-[10px]"
													variant={item.raidersScore > (item.opponentScore ?? 0) ? "default" : "destructive"}
												>
													{item.raidersScore > (item.opponentScore ?? 0) ? "W" : "L"} {item.raidersScore}-{item.opponentScore}
												</Badge>
											)}
										</div>
										<div className="flex flex-1 flex-col gap-2 p-4">
											<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
												{item._type === "gameReport" ? "Game Report" : "Article"}
											</p>
											<h3 className="line-clamp-2 flex-1 font-serif text-base font-bold leading-snug group-hover:underline">
												{item.title}
											</h3>
											<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
												<MessageCircle className="h-3.5 w-3.5" />
												{item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
											</div>
										</div>
									</Card>
								</article>
							</ClientSideRoute>
						))}
					</div>
				</section>
			)}

			<div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
				<section>
					<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight">Recent Comments</h2>
					{recentComments.length === 0 ? (
						<div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
							No comments yet — be the first to start a conversation on a post or game report.
						</div>
					) : (
						<div className="flex flex-col divide-y divide-border rounded-lg border border-border/70">
							{recentComments.map((c) =>
								c.parent ? (
									<ClientSideRoute key={c._id} route={hrefFor(c.parent._type, c.parent.slug)}>
										<div className="cursor-pointer p-4 transition-colors hover:bg-muted/40">
											<p className="text-sm">
												<span className="font-semibold text-primary">@{c.name}</span>
												<span className="ml-2 text-foreground">{c.comment}</span>
											</p>
											<p className="mt-1.5 text-xs text-muted-foreground">
												on <span className="font-medium">{c.parent.title}</span> &middot; {timeAgo(c._createdAt)}
											</p>
										</div>
									</ClientSideRoute>
								) : null
							)}
						</div>
					)}
				</section>

				<aside>
					<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight">Talk Raiders Elsewhere</h2>
					<div className="flex flex-col gap-3">
						{EXTERNAL_LINKS.map((link) => (
							<a
								key={link.url}
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								className="group block rounded-lg border border-border/70 p-4 transition-colors hover:bg-muted/40"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-semibold group-hover:underline">{link.name}</span>
									<ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								</div>
								<p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
							</a>
						))}
					</div>
				</aside>
			</div>
		</div>
	)
}

export default CommunityPage
