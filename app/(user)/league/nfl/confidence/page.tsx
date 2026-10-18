import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { Boards } from "@/components/league/nfl/Boards"
import ConfidencePicker from "@/components/league/nfl/ConfidencePicker"
import NflShare from "@/components/league/nfl/NflShare"
import { AccountBar, Champions, GuestActions, HowItWorks, Hero, ModeNav, SetupNotice, Tiles, WeekNav, btnGhost, btnLight } from "@/components/league/nfl/Shell"
import { requireAccounts } from "@/lib/league2/gate"
import { loadConfidenceWeek, nflModesOpen } from "@/lib/league2/nflData"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
	title: "NFL Confidence Picks: Free Weekly Pick'em | Raiders Rundown",
	description: "Pick every NFL winner and rank your picks by confidence. Each correct pick scores its rank, so your surest call is worth the most. Free, with a weekly title and season standings.",
	alternates: { canonical: "https://www.raidersrundown.com/league/nfl/confidence" },
}

export default async function ConfidencePage(props: { searchParams?: Promise<{ week?: string }> }) {
	requireAccounts()
	const sp = await props.searchParams
	const wanted = Number(sp?.week)
	const account = await currentAccount()
	const page = await loadConfidenceWeek(account, Number.isInteger(wanted) && wanted >= 1 && wanted <= 22 ? wanted : null)
	if (!page) notFound()
	const { view } = page
	const modes = await nflModesOpen()
	const handle = account?.player?.handle ?? null
	const open = view.games.filter((g) => g.status === "open")
	const s = view.summary

	return (
		<div className="container py-8 md:py-12">
			<AccountBar handle={handle} email={account?.email ?? null} />
			<ModeNav current="confidence" open={modes} week={view.week} />

			<Hero
				id="conf-title"
				kicker={`${view.season} season · NFL Confidence Picks`}
				title={handle ? (view.next.kind === "pick" ? `${handle}, rank your picks` : `Week ${view.week}, ${handle}`) : "How sure are you?"}
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
									{view.next.kind === "pick" ? "Rank your slate" : "Review your slate"}
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
								["Points", `${s.points}`, s.maxPossible > 0 ? `of ${s.maxPossible} possible` : "this week"],
								["Right", `${s.correct}`, `of ${s.final} final`],
								["Week rank", view.weekBoard.me ? `#${view.weekBoard.me.rank}` : "–", view.weekBoard.me ? `of ${view.weekBoard.total}` : "after a game ends"],
								["Season rank", view.seasonBoard.me ? `#${view.seasonBoard.me.rank}` : "–", view.seasonBoard.me ? `of ${view.seasonBoard.total} · ${view.seasonBoard.me.points} pts` : "after your first graded week"],
							]}
						/>
					) : (
						<HowItWorks steps={["Pick the winner of every game.", "Give each pick its own rank, from 1 up to the number of games.", "A correct pick scores its rank. Your surest call should carry the biggest number."]} />
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
						<p className="mt-1 text-sm text-muted-foreground md:text-base">{handle ? `Ranks run 1 to ${view.gameCount}. Use each one once.` : "Create an account to rank picks."}</p>
					</div>
					<WeekNav mode="confidence" weeks={view.weeks} week={view.week} />
				</div>
				{view.games.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No games are listed for this week yet.</p> : <ConfidencePicker key={`${view.week}:${view.games.map((g) => `${g.pick ?? "-"}${g.rank ?? ""}`).join("|")}`} games={view.games} gameCount={view.gameCount} signedIn={Boolean(handle)} week={view.week} />}
			</section>

			{view.games.length > 0 && <NflShare mode="confidence" week={view.week} handle={handle} headline={s.final > 0 ? `${s.points} points` : null} hasResults={view.games.some((g) => g.status !== "open")} hasBoard={view.weekBoard.total > 0} />}

			<Champions champions={view.champions} unit="points" />

			<section id="standings" aria-labelledby="stand-h" className="mt-12 scroll-mt-20">
				<h2 id="stand-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
					Standings
				</h2>
				<Boards view={view} mode="confidence" />
				<p className="mt-4 max-w-2xl text-sm text-muted-foreground">
					Each correct pick scores the rank you gave it, so a full week is worth up to {s.maxPossible || "n(n+1)/2"} points. A wrong pick scores nothing and a tie game counts for no one. Ranks of games that have started cannot change. Players level on points are split by correct picks, then by who finished earlier. To win a week you need picks in at least 80% of its games.
				</p>
			</section>
		</div>
	)
}
