import { groq } from "next-sanity"
import Link from "@/components/SiteLink"
import type { Metadata } from "next"

import { client } from "../../../lib/sanity.client"
import { Badge } from "@/components/ui/badge"
import LiveCenter from "@/components/live/LiveCenter"
import type { Pinned } from "@/components/live/PinnedTake"
import { getScoreboard } from "@/lib/live/service"
import type { LiveGameInfo } from "@/lib/live/types"

// The scores come from a live feed and the threads flip between live and final, so this is always
// rendered fresh. The score feed is cached for a few seconds inside lib/live, so this stays cheap.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"

export const metadata: Metadata = {
	title: "Game Day Live: scores, plays and win probability | Raiders Rundown",
	description: "Follow every NFL game as it happens: live score, the drive on the field, a play-by-play feed and win probability, updated automatically.",
	alternates: { canonical: `${SITE_URL}/live` },
}

type Thread = { _id: string; title: string; slug: { current: string }; status: "upcoming" | "live" | "final"; startedAt?: string; updateCount: number; latest?: { body: string; postedAt: string } | null }

async function loadThreads(): Promise<Thread[]> {
	const query = groq`
		*[_type=='liveEvent'] | order(startedAt desc) {
			_id, title, slug, status, startedAt, "updateCount": count(updates),
			"latest": updates | order(postedAt desc)[0]{ body, postedAt }
		}
	`
	try {
		const threads = await client.fetch(query)
		return Array.isArray(threads) ? threads : []
	} catch {
		return []
	}
}

async function loadBoard(): Promise<LiveGameInfo[] | null> {
	try {
		return (await getScoreboard()).value
	} catch {
		return null
	}
}

async function LiveIndexPage() {
	const [threads, board] = await Promise.all([loadThreads(), loadBoard()])

	// The note pinned over a Raiders game: the newest update of whichever thread is live right now.
	const liveThread = threads.find((t) => t.status === "live" && t.latest?.body)
	const pinned: Pinned | null = liveThread?.latest ? { title: liveThread.title, slug: liveThread.slug.current, body: liveThread.latest.body, postedAt: liveThread.latest.postedAt } : null

	return (
		<div className="lab min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-8 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">Raiders Rundown &middot; Game Day</p>
					<h1 className="mt-2 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Live</h1>
					<p className="mt-3 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						The score, the drive on the field, every play and the win probability, updating on its own. No refreshing, no feed to scroll.
					</p>
				</div>
			</section>

			<section className="container py-6 sm:py-10">
				<LiveCenter initialBoard={board} pinned={pinned} />
			</section>

			{threads.length > 0 && (
				<section className="container pb-12 sm:pb-16">
					<h2 className="font-serif text-2xl font-bold tracking-tight">Live threads</h2>
					<p className="mt-1 text-sm text-lab-soft">Hunter&apos;s own timestamped updates, for game days and other events like the draft.</p>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						{threads.map((event) => (
							<Link
								key={event._id}
								href={`/live/${event.slug.current}`}
								className="flex items-center justify-between gap-3 rounded-xl border border-lab-line bg-lab-surface px-4 py-3 transition-colors hover:bg-lab-hover"
							>
								<div className="min-w-0">
									<p className="truncate font-medium">{event.title}</p>
									<p className="text-xs text-lab-muted">
										{event.updateCount} update{event.updateCount === 1 ? "" : "s"}
									</p>
								</div>
								{event.status === "live" && <Badge className="animate-pulse bg-red-600 text-white hover:bg-red-600">Live</Badge>}
								{event.status === "final" && <Badge variant="secondary">Final</Badge>}
								{event.status === "upcoming" && <Badge variant="outline">Upcoming</Badge>}
							</Link>
						))}
					</div>
				</section>
			)}

			<footer className="border-t border-lab-line">
				<p className="container py-5 text-[11px] leading-relaxed text-lab-muted">
					Scores and plays come from ESPN&apos;s public data feed and can be a few seconds behind the broadcast. Win probability is Raiders Rundown&apos;s own estimate.
				</p>
			</footer>
		</div>
	)
}

export default LiveIndexPage
