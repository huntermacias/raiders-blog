"use client"

import { useMemo, useState } from "react"
import Link from "@/components/SiteLink"
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react"

import { TeamLogo } from "@/components/lab/players/Media"
import { usePolled, useNow } from "@/components/live/hooks"
import { cn } from "@/lib/utils"
import { DIVISIONS, RAIDERS, teamByAbbr, teamInfo } from "@/lib/nfl"
import { type RankRow, type RankingsWeek, biggestMovers, movementWords, raidersRow } from "@/lib/rankings"
import { accentOnDark, withAlpha } from "@/lib/teamAccent"
import { type TeamGame, gameShareText, gamesByTeam, liveCount, pollDelay } from "@/lib/rankingsLive"
import type { LiveGameInfo } from "@/lib/live/types"
import GameChip, { LiveDot } from "./GameChip"
import GameShare from "./GameShare"
import Move from "./Move"
import Podium from "./Podium"
import RankingsShare from "./RankingsShare"
import ScoresStrip from "./ScoresStrip"
import Sparkline from "./Sparkline"

export type Records = Record<string, { w: number; l: number; t: number }>

type Props = {
	/** Oldest to newest. */
	boards: RankingsWeek[]
	/** Each week's records, as they stood when that week's rankings were posted. */
	recordsByWeek?: Record<number, Records>
	/** ISO time each week's records are through (when the rankings were posted). */
	recordsAsOf?: Record<number, string>
	season: number
	/** The page's one-line summary under the title. */
	summary: string
	/** What the share buttons post, and the address they carry. */
	share: { url: string; stamp: number; text: string }
	/** This week's scoreboard as the server read it, or null if it could not be read (the page then asks for it). */
	initialGames?: LiveGameInfo[] | null
	/** The server's clock when the page was rendered, so the first paint on server and browser agree. */
	serverNow: number
}

const FILTERS = ["All", "AFC", "NFC", ...DIVISIONS] as const
type Filter = (typeof FILTERS)[number]
const LIVE_FILTER = "Playing now"

/** "Oct 15", in Pacific time so server and browser agree. */
function asOfText(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })
}

function recText(r?: { w: number; l: number; t: number }) {
	if (!r) return null
	return `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`
}

function Chip({ active, onClick, children, live = false }: { active: boolean; onClick: () => void; children: React.ReactNode; live?: boolean }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				active
					? live
						? "border-red-500 bg-red-500 text-white"
						: "border-foreground bg-foreground text-background"
					: "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
			)}
		>
			{children}
		</button>
	)
}

function MoverList({ title, items, kind }: { title: string; items: { team: string; rank: number; change: number }[]; kind: "up" | "down" }) {
	if (items.length === 0) return null
	return (
		<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
			<p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
				<span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", kind === "up" ? "bg-emerald-500" : "bg-rose-500")} />
				{title}
			</p>
			<ul className="space-y-2">
				{items.map((m) => {
					const t = teamInfo(m.team)
					return (
						<li key={m.team} className="flex items-center justify-between gap-3 text-sm" style={{ "--pc-accent": t.color, "--pc-on": "#ffffff" } as React.CSSProperties}>
							<span className="flex min-w-0 items-center gap-2.5">
								<TeamLogo team={t.abbr} size={24} className="h-6 w-6" />
								<span className={cn("truncate font-medium", m.team === RAIDERS && "font-bold")}>{t.nick}</span>
							</span>
							<span className="shrink-0 tabular-nums text-muted-foreground">
								No. {m.rank}{" "}
								<span className={cn("font-bold", kind === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
									{kind === "up" ? "+" : "−"}
									{Math.abs(m.change)}
								</span>
							</span>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

/** The Raiders card in the masthead: the rank big, how they moved, their rank line, and their game when they are playing. */
function RaidersSpotlight({ row, week, hasPrev, record, game, ranks }: { row: RankRow; week: number; hasPrev: boolean; record: string | null; game?: TeamGame; ranks: Record<string, number | undefined> }) {
	const ranksSeen = row.history.filter((r): r is number => r !== null)
	const best = ranksSeen.length ? Math.min(...ranksSeen) : null
	const worst = ranksSeen.length ? Math.max(...ranksSeen) : null
	const silver = accentOnDark("#a5acaf", "LV")
	return (
		<section
			aria-label="Raiders ranking"
			className="relative overflow-hidden rounded-2xl border border-white/15 p-5 md:p-6"
			style={{ background: `radial-gradient(90% 120% at 100% 0%, ${withAlpha(silver, 0.22)} 0%, rgba(9,9,11,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))` }}
		>
			<p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
				<TeamLogo team="LV" size={20} className="h-5 w-5" /> Las Vegas Raiders · Week {week}
			</p>
			<div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
				<div>
					<div className="flex items-baseline gap-4">
						<p className="whitespace-nowrap font-serif text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl md:text-7xl">No. {row.rank}</p>
						<div className="flex flex-col gap-0.5">
							<Move row={row} hasPrev={hasPrev} dark />
							{row.change !== null && <span className="text-xs text-zinc-400">{movementWords(row.change)} from last week</span>}
						</div>
					</div>
					{record && <p className="mt-2 text-sm tabular-nums text-zinc-300">Record {record}</p>}
				</div>
				{ranksSeen.length >= 2 && (
					<div className="text-zinc-100">
						<Sparkline history={row.history} width={150} height={44} color={silver} />
						<p className="mt-1 text-[11px] text-zinc-500">
							Best No. {best} · Low No. {worst}
						</p>
					</div>
				)}
			</div>
			{row.note && <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-300">{row.note}</p>}
			{game && (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<GameChip game={game} tone="dark" className="min-w-[13rem] flex-1" />
					<GameShare gameId={game.gameId} text={gameShareText(game, ranks)} label={`Raiders ${game.atHome ? "vs" : "at"} ${teamByAbbr(game.opp.abbr).nick}`} tone="dark" />
				</div>
			)}
		</section>
	)
}

function BoardRow({ r, hasPrev, record, game, ranks, isLatest }: { r: RankRow; hasPrev: boolean; record: string | null; game?: TeamGame; ranks: Record<string, number | undefined>; isLatest: boolean }) {
	const isLV = r.team === RAIDERS
	const t = teamInfo(r.team)
	const live = game?.state === "in"
	return (
		<li
			value={r.rank}
			data-live={live || undefined}
			className={cn(
				"group relative grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 pl-5 transition-colors hover:bg-muted/50 md:grid-cols-[3rem_3.25rem_2.75rem_minmax(0,1fr)_4.5rem_5rem_12.5rem] md:gap-x-4 md:px-5",
				isLV && "bg-muted/60",
				live && "bg-red-500/[0.04]"
			)}
			style={{ "--pc-accent": t.color, "--pc-on": "#ffffff" } as React.CSSProperties}
		>
			<span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
			<span className="font-serif text-2xl font-bold tabular-nums leading-none md:text-3xl">{r.rank}</span>

			<span className="hidden md:block">
				<Move row={r} hasPrev={hasPrev} />
			</span>

			<TeamLogo team={t.abbr} size={36} className="h-8 w-8 md:h-9 md:w-9" />

			<div className="col-span-2 min-w-0 md:col-span-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className={cn("font-semibold leading-tight", isLV && "font-extrabold")}>{t.name}</span>
					{isLV && <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">Us</span>}
					{live && (
						<span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
							<LiveDot /> Live
						</span>
					)}
				</div>
				{r.note && <p className="mt-1 text-sm leading-snug text-muted-foreground">{r.note}</p>}
				<div className="mt-1 flex items-center gap-3 md:hidden">
					<Move row={r} hasPrev={hasPrev} />
					{record && <span className="text-xs tabular-nums text-muted-foreground">{record}</span>}
				</div>
			</div>

			<span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">{record}</span>

			<span className="hidden justify-self-end text-muted-foreground md:block">
				<Sparkline history={r.history} color={t.abbr === "LV" ? undefined : t.color} />
			</span>

			{isLatest && game && (
				<div className="col-span-full flex flex-wrap items-center gap-2 md:col-span-1 md:col-start-7 md:row-start-1 md:flex-col md:items-stretch md:gap-1.5">
					<GameChip game={game} className="min-w-[14rem] flex-1 md:min-w-0 md:flex-none" />
					{game.state !== "pre" && (
						<GameShare
							gameId={game.gameId}
							text={gameShareText(game, ranks)}
							label={`${t.nick} ${game.atHome ? "vs" : "at"} ${teamByAbbr(game.opp.abbr).nick}`}
							className="md:self-end"
						/>
					)}
				</div>
			)}
		</li>
	)
}

export default function RankingsBoard({ boards, recordsByWeek, recordsAsOf, season, summary, share, initialGames = null, serverNow }: Props) {
	const latest = boards[boards.length - 1]
	const [week, setWeek] = useState<number>(latest?.week ?? 0)
	const [filter, setFilter] = useState<Filter | typeof LIVE_FILTER>("All")
	const [query, setQuery] = useState("")

	// Scores come from the same scoreboard the Live page reads. The page sends what the server saw; this keeps asking only while a game is on (and
	// as kickoff nears), and not at all while the tab is hidden. See usePolled.
	const polled = usePolled<{ games: LiveGameInfo[] }>("/api/live/scoreboard", (d) => pollDelay(d?.games ?? initialGames, Date.now()), initialGames ? { games: initialGames } : null)
	const games = polled.data?.games ?? initialGames ?? []
	const clock = useNow(30_000)
	const now = clock ?? serverNow

	const board = boards.find((b) => b.week === week) ?? latest
	const isLatest = !!board && !!latest && board.week === latest.week
	const records = board ? recordsByWeek?.[board.week] : undefined
	const asOf = board ? recordsAsOf?.[board.week] : undefined
	const hasPrev = board ? board.rows.some((r) => r.history.length > 1) : false

	// Scores belong to the latest board only: an older week's list is history, not this weekend.
	const byTeam = useMemo(() => (isLatest ? gamesByTeam(games, now) : {}), [games, now, isLatest])
	const ranks = useMemo(() => {
		const m: Record<string, number | undefined> = {}
		for (const r of board?.rows ?? []) m[teamInfo(r.team).abbr] = r.rank
		return m
	}, [board])
	const liveNow = isLatest ? liveCount(games) : 0

	const rows = useMemo(() => {
		if (!board) return []
		const q = query.trim().toLowerCase()
		return board.rows.filter((r) => {
			const t = teamInfo(r.team)
			if (q && !(t.name.toLowerCase().includes(q) || t.abbr.toLowerCase() === q)) return false
			if (filter === "All") return true
			if (filter === LIVE_FILTER) return byTeam[t.abbr]?.state === "in"
			return filter === t.conference || filter === t.division
		})
	}, [board, filter, query, byTeam])

	const movers = useMemo(() => (board ? biggestMovers(board.rows) : { risers: [], fallers: [] }), [board])
	const lv = board ? raidersRow(board.rows) : null

	if (!board) return null

	const weeksDesc = boards.slice().reverse()
	const idx = boards.findIndex((b) => b.week === board.week)
	const step = (d: -1 | 1) => {
		const next = boards[idx + d]
		if (next) setWeek(next.week)
	}
	const lvGame = lv ? byTeam[teamInfo(lv.team).abbr] : undefined
	const showAll = filter === "All" && !query.trim()

	return (
		<div>
			{/* Masthead: the title, the Raiders, the top three and (on the latest week) the scores, on one dark stage. */}
			<section aria-label={`Week ${board.week} power rankings summary`} className="relative isolate overflow-hidden rounded-3xl bg-[#09090b] text-zinc-50 shadow-xl ring-1 ring-white/10">
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 -z-10"
					style={{
						background:
							"radial-gradient(60% 50% at 12% 0%, rgba(207,211,214,0.14) 0%, rgba(9,9,11,0) 70%), radial-gradient(50% 40% at 100% 100%, rgba(255,255,255,0.06) 0%, rgba(9,9,11,0) 70%), repeating-linear-gradient(115deg, rgba(255,255,255,0.025) 0 2px, rgba(255,255,255,0) 2px 26px)",
					}}
				/>
				<div className="space-y-8 p-5 sm:p-7 md:space-y-10 md:p-10">
					<div className={cn("grid gap-8", lv ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center" : "")}>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
								{season} season · Week {board.week}
								{!isLatest && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wider">Past week</span>}
							</p>
							<h1 className="mt-2 font-serif text-5xl font-bold leading-[0.95] tracking-tight text-white md:text-7xl">Power Rankings</h1>
							<p className="mt-4 max-w-xl text-lg leading-snug text-zinc-300">{isLatest ? summary : board.headline || `All 32 teams as I ranked them in Week ${board.week}.`}</p>
							{isLatest && (
								<div className="[&_a]:text-zinc-200 [&_button]:text-zinc-200">
									<RankingsShare url={share.url} stamp={share.stamp} text={share.text} />
								</div>
							)}
						</div>
						{lv && (
							<RaidersSpotlight
								row={lv}
								week={board.week}
								hasPrev={hasPrev}
								record={recText(records?.[RAIDERS])}
								game={lvGame}
								ranks={ranks}
							/>
						)}
					</div>

					<Podium rows={board.rows} records={records} games={byTeam} hasPrev={hasPrev} />

					{isLatest && games.length > 0 && <ScoresStrip games={games} ranks={ranks} now={now} liveNow={liveNow} updatedAt={polled.updatedAt} />}
				</div>
			</section>

			{/* Controls */}
			<div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0" role="group" aria-label="Filter teams">
					{liveNow > 0 && (
						<Chip live active={filter === LIVE_FILTER} onClick={() => setFilter(filter === LIVE_FILTER ? "All" : LIVE_FILTER)}>
							<LiveDot className={filter === LIVE_FILTER ? "[&>*]:bg-white" : undefined} /> {LIVE_FILTER} ({liveNow * 2})
						</Chip>
					)}
					{FILTERS.map((f) => (
						<Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
							{f}
						</Chip>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<label className="relative block">
						<span className="sr-only">Find a team</span>
						<Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Find a team"
							className="h-9 w-44 rounded-full border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					{boards.length > 1 && (
						<div className="flex items-center gap-1 text-sm" role="group" aria-label="Week">
							<button
								type="button"
								onClick={() => step(-1)}
								disabled={idx <= 0}
								aria-label="Previous week"
								className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition-colors hover:border-foreground disabled:opacity-40 disabled:hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ChevronLeft aria-hidden className="h-4 w-4" />
							</button>
							<label className="sr-only" htmlFor="rankings-week">
								Week
							</label>
							<select
								id="rankings-week"
								value={board.week}
								onChange={(e) => setWeek(Number(e.target.value))}
								className="h-9 rounded-full border border-border bg-background px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{weeksDesc.map((b) => (
									<option key={b.week} value={b.week}>
										{b.week === latest.week ? `Week ${b.week} (latest)` : `Week ${b.week}`}
									</option>
								))}
							</select>
							<button
								type="button"
								onClick={() => step(1)}
								disabled={idx >= boards.length - 1}
								aria-label="Next week"
								className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition-colors hover:border-foreground disabled:opacity-40 disabled:hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ChevronRight aria-hidden className="h-4 w-4" />
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Movers */}
			{showAll && (movers.risers.length > 0 || movers.fallers.length > 0) && (
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<MoverList title="Biggest risers" items={movers.risers} kind="up" />
					<MoverList title="Biggest fallers" items={movers.fallers} kind="down" />
				</div>
			)}

			{/* Full list */}
			{rows.length > 0 ? (
				<ol className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label={`Week ${board.week} power rankings`}>
					{rows.map((r) => {
						const abbr = teamInfo(r.team).abbr
						return <BoardRow key={r.team} r={r} hasPrev={hasPrev} record={recText(records?.[r.team])} game={byTeam[abbr]} ranks={ranks} isLatest={isLatest} />
					})}
				</ol>
			) : (
				<p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
					{filter === LIVE_FILTER ? "No team is playing right now." : "No team matches that."}
				</p>
			)}

			{board.post && (
				<p className="mt-6">
					<Link href={`/post/${board.post.slug}`} className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
						Read the Week {board.week} rankings write-up <ArrowRight aria-hidden className="h-4 w-4" />
					</Link>
				</p>
			)}
			<p className="mt-4 text-xs text-muted-foreground">
				{season} season. Rankings are my own opinion, updated weekly; the little line shows each team's rank week by week with No. 1 at the top.
				{records && asOf ? ` Records are through the games that were final when these rankings were posted (${asOfText(asOf)}).` : ""}
				{isLatest && games.length > 0 ? " Scores come from ESPN and refresh by themselves while a game is on." : ""}
			</p>
		</div>
	)
}
