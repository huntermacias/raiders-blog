import type { Metadata } from "next"

import LiveCenter from "@/components/live/LiveCenter"
import NextMatchup from "@/components/live/NextMatchup"
import { getSeason } from "@/lib/lab/data"
import { nextRaidersGame } from "@/lib/live/nextUp"
import { getScoreboard } from "@/lib/live/service"
import { getGames } from "@/lib/playoffs/data"
import type { LiveGameInfo } from "@/lib/live/types"

// The scores come from a live feed, so this is always rendered fresh. The score feed is cached for a few seconds inside lib/live, so this stays cheap.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"

const TITLE = "Game Day Live: scores, plays and win probability | Raiders Rundown"
const DESCRIPTION = "Follow every NFL game as it happens: live score, the drive on the field, a play-by-play feed and win probability, updated automatically."

function gameParam(v: string | string[] | undefined): string {
	const raw = Array.isArray(v) ? v[0] : v
	return raw && /^\d{6,12}$/.test(raw) ? raw : "";
}

// The share card is drawn from the game itself (pages/api/og.tsx, type=live). Platforms keep a card
// they have already fetched, so the card's address changes by the minute while a game is on, and
// by the ten minutes otherwise; a shared /live?game=<id> link is tied to that one game.
export async function generateMetadata(props: { searchParams?: Promise<{ game?: string | string[] }> }): Promise<Metadata> {
    const searchParams = await props.searchParams;
    const game = gameParam(searchParams?.game)
    let live = false
    try {
		live = (await getScoreboard()).value.some((g) => g.state === "in")
	} catch {
		live = false
	}
    const bucket = Math.floor(Date.now() / (live ? 60_000 : 600_000))
    const image = `${SITE_URL}/api/og?type=live${game ? `&game=${game}` : ""}&v=${bucket}`
    const url = game ? `${SITE_URL}/live?game=${game}` : `${SITE_URL}/live`
    return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: `${SITE_URL}/live` },
		openGraph: {
			type: "website",
			title: TITLE,
			description: DESCRIPTION,
			url,
			siteName: "Raiders Rundown",
			images: [image, { url: image, width: 1200, height: 630, alt: "Raiders Rundown game day: score and win probability" }],
		},
		twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
		// This Next version writes openGraph.images as og:image:url only. A plain og:image is what most
		// link previews look for first, so it is added here as well.
		other: { "og:image": image },
	}
}

/** The Raiders games the Lab has a replay for, so a finished game here can link to it. */
function labGames() {
	try {
		return getSeason().games.map((g) => ({ week: g.week, date: g.date, opp: g.opp }))
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

/** The Raiders' next game, from the schedule in the repo and the board (the schedule can lag a final). */
function nextUp(board: LiveGameInfo[] | null) {
	try {
		return nextRaidersGame(getGames(), board, Date.now())
	} catch {
		return null
	}
}

async function LiveIndexPage(props: { searchParams?: Promise<{ game?: string | string[] }> }) {
    const searchParams = await props.searchParams;
    const board = await loadBoard()
    const next = nextUp(board)

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
				<LiveCenter initialBoard={board} pinned={null} initialGame={gameParam(searchParams?.game) || null} labGames={labGames()} />
			</section>

			<NextMatchup next={next} />

			<footer className="border-t border-lab-line">
				<p className="container py-5 text-[11px] leading-relaxed text-lab-muted">
					Scores and plays come from ESPN&apos;s public data feed and can be a few seconds behind the broadcast. Win probability is Raiders Rundown&apos;s own estimate.
				</p>
			</footer>
		</div>
	)
}

export default LiveIndexPage
