import Link from "@/components/SiteLink"
import { ArrowDown, ArrowRight, ArrowUp, Lock, Minus } from "lucide-react"

import { cn } from "@/lib/utils"
import { CLASSIC_V1 } from "@/lib/league2/domain"
import { kickoffLabel, nick, oneDecimal, pct, shortDay, signed, teamColor } from "@/lib/league2/format"
import type { BoardRow, HomeView, MyLine, PickCard } from "@/lib/league2/view/btb"
import Countdown from "./Countdown"
import PickForm from "./PickForm"

const MAX = CLASSIC_V1.rules.winner + CLASSIC_V1.rules.margin[0].pts + CLASSIC_V1.rules.exactScore
const btnLight = "inline-flex h-11 items-center justify-center rounded-lg bg-zinc-50 px-5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
const btnGhost = "inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-5 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"

export function SectionHeading({ id, title, sub, right }: { id: string; title: string; sub?: string; right?: React.ReactNode }) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 id={id} className="font-serif text-2xl font-bold tracking-tight md:text-3xl">
					{title}
				</h2>
				{sub && <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-base">{sub}</p>}
			</div>
			{right}
		</div>
	)
}

function Tile({ label, value, foot, tone }: { label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: "good" | "bad" }) {
	return (
		<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
			<p className={cn("mt-2 font-serif text-3xl font-bold leading-none tabular-nums md:text-4xl", tone === "good" && "text-emerald-700 dark:text-emerald-400", tone === "bad" && "text-rose-700 dark:text-rose-400")}>{value}</p>
			{foot && <p className="mt-2 text-xs text-muted-foreground">{foot}</p>}
		</div>
	)
}

export function Movement({ n }: { n: number | null }) {
	if (n === null || n === 0) return <span className="inline-flex items-center text-muted-foreground"><Minus aria-hidden className="h-3 w-3" /><span className="sr-only">No change</span></span>
	return (
		<span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", n > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
			{n > 0 ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" />}
			{Math.abs(n)}
			<span className="sr-only">{n > 0 ? " places up" : " places down"}</span>
		</span>
	)
}

/** Top of the page: what to do right now, and where you stand. */
export function Hero({ view, handle }: { view: HomeView; handle: string | null }) {
	const a = view.nextAction
	const me = view.me
	const next = view.slate.slice().sort((x, y) => x.lockAt.localeCompare(y.lockAt))[0]
	return (
		<section aria-labelledby="hero-title" className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl">
			<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%)" }} />
			<div className="relative grid gap-8 p-6 md:grid-cols-[1.4fr_1fr] md:p-10">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{view.season} season · Beat the Blogger</p>
					<h1 id="hero-title" className="mt-2 font-serif text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl">
						{handle ? (a.kind === "pick" ? `${handle}, you're on the clock` : `Welcome back, ${handle}`) : "Out-pick the blogger"}
					</h1>
					<p className="mt-3 max-w-xl text-lg text-zinc-300">
						<span className="font-semibold text-zinc-50">{a.title}.</span> {a.detail}
					</p>
					{next && (
						<p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
							<span>
								{nick(next.awayTeam)} at {nick(next.homeTeam)} · {kickoffLabel(next.kickoff)}
							</span>
							<Countdown lockAt={next.lockAt} className="font-semibold text-zinc-200" />
						</p>
					)}
					<div className="mt-6 flex flex-wrap gap-3">
						{handle ? (
							<>
								{view.slate.length > 0 && (
									<a href="#play" className={btnLight}>
										{a.kind === "pick" ? "Make your pick" : "Review your picks"}
									</a>
								)}
								<a href="#board" className={btnGhost}>
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
					{!handle && (
						<p className="mt-4 text-sm text-zinc-400">
							Playing with a recovery key?{" "}
							<Link href="/league/upgrade" className="font-semibold text-zinc-200 underline underline-offset-4">
								Upgrade your account
							</Link>{" "}
							and keep every pick.
						</p>
					)}
				</div>
				<div>
					{me ? (
						<dl className="grid grid-cols-2 gap-3">
							{[
								["Rank", me.rank > 0 ? `#${me.rank}` : "–", me.rank > 0 ? `of ${me.of}` : "after your first graded game"],
								["Points", String(me.points), `${me.games} graded`],
								["Vs the blogger", `${me.rivalry.record.w}-${me.rivalry.record.l}${me.rivalry.record.t ? `-${me.rivalry.record.t}` : ""}`, "games you beat me"],
								["Streak", me.rivalry.current ? `${me.rivalry.current.length}${me.rivalry.current.type}` : "–", me.rivalry.current?.type === "W" ? "beating the blogger" : "current run"],
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
							<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">How scoring works</p>
							<ScoringList dark />
							<p className="mt-2 text-xs text-zinc-500">Up to {MAX} a game. Picks lock at kickoff.</p>
						</>
					)}
				</div>
			</div>
		</section>
	)
}

export function ScoringList({ dark }: { dark?: boolean }) {
	const r = CLASSIC_V1.rules
	const rows: [string, string][] = [
		["Right winner", `+${r.winner}`],
		["Margin exactly right", `+${r.margin[0].pts}`],
		[`Margin within ${r.margin[1].max}`, `+${r.margin[1].pts}`],
		[`Margin within ${r.margin[2].max}`, `+${r.margin[2].pts}`],
		["Exact final score", `+${r.exactScore}`],
	]
	return (
		<ul className="grid gap-2 text-sm">
			{rows.map(([label, pts]) => (
				<li key={label} className={cn("flex items-center justify-between rounded-lg border px-4 py-2.5", dark ? "border-zinc-800 bg-zinc-900/60" : "border-border bg-card")}>
					<span className={dark ? "text-zinc-200" : undefined}>{label}</span>
					<span className="font-serif text-lg font-bold tabular-nums">{pts}</span>
				</li>
			))}
		</ul>
	)
}

export function SeasonTiles({ me, view }: { me: MyLine; view: HomeView }) {
	const behind = me.delta < 0
	return (
		<section aria-label="Your season" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
			<Tile label="Your rank" value={me.rank > 0 ? `#${me.rank}` : "–"} foot={me.rank > 0 ? <span className="inline-flex items-center gap-1.5">of {me.of} <Movement n={me.movement} /></span> : "Enter a game and wait for the final"} />
			<Tile label="Points" value={me.points} foot={`${me.correct} right winner${me.correct === 1 ? "" : "s"}, ${me.exact} exact`} />
			<Tile label="Vs the blogger" value={`${me.rivalry.record.w}-${me.rivalry.record.l}${me.rivalry.record.t ? `-${me.rivalry.record.t}` : ""}`} tone={me.rivalry.games > 0 ? (me.delta > 0 ? "good" : behind ? "bad" : undefined) : undefined} foot={me.rivalry.games > 0 ? `${signed(me.delta)} points on ${me.rivalry.games} game${me.rivalry.games === 1 ? "" : "s"}` : "No graded games yet"} />
			<Tile label="Average miss" value={oneDecimal(me.avgMarginError)} foot={`${view.board.aheadOfBlogger} of ${view.board.total} players are ahead of me`} />
		</section>
	)
}

function ScoreLine({ away, home, label }: { away: number; home: number; label: string }) {
	return (
		<span className="tabular-nums">
			<span className="sr-only">{label} </span>
			{away}&ndash;{home}
		</span>
	)
}

/** A finished (or locked) game: your pick, the result, the blogger. */
export function ResultCard({ c, signedIn, subject }: { c: PickCard; signedIn: boolean; subject?: string }) {
	const who = subject ?? "You"
	const pill =
		c.vs === "W"
			? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
			: c.vs === "L"
				? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
				: "bg-muted text-muted-foreground"
	return (
		<li className="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					Week {c.week} · {shortDay(c.kickoff)}
				</p>
				{c.status === "final" && signedIn && c.vs && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", pill)}>{subject ? (c.vs === "W" ? "Beat me" : c.vs === "L" ? "I won" : "Tied") : c.vs === "W" ? "You beat me" : c.vs === "L" ? "I beat you" : "Tied"}</span>}
				{c.status === "locked" && (
					<span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
						<Lock aria-hidden className="h-3 w-3" /> Locked, awaiting the final
					</span>
				)}
			</div>
			<p className="mt-2 flex items-center gap-2 font-serif text-lg font-bold">
				<span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamColor(c.awayTeam) }} />
				{nick(c.awayTeam)} at {nick(c.homeTeam)}
				<span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamColor(c.homeTeam) }} />
			</p>
			<dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
				<div className="rounded-lg bg-muted/50 p-2">
					<dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Final</dt>
					<dd className="font-serif text-lg font-bold">{c.result ? <ScoreLine away={c.result.away} home={c.result.home} label="Final score" /> : "–"}</dd>
				</div>
				<div className="rounded-lg bg-muted/50 p-2">
					<dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{signedIn ? who : "Blogger"}</dt>
					<dd className="font-serif text-lg font-bold">
						{signedIn ? (c.myPick ? <ScoreLine away={c.myPick.away} home={c.myPick.home} label="Your pick" /> : <span className="text-muted-foreground">No pick</span>) : c.blogger ? <ScoreLine away={c.blogger.away} home={c.blogger.home} label="Blogger pick" /> : "–"}
					</dd>
					{signedIn && c.myPoints !== null && <p className="text-xs text-muted-foreground">{c.myPoints} pts</p>}
				</div>
				<div className="rounded-lg bg-muted/50 p-2">
					<dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{signedIn ? "Blogger" : "Players"}</dt>
					<dd className="font-serif text-lg font-bold">{signedIn ? c.blogger ? <ScoreLine away={c.blogger.away} home={c.blogger.home} label="Blogger pick" /> : "–" : (c.community?.entries ?? "–")}</dd>
					{signedIn && c.bloggerPoints !== null && <p className="text-xs text-muted-foreground">{c.bloggerPoints} pts</p>}
				</div>
			</dl>
			{c.community && c.community.awayShare !== null && (
				<p className="mt-3 text-xs text-muted-foreground">
					{pct(c.community.awayShare)} of {c.community.entries} players picked {nick(c.awayTeam)}.
				</p>
			)}
		</li>
	)
}

export function BoardPanel({ view }: { view: HomeView }) {
	const b = view.board
	const showAround = view.me && !b.top.some((r) => r.isMe) && b.around.length > 0
	return (
		<div className="grid gap-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<Tile label="Blogger" value={b.blogger.points} foot={`${b.blogger.games} graded game${b.blogger.games === 1 ? "" : "s"}`} />
				<Tile label="Ahead of me" value={`${b.aheadOfBlogger}`} foot={b.shareAhead === null ? "No ranked players yet" : `${pct(b.shareAhead)} of ${b.total} ranked`} />
				<Tile label="Players" value={view.players} foot="in the league" />
			</div>
			{b.total === 0 ? (
				<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nobody is ranked yet. The board fills in after the first graded game.</p>
			) : (
				<>
					<Table rows={b.top} caption="Top of the leaderboard" />
					{showAround && <Table rows={b.around} caption="Around you" />}
					<p className="text-xs text-muted-foreground">Ties on points go to more correct winners, then the smaller average miss, then whoever joined first. &ldquo;Vs me&rdquo; is points minus mine over the games you both entered.</p>
				</>
			)}
		</div>
	)
}

export function Table({ rows, caption }: { rows: BoardRow[]; caption: string }) {
	return (
		<div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
			<table className="w-full min-w-[420px] text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						<th scope="col" className="px-3 py-2.5">Rank</th>
						<th scope="col" className="px-3 py-2.5">Player</th>
						<th scope="col" className="px-3 py-2.5 text-right">Pts</th>
						<th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">Games</th>
						<th scope="col" className="px-3 py-2.5 text-right">Vs me</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.playerId} className={cn("border-b border-border/60 last:border-0", r.isMe && "bg-muted/60 font-semibold")} aria-current={r.isMe ? "true" : undefined}>
							<td className="px-3 py-2.5 tabular-nums">{r.rank}</td>
							<td className="px-3 py-2.5">
								<Link href={`/league/${r.handle}`} className="underline-offset-4 hover:underline">
									{r.handle}
								</Link>
								{r.isMe && <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">You</span>}
							</td>
							<td className="px-3 py-2.5 text-right tabular-nums">{r.points}</td>
							<td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.games}</td>
							<td className={cn("px-3 py-2.5 text-right tabular-nums", r.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : r.delta < 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground")}>{signed(r.delta)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export function RivalryPanel({ me }: { me: MyLine }) {
	const r = me.rivalry
	if (r.games === 0) {
		return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Your rivalry starts with your first graded game. Pick the next one and see how you do against me.</p>
	}
	const total = r.record.w + r.record.l + r.record.t
	const w = (n: number) => `${Math.round((n / total) * 100)}%`
	return (
		<div className="rounded-xl border border-border bg-card p-5 shadow-sm">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<p className="font-serif text-3xl font-bold tabular-nums">
					{r.record.w}&ndash;{r.record.l}
					{r.record.t > 0 && <>&ndash;{r.record.t}</>}
				</p>
				<p className="text-sm text-muted-foreground">
					{r.differential > 0 ? `You are ${r.differential} points ahead of me` : r.differential < 0 ? `I am ${Math.abs(r.differential)} points ahead of you` : "Dead even"} over {r.games} game{r.games === 1 ? "" : "s"}
				</p>
			</div>
			<div role="img" aria-label={`${r.record.w} wins, ${r.record.l} losses, ${r.record.t} ties against the blogger`} className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
				<div className="bg-emerald-600" style={{ width: w(r.record.w) }} />
				<div className="bg-zinc-400" style={{ width: w(r.record.t) }} />
				<div className="bg-rose-600" style={{ width: w(r.record.l) }} />
			</div>
			<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
				<div>
					<dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Right now</dt>
					<dd className="font-semibold">{r.current ? `${r.current.length} ${r.current.type === "W" ? "straight beating me" : r.current.type === "L" ? "straight behind me" : "straight ties"}` : "–"}</dd>
				</div>
				<div>
					<dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Longest run on me</dt>
					<dd className="font-semibold">{r.longestWin} game{r.longestWin === 1 ? "" : "s"}</dd>
				</div>
				<div>
					<dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Best game</dt>
					<dd className="font-semibold">{r.best ? `Week ${r.best.week}, ${r.best.playerPoints} pts` : "–"}</dd>
				</div>
			</dl>
		</div>
	)
}

export function PlayList({ view, signedIn }: { view: HomeView; signedIn: boolean }) {
	if (view.slate.length === 0 && view.locked.length === 0) {
		return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No game is open for picks right now. The next Raiders game opens as soon as I put my own pick on the record.</p>
	}
	return (
		<div className="grid gap-4">
			{view.slate.length > 0 &&
				(signedIn ? (
					<div className="grid gap-4 md:grid-cols-2">
						{view.slate.map((c) => (
							<PickForm key={c.eventId} eventId={c.eventId} awayTeam={c.awayTeam} homeTeam={c.homeTeam} lockAt={c.lockAt} initial={c.myPick} kickoffLabel={kickoffLabel(c.kickoff)} week={c.week} />
						))}
					</div>
				) : (
					<ul className="grid gap-3 md:grid-cols-2">
						{view.slate.map((c) => (
							<li key={c.eventId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
								<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
									Week {c.week} · {kickoffLabel(c.kickoff)}
								</p>
								<p className="mt-1 font-serif text-xl font-bold">
									{nick(c.awayTeam)} at {nick(c.homeTeam)}
								</p>
								<Link href="/league/register" className="mt-3 inline-flex items-center text-sm font-semibold underline-offset-4 hover:underline">
									Create an account to pick <ArrowRight aria-hidden className="ml-1 h-4 w-4" />
								</Link>
							</li>
						))}
					</ul>
				))}
			{view.locked.length > 0 && (
				<ul className="grid gap-3 md:grid-cols-2">
					{view.locked.map((c) => (
						<ResultCard key={c.eventId} c={c} signedIn={signedIn} />
					))}
				</ul>
			)}
		</div>
	)
}

type ChallengeModes = { winners: boolean; confidence: boolean; upset: boolean }

const CHALLENGES: { mode: keyof ChallengeModes; title: string; blurb: string; href: string; cta: [string, string] }[] = [
	{ mode: "winners", title: "NFL game winners", blurb: "Pick the winner of every game each week and chase the weekly title. One tap per game.", href: "/league/nfl", cta: ["Make this week's picks", "See the league"] },
	{ mode: "confidence", title: "Confidence picks", blurb: "Rank your weekly picks by how sure you are. Your boldest call is worth the most.", href: "/league/nfl/confidence", cta: ["Rank this week's picks", "See the league"] },
	{ mode: "upset", title: "Upset challenge", blurb: "Call the week's biggest upsets. Bigger underdogs pay more.", href: "/league/nfl/upsets", cta: ["Call this week's upsets", "See the league"] },
]

export function Challenges({ signedIn, modes }: { signedIn: boolean; modes: ChallengeModes }) {
	return (
		<ul className="grid gap-3 md:grid-cols-3">
			{CHALLENGES.map((c) =>
				modes[c.mode] ? (
					<li key={c.mode} className="rounded-xl border border-border bg-card p-5 shadow-sm">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Open now</p>
						<h3 className="mt-1 font-serif text-xl font-bold">{c.title}</h3>
						<p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
						<Link href={c.href} className="mt-3 inline-flex items-center text-sm font-semibold underline-offset-4 hover:underline">
							{signedIn ? c.cta[0] : c.cta[1]} <ArrowRight aria-hidden className="ml-1 h-4 w-4" />
						</Link>
					</li>
				) : (
					<li key={c.mode} className="rounded-xl border border-dashed border-border p-5">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Coming soon</p>
						<h3 className="mt-1 font-serif text-xl font-bold">{c.title}</h3>
						<p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
					</li>
				)
			)}
		</ul>
	)
}

export function Rules() {
	return (
		<div className="grid gap-6 md:grid-cols-2">
			<div>
				<h3 className="mb-3 font-serif text-lg font-bold">Scoring (Classic v1)</h3>
				<ScoringList />
				<p className="mt-2 text-xs text-muted-foreground">Up to {MAX} a game. A rule change is always a new version that only applies to games that lock afterward.</p>
			</div>
			<div>
				<h3 className="mb-3 font-serif text-lg font-bold">Fair play</h3>
				<ul className="grid gap-2 text-sm text-muted-foreground">
					<li>Picks lock at kickoff, by the server&rsquo;s clock. Change a pick as often as you like before then.</li>
					<li>My pick and everyone else&rsquo;s stay hidden until a game locks.</li>
					<li>If a postponement moves kickoff, the lock moves with it and every pick stays.</li>
					<li>A corrected final score regrades the game. Old grades are kept; nothing is rewritten.</li>
					<li>If I ever change my pick after it locks, the change is logged with a reason. It is never silent.</li>
					<li>A cancelled game is voided: no points for anyone.</li>
				</ul>
			</div>
		</div>
	)
}
