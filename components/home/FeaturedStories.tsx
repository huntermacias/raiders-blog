import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"

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

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Los_Angeles" })
}

function Meta({ post, className }: { post: FeaturedPost; className?: string }) {
	return (
		<p className={className}>
			{formatDate(post.createdAt)}
			<span aria-hidden> · </span>
			<span className="inline-flex items-center gap-1 align-middle">
				<Clock aria-hidden className="h-3 w-3" /> {post.minutes} min read
			</span>
		</p>
	)
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
				<Link href="#latest" className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
					More stories
				</Link>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
				<Link
					href={`/post/${lead.slug}`}
					className="group relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Image
						src={lead.imageUrl}
						alt=""
						fill
						priority
						sizes="(min-width: 1024px) 60vw, 100vw"
						className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
						style={{ objectPosition: lead.imagePosition }}
					/>
					<div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/0" />
					<div className="p-6 text-zinc-50 md:p-8">
						<div className="mb-3 flex flex-wrap gap-2">
							{lead.categories.slice(0, 2).map((c) => (
								<Badge key={c} variant="outline" className="border-white/30 bg-black/30 text-zinc-100 backdrop-blur">
									{c}
								</Badge>
							))}
						</div>
						<h3 className="font-serif text-2xl font-bold leading-tight tracking-tight group-hover:underline md:text-4xl md:leading-[1.1]">{lead.title}</h3>
						{lead.description && <p className="mt-3 line-clamp-2 max-w-2xl text-sm text-zinc-300 md:text-base">{lead.description}</p>}
						<div className="mt-4 flex items-center justify-between gap-4 text-xs text-zinc-300">
							<Meta post={lead} />
							<span className="inline-flex items-center gap-1 text-sm font-bold text-zinc-50">
								Read <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
							</span>
						</div>
					</div>
				</Link>

				<div className="flex flex-col gap-6">
					{side.map((post) => (
						<Link
							key={post._id}
							href={`/post/${post.slug}`}
							className="group flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div className="relative h-40 w-full overflow-hidden lg:h-36">
								<Image
									src={post.imageUrl}
									alt=""
									fill
									sizes="(min-width: 1024px) 30vw, 100vw"
									className="object-cover transition-transform duration-300 group-hover:scale-105"
									style={{ objectPosition: post.imagePosition }}
								/>
							</div>
							<div className="flex flex-1 flex-col gap-2 p-4">
								<div className="flex flex-wrap gap-2">
									{post.categories.slice(0, 1).map((c) => (
										<Badge key={c} variant="outline">
											{c}
										</Badge>
									))}
								</div>
								<h3 className="font-serif text-lg font-bold leading-snug tracking-tight group-hover:underline">{post.title}</h3>
								<Meta post={post} className="mt-auto pt-1 text-xs text-muted-foreground" />
							</div>
						</Link>
					))}
				</div>
			</div>
		</section>
	)
}
