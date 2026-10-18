import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { Boards } from "@/components/league/nfl/Boards"
import NflShare from "@/components/league/nfl/NflShare"
import { AccountBar, Champions, GuestActions, HowItWorks, Hero, ModeNav, SetupNotice, Tiles, WeekNav, btnGhost, btnLight } from "@/components/league/nfl/Shell"
import WeekPicks from "@/components/league/nfl/WeekPicks"
import { requireAccounts } from "@/lib/league2/gate"
import { loadNflWeek, nflModesOpen } from "@/lib/league2/nflData"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
	title: "NFL Weekly Winners: Free Pick'em League | Raiders Rundown",
	description: "Pick the winner of every NFL game each week, free. Change your mind until each kickoff, chase the weekly title and climb the season standings.",
	alternates: { canonical: "https://www.raidersrundown.com/league/nfl" },
}

export default async function NflLeaguePage(props: { searchParams?: Promise<{ week?: string }> }) {
	requireAccounts()
	const sp = await props.searchParams
	const wanted = Number(sp?.week)
	const account = await currentAccount()
	const page = await loadNflWeek(account, Number.isInteger(wanted) && wanted >= 1 && wanted <= 22 ? wanted : null)
	if (!page) notFound()
	const { view } = page
	const modes = await nflModesOpen()
	const handle = account?.player?.handle ?? null
	const open = view.games.filter((g) => g.status === "open")

	return (
		<div className="container py-8 md:py-12">
			<AccountBar handle={handle} email={account?.email ?? null} />
			<ModeNav current="winners" open={modes} week={view.week} />

			<Hero
				id="nfl-title"
				kicker={`${view.season} season · NFL Weekly Winners`}
				title={handle ? (view.next.kind === "pick" ? `${handle}, pick your winners` : `Week ${view.week}, ${handle}`) : "Pick every winner"}
				lead={
					<>
						<span className="font-semibold text-zinc-50">{view.next.title}.</span> {view.next.detail}
					</>
				}
				actions={
					handle ? (
						<>
							{open.length > 0 && (
								<a href="#picks" className={btnLight}>
									{view.next.kind === "pick" ? "Make your picks" : "Review your picks"}
								</a>
							)}
							<a href="#standings" className={btnGhost}>
								See the standings
							</a>
						</>
					) : (
						<GuestActions />
					)
				}
				side={
					handle ? (
						<Tiles
							items={[
								["This week", `${view.summary.correct}`, `correct of ${view.summary.final} final`],
								["Picked", `${view.summary.picked}/${view.summary.total}`, "games this week"],
								["Week rank", view.weekBoard.me ? `#${view.weekBoard.me.rank}` : "–", view.weekBoard.me ? `of ${view.weekBoard.total}` : "after a game ends"],
								["Season rank", view.seasonBoard.me ? `#${view.seasonBoard.me.rank}` : "–", view.seasonBoard.me ? `of ${view.seasonBoard.total} · ${view.seasonBoard.me.points} correct` : "after your first graded week"],
							]}
						/>
					) : (
						<HowItWorks steps={["Tap the team you think wins. It saves right away.", "Change any pick until that game’s kickoff.", "One point for every winner. Most points wins the week."]} />
					)
				}
			/>

			{page.signedInNoPlayer && <SetupNotice />}

			<section id="picks" aria-labelledby="picks-h" className="mt-10 scroll-mt-20">
				<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="picks-h" className="font-serif text-2xl font-bold tracking-tight md:text-3xl">
							Week {view.week}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground md:text-base">{handle ? "Pick a winner for every game." : "Create an account to make picks."}</p>
					</div>
					<WeekNav mode="winners" weeks={view.weeks} week={view.week} />
				</div>
				{view.games.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No games are listed for this week yet.</p> : <WeekPicks key={`${view.week}:${view.games.map((g) => g.pick ?? "-").join("")}`} games={view.games} signedIn={Boolean(handle)} week={view.week} />}
			</section>

			{view.games.length > 0 && (
				<NflShare
					mode="winners"
					week={view.week}
					handle={handle}
					headline={view.summary.final > 0 ? `${view.summary.correct} of ${view.summary.final}` : null}
					hasResults={view.summary.final > 0 || view.games.some((g) => g.status !== "open")}
					hasBoard={view.weekBoard.total > 0}
				/>
			)}

			<Champions champions={view.champions} unit="correct" />

			<section id="standings" aria-labelledby="stand-h" className="mt-12 scroll-mt-20">
				<h2 id="stand-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
					Standings
				</h2>
				<Boards view={view} mode="winners" />
				<p className="mt-4 max-w-2xl text-sm text-muted-foreground">One point for each correct winner. A tie game counts for no one. Players level on points are split by who finished their picks earlier, so make them early. To win a week you need picks in at least 80% of its games.</p>
			</section>
		</div>
	)
}
