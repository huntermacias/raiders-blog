import Link from "@/components/SiteLink"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { SignOutButton } from "@/components/league/account/AccountPanel"
import { Boards } from "@/components/league/nfl/Boards"
import WeekPicks from "@/components/league/nfl/WeekPicks"
import { requireAccounts } from "@/lib/league2/gate"
import { loadNflWeek } from "@/lib/league2/nflData"
import { currentAccount } from "@/lib/league2/session"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
	title: "NFL Weekly Winners: Free Pick'em League | Raiders Rundown",
	description: "Pick the winner of every NFL game each week, free. Change your mind until each kickoff, chase the weekly title and climb the season standings.",
	alternates: { canonical: "https://www.raidersrundown.com/league/nfl" },
}

const btnLight = "inline-flex h-11 items-center justify-center rounded-lg bg-zinc-50 px-5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
const btnGhost = "inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-5 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"

export default async function NflLeaguePage(props: { searchParams?: Promise<{ week?: string }> }) {
	requireAccounts()
	const sp = await props.searchParams
	const wanted = Number(sp?.week)
	const account = await currentAccount()
	const page = await loadNflWeek(account, Number.isInteger(wanted) && wanted >= 1 && wanted <= 22 ? wanted : null)
	if (!page) notFound()
	const { view } = page
	const handle = account?.player?.handle ?? null
	const open = view.games.filter((g) => g.status === "open")

	return (
		<div className="container py-8 md:py-12">
			{account && (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
					<p className="text-muted-foreground">
						Signed in as <span className="font-semibold text-foreground">{handle ?? account.email}</span>
					</p>
					<nav aria-label="Account" className="flex flex-wrap items-center gap-2">
						<Link href="/league" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							Beat the Blogger
						</Link>
						<Link href="/league/account" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							Account
						</Link>
						<SignOutButton />
					</nav>
				</div>
			)}

			<section aria-labelledby="nfl-title" className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl">
				<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%)" }} />
				<div className="relative grid gap-8 p-6 md:grid-cols-[1.4fr_1fr] md:p-10">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{view.season} season · NFL Weekly Winners</p>
						<h1 id="nfl-title" className="mt-2 font-serif text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl">
							{handle ? (view.next.kind === "pick" ? `${handle}, pick your winners` : `Week ${view.week}, ${handle}`) : "Pick every winner"}
						</h1>
						<p className="mt-3 max-w-xl text-lg text-zinc-300">
							<span className="font-semibold text-zinc-50">{view.next.title}.</span> {view.next.detail}
						</p>
						<div className="mt-6 flex flex-wrap gap-3">
							{handle ? (
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
								<>
									<Link href="/league/register" className={btnLight}>
										Create a free account
									</Link>
									<Link href="/league/sign-in" className={btnGhost}>
										Sign in
									</Link>
								</>
							)}
						</div>
					</div>
					<div>
						{handle ? (
							<dl className="grid grid-cols-2 gap-3">
								{[
									["This week", `${view.summary.correct}`, `correct of ${view.summary.final} final`],
									["Picked", `${view.summary.picked}/${view.summary.total}`, "games this week"],
									["Week rank", view.weekBoard.me ? `#${view.weekBoard.me.rank}` : "–", view.weekBoard.me ? `of ${view.weekBoard.total}` : "after a game ends"],
									["Season rank", view.seasonBoard.me ? `#${view.seasonBoard.me.rank}` : "–", view.seasonBoard.me ? `of ${view.seasonBoard.total} · ${view.seasonBoard.me.points} correct` : "after your first graded week"],
								].map(([k, v, f]) => (
									<div key={k} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
										<dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{k}</dt>
										<dd className="mt-1 font-serif text-3xl font-bold tabular-nums">{v}</dd>
										<p className="text-xs text-zinc-500">{f}</p>
									</div>
								))}
							</dl>
						) : (
							<>
								<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">How it works</p>
								<ul className="grid gap-2 text-sm text-zinc-300">
									<li className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">Tap the team you think wins. It saves right away.</li>
									<li className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">Change any pick until that game&rsquo;s kickoff.</li>
									<li className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">One point for every winner. Most points wins the week.</li>
								</ul>
							</>
						)}
					</div>
				</div>
			</section>

			{page.signedInNoPlayer && (
				<p role="status" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
					Your account is almost ready.{" "}
					<Link href="/league/verified" className="font-semibold underline underline-offset-4">
						Finish setting up your handle
					</Link>{" "}
					to start picking.
				</p>
			)}

			<section id="picks" aria-labelledby="picks-h" className="mt-10 scroll-mt-20">
				<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="picks-h" className="font-serif text-2xl font-bold tracking-tight md:text-3xl">
							Week {view.week}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground md:text-base">{handle ? "Pick a winner for every game." : "Create an account to make picks."}</p>
					</div>
					{view.weeks.length > 1 && (
						<nav aria-label="Choose a week" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
							{view.weeks.map((w) => (
								<Link key={w} href={`/league/nfl?week=${w}`} scroll={false} aria-current={w === view.week ? "page" : undefined} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", w === view.week ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70")}>
									{w}
								</Link>
							))}
						</nav>
					)}
				</div>
				{view.games.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No games are listed for this week yet.</p> : <WeekPicks key={`${view.week}:${view.games.map((g) => g.pick ?? "-").join("")}`} games={view.games} signedIn={Boolean(handle)} week={view.week} />}
			</section>

			{view.champions.length > 0 && (
				<section aria-labelledby="champs-h" className="mt-12">
					<h2 id="champs-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
						Weekly champions
					</h2>
					<ul className="grid gap-3 sm:grid-cols-3">
						{view.champions.map((c) => (
							<li key={c.week} className="rounded-xl border border-border bg-card p-4 shadow-sm">
								<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Week {c.week}</p>
								<p className="mt-1 font-serif text-xl font-bold">
									{c.handles.slice(0, 3).map((h, i) => (
										<span key={h}>
											{i > 0 && ", "}
											<Link href={`/league/${h}`} className="underline-offset-4 hover:underline">
												{h}
											</Link>
										</span>
									))}
									{c.handles.length > 3 && ` +${c.handles.length - 3}`}
								</p>
								<p className="text-sm text-muted-foreground">{c.points} correct{c.handles.length > 1 ? ", shared title" : ""}</p>
							</li>
						))}
					</ul>
				</section>
			)}

			<section id="standings" aria-labelledby="stand-h" className="mt-12 scroll-mt-20">
				<h2 id="stand-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
					Standings
				</h2>
				<Boards view={view} />
				<p className="mt-4 max-w-2xl text-sm text-muted-foreground">One point for each correct winner. A tie game counts for no one. Players level on points are split by who finished their picks earlier, so make them early. To win a week you need picks in at least 80% of its games.</p>
			</section>
		</div>
	)
}
