import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { Boards } from "@/components/league/nfl/Boards"
import NflShare from "@/components/league/nfl/NflShare"
import { AccountBar, Champions, GuestActions, HowItWorks, Hero, ModeNav, SetupNotice, Tiles, WeekNav, btnGhost, btnLight } from "@/components/league/nfl/Shell"
import UpsetCalls from "@/components/league/nfl/UpsetCalls"
import { requireAccounts } from "@/lib/league2/gate"
import { loadUpsetWeek, nflModesOpen } from "@/lib/league2/nflData"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
	title: "NFL Upset Challenge: Call the Underdogs | Raiders Rundown",
	description: "Call up to five NFL upsets a week. Our ratings name the underdog in every game and the bigger the long shot, the more a win pays. Free, with a weekly title and season standings.",
	alternates: { canonical: "https://www.raidersrundown.com/league/nfl/upsets" },
}

export default async function UpsetsPage(props: { searchParams?: Promise<{ week?: string }> }) {
	requireAccounts()
	const sp = await props.searchParams
	const wanted = Number(sp?.week)
	const account = await currentAccount()
	const page = await loadUpsetWeek(account, Number.isInteger(wanted) && wanted >= 1 && wanted <= 22 ? wanted : null)
	if (!page) notFound()
	const { view } = page
	const modes = await nflModesOpen()
	const handle = account?.player?.handle ?? null
	const open = view.games.filter((g) => g.status === "open" && g.line)
	const s = view.summary
	const best = view.games.reduce((m, g) => Math.max(m, g.line?.value ?? 0), 0)

	return (
		<div className="container py-8 md:py-12">
			<AccountBar handle={handle} email={account?.email ?? null} />
			<ModeNav current="upset" open={modes} week={view.week} />

			<Hero
				id="upset-title"
				kicker={`${view.season} season · NFL Upset Challenge`}
				title={handle ? (view.next.kind === "pick" ? `${handle}, call your upsets` : `Week ${view.week}, ${handle}`) : "Call the upsets"}
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
									{view.next.kind === "pick" ? "Make your calls" : "Review your calls"}
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
								["Points", `${s.points}`, `${s.hits} hit${s.hits === 1 ? "" : "s"} of ${s.called} called`],
								["Calls left", `${view.calls.left}`, `of ${view.calls.max} this week`],
								["Week rank", view.weekBoard.me ? `#${view.weekBoard.me.rank}` : "–", view.weekBoard.me ? `of ${view.weekBoard.total}` : "after a call is graded"],
								["Season rank", view.seasonBoard.me ? `#${view.seasonBoard.me.rank}` : "–", view.seasonBoard.me ? `of ${view.seasonBoard.total} · ${view.seasonBoard.me.points} pts` : "after your first graded week"],
							]}
						/>
					) : (
						<HowItWorks steps={[`Our ratings name an underdog in every game.`, `Call up to ${view.calls.max} of them to win. A wrong call costs nothing but the slot.`, "The bigger the long shot, the more a win pays."]} />
					)
				}
			/>

			{page.signedInNoPlayer && <SetupNotice />}

			{view.upsetOfWeek && (
				<aside aria-label="Upset of the week" className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Upset of the week {view.week}</p>
					<p className="mt-1 font-serif text-2xl font-bold">
						{view.upsetOfWeek.underdog.nick} beat the {view.upsetOfWeek.favourite.nick}
					</p>
					<p className="text-sm text-muted-foreground">
						{view.upsetOfWeek.score.away > view.upsetOfWeek.score.home ? `${view.upsetOfWeek.score.away}–${view.upsetOfWeek.score.home}` : `${view.upsetOfWeek.score.home}–${view.upsetOfWeek.score.away}`}. Our ratings gave the favourite {Math.round(view.upsetOfWeek.favouriteWinChance * 100)}%. {view.upsetOfWeek.callers} {view.upsetOfWeek.callers === 1 ? "player" : "players"} called it for {view.upsetOfWeek.value} {view.upsetOfWeek.value === 1 ? "point" : "points"}.
					</p>
				</aside>
			)}

			<section id="picks" aria-labelledby="picks-h" className="mt-10 scroll-mt-20">
				<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="picks-h" className="font-serif text-2xl font-bold tracking-tight md:text-3xl">
							Week {view.week}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground md:text-base">{handle ? `Call up to ${view.calls.max} underdogs${best > 1 ? `. The longest shot pays ${best}` : ""}.` : "Create an account to make calls."}</p>
					</div>
					<WeekNav mode="upset" weeks={view.weeks} week={view.week} />
				</div>
				{view.games.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No games are listed for this week yet.</p> : <UpsetCalls key={`${view.week}:${view.games.map((g) => (g.called ? "1" : "0")).join("")}`} games={view.games} max={view.calls.max} signedIn={Boolean(handle)} week={view.week} />}
			</section>

			{view.games.length > 0 && <NflShare mode="upset" week={view.week} handle={handle} headline={s.called > 0 && s.final > 0 ? `${s.hits} of ${s.called} upsets called` : null} hasResults={s.called > 0 && view.games.some((g) => g.called && g.status !== "open")} hasBoard={view.weekBoard.total > 0} hasUpset={view.upsetOfWeek !== null} />}

			<Champions champions={view.champions} unit="points" />

			<section id="standings" aria-labelledby="stand-h" className="mt-12 scroll-mt-20">
				<h2 id="stand-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
					Standings
				</h2>
				<Boards view={view} mode="upset" />
				<p className="mt-4 max-w-2xl text-sm text-muted-foreground">
					Underdogs are set from the site&rsquo;s own ratings when the week opens and never change after that. You can only call the underdog. A called upset that happens scores {view.rules.base} {view.rules.base === 1 ? "point" : "points"}, plus {view.rules.perTier} more for each step up in how heavily the favourite was rated: {view.rules.tierBoundaries.map((b) => `${Math.round(b * 100)}%`).join(" and ")} to win. A missed call scores nothing, and you can take a call back until kickoff. Players level on points are split by hits, then by who finished earlier. Any player with a point on the board can win the week.
				</p>
			</section>
		</div>
	)
}
