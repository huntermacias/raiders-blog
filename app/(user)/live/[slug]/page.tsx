import { groq } from "next-sanity"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { client } from "../../../../lib/sanity.client"
import { Badge } from "@/components/ui/badge"
import LiveAutoRefresh from "../../../../components/LiveAutoRefresh"
import VideoEmbed from "../../../../components/VideoEmbed"

const SITE_URL = "https://www.raidersrundown.com"

type Props = {
	params: { slug: string }
}

// A live thread is, definitionally, always changing while it's live --
// there is no sensible cache window for it, so this always renders fresh
// rather than using time-based ISR.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params: { slug } }: Props): Promise<Metadata> {
	const query = groq`*[_type=='liveEvent' && slug.current == $slug][0]{title, status}`
	const event = await client.fetch(query, { slug })
	if (!event) return {}
	return {
		title: `${event.title} | Raiders Rundown`,
		description: `Live updates: ${event.title}.`,
	}
}

function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "America/Los_Angeles",
	})
}

async function LiveEventPage({ params: { slug } }: Props) {
	const query = groq`
	*[_type=='liveEvent' && slug.current == $slug][0]{
		...,
		relatedGame->{title, slug}
	}
	`
	const event: LiveEvent & { _id: string } = await client.fetch(query, { slug })
	if (!event) return notFound()

	const updates = [...(event.updates ?? [])].sort(
		(a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
	)

	return (
		<article className="container max-w-2xl py-12">
			{event.status === "live" && <LiveAutoRefresh />}

			<nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
				<Link href="/" className="hover:text-foreground hover:underline">
					Home
				</Link>
				<span>/</span>
				<span className="text-foreground/70">Live</span>
			</nav>

			<div className="mb-3 flex flex-wrap items-center gap-2">
				{event.status === "live" && (
					<Badge className="animate-pulse bg-red-600 text-white hover:bg-red-600">Live</Badge>
				)}
				{event.status === "final" && <Badge variant="secondary">Final</Badge>}
				{event.status === "upcoming" && <Badge variant="outline">Upcoming</Badge>}
			</div>

			<h1 className="font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">{event.title}</h1>

			{event.relatedGame && (
				<p className="mt-2 text-sm text-muted-foreground">
					Related:{" "}
					<Link href={`/games/${event.relatedGame.slug.current}`} className="underline hover:text-foreground">
						{event.relatedGame.title}
					</Link>
				</p>
			)}

			<div className="mt-8">
				{updates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{event.status === "upcoming" ? "Updates will start posting here soon." : "No updates yet."}
					</p>
				) : (
					<ol className="relative space-y-6 border-l border-border pl-6">
						{updates.map((u) => (
							<li key={u._key} className="relative">
								<span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
								<span className="text-xs font-bold uppercase tracking-wide text-primary">
									{formatTime(u.postedAt)}
								</span>
								<p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{u.body}</p>
								{u.embedUrl && <VideoEmbed url={u.embedUrl} />}
							</li>
						))}
					</ol>
				)}
			</div>
		</article>
	)
}

export default LiveEventPage
