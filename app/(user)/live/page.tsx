import { groq } from "next-sanity"
import Link from "next/link"
import type { Metadata } from "next"

import { client } from "../../../lib/sanity.client"
import { Badge } from "@/components/ui/badge"

// Same reasoning as the live event detail page: this list needs to reflect
// a thread flipping to "live" or "final" immediately, not on the next ISR
// window.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
	title: "Live | Raiders Rundown",
	description: "Live-updating threads for Raiders games and other events, as they happen.",
}

async function LiveIndexPage() {
	const query = groq`
		*[_type=='liveEvent'] | order(startedAt desc) {
			_id, title, slug, status, startedAt, "updateCount": count(updates)
		}
	`
	const events: (LiveEvent & { _id: string; updateCount: number })[] = await client.fetch(query)

	return (
		<div className="container max-w-2xl py-12">
			<h1 className="font-serif text-3xl font-bold tracking-tight">Live</h1>
			<p className="mt-2 text-muted-foreground">Live-updating threads for games and other events, as they happen.</p>

			<div className="mt-8 space-y-3">
				{events.length === 0 && (
					<p className="text-sm text-muted-foreground">Nothing live right now. Check back on game day.</p>
				)}
				{events.map((event) => (
					<Link
						key={event._id}
						href={`/live/${event.slug.current}`}
						className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/50"
					>
						<div>
							<p className="font-medium">{event.title}</p>
							<p className="text-xs text-muted-foreground">{event.updateCount} update{event.updateCount === 1 ? "" : "s"}</p>
						</div>
						{event.status === "live" && (
							<Badge className="animate-pulse bg-red-600 text-white hover:bg-red-600">Live</Badge>
						)}
						{event.status === "final" && <Badge variant="secondary">Final</Badge>}
						{event.status === "upcoming" && <Badge variant="outline">Upcoming</Badge>}
					</Link>
				))}
			</div>
		</div>
	)
}

export default LiveIndexPage
