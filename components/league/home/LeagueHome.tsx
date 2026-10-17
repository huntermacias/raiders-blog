import Link from "@/components/SiteLink"

import type { BtbHome } from "@/lib/league2/homeData"
import { SignOutButton } from "@/components/league/account/AccountPanel"
import { BoardPanel, Challenges, Hero, PlayList, ResultCard, RivalryPanel, Rules, SeasonTiles, SectionHeading } from "./sections"

export default function LeagueHome({ home }: { home: BtbHome }) {
	const { view, account } = home
	const handle = account?.player?.handle ?? null
	const ch = view.challenger
	return (
		<div className="container py-8 md:py-12">
			{account && (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
					<p className="text-muted-foreground">
						Signed in as <span className="font-semibold text-foreground">{handle ?? account.email}</span>
					</p>
					<nav aria-label="Account" className="flex flex-wrap items-center gap-2">
						{handle && (
							<Link href={`/league/${handle}`} className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
								My profile
							</Link>
						)}
						<Link href="/league/account" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							Account
						</Link>
						{account.admin && (
							<Link href="/league/admin" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
								Admin
							</Link>
						)}
						<SignOutButton />
					</nav>
				</div>
			)}

			{home.signedInNoPlayer && (
				<p role="status" className="mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
					Your account is almost ready.{" "}
					<Link href="/league/verified" className="font-semibold underline underline-offset-4">
						Finish setting up your handle
					</Link>
					.
				</p>
			)}

			{ch && (
				<section aria-label="Challenge" className="mb-6 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">A challenge</p>
					<p className="mt-1 font-serif text-2xl font-bold tracking-tight">
						<Link href={`/league/${ch.handle}`} className="underline-offset-4 hover:underline">
							{ch.handle}
						</Link>{" "}
						challenged you
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Ranked #{ch.rank} of {view.board.total} with {ch.points} points, {ch.rivalry.record.w}-{ch.rivalry.record.l} against me. Pick the scores below and see if you can out-pick them.
					</p>
					<a href="#play" className="mt-3 inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-sm font-bold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						Take the challenge
					</a>
				</section>
			)}

			<Hero view={view} handle={handle} />
			{view.me && <SeasonTiles me={view.me} view={view} />}

			<section id="play" aria-labelledby="play-h" className="mt-12 scroll-mt-28">
				<SectionHeading id="play-h" title={handle ? "Your picks" : "This week"} sub={handle ? "Enter a score for each open game. Change it as often as you like before kickoff." : "Free to play. Create an account to lock in your picks."} />
				<PlayList view={view} signedIn={Boolean(handle)} />
			</section>

			{view.recent && (
				<section aria-labelledby="recent-h" className="mt-12">
					<SectionHeading
						id="recent-h"
						title={`Week ${view.recent.week} results`}
						sub={view.recent.entrants > 0 ? `${view.recent.beat} of ${view.recent.entrants} players out-scored me on the week.` : "Nobody entered this week."}
					/>
					<ul className="grid gap-3 md:grid-cols-2">
						{view.recent.cards.map((c) => (
							<ResultCard key={c.eventId} c={c} signedIn={Boolean(handle)} />
						))}
					</ul>
				</section>
			)}

			{view.me && (
				<section aria-labelledby="riv-h" className="mt-12">
					<SectionHeading id="riv-h" title="You vs the blogger" sub="Every graded game you entered, scored against my own pick." />
					<RivalryPanel me={view.me} />
				</section>
			)}

			<section id="board" aria-labelledby="board-h" className="mt-12 scroll-mt-28">
				<SectionHeading id="board-h" title="Standings" sub="Season totals across every graded game." right={<Link href="/league/board" className="text-sm font-semibold underline underline-offset-4">Full leaderboard</Link>} />
				<BoardPanel view={view} />
			</section>

			<section aria-labelledby="chal-h" className="mt-12">
				<SectionHeading id="chal-h" title="More ways to play" />
				<Challenges signedIn={Boolean(handle)} nflOpen={home.nflOpen} />
			</section>

			<section aria-labelledby="rules-h" className="mt-12">
				<SectionHeading id="rules-h" title="How it works" />
				<Rules />
			</section>
		</div>
	)
}
