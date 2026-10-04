"use client"

import * as React from "react"

import GamePicker from "@/components/live/GamePicker"
import LiveField, { type Banner } from "@/components/live/LiveField"
import LiveWinChart from "@/components/live/LiveWinChart"
import PinnedTake, { type Pinned } from "@/components/live/PinnedTake"
import PlayFeed from "@/components/live/PlayFeed"
import ScoreBug from "@/components/live/ScoreBug"
import TeamStats from "@/components/live/TeamStats"
import { usePolled } from "@/components/live/hooks"
import { RAIDERS_ABBR, sideColors } from "@/lib/live/colors"
import { signed } from "@/lib/live/format"
import { allPlays, type Swing } from "@/lib/live/series"
import type { LiveGame, LiveGameInfo, LivePlay, WpSample } from "@/lib/live/types"

type BoardResponse = { games: LiveGameInfo[]; featured: string | null; stale: boolean; at: number }
type GameResponse = { game: LiveGame; wp: { series: WpSample[]; now: number; swings: Swing[] }; stale: boolean; at: number }

const card = "rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-6"

/** How long to wait before asking for the week's games again. */
function boardDelay(b: BoardResponse | null): number {
	if (!b) return 20_000
	if (b.games.some((g) => g.state === "in")) return 20_000
	const soon = b.games.some((g) => g.state === "pre" && g.kickoff && new Date(g.kickoff).getTime() - Date.now() < 4 * 3600_000)
	return soon ? 45_000 : 180_000
}

function bannerFor(p: LivePlay): Banner {
	if (p.turnover) return { id: p.id, label: "Turnover", text: p.text, tone: "turnover" }
	if (p.touchdown) return { id: p.id, label: "Touchdown", text: p.text, tone: "score" }
	if (p.scoring) return { id: p.id, label: p.kind === "fg" ? "Field goal" : "Score", text: p.text, tone: "score" }
	return { id: p.id, label: `Big play ${signed(p.yards)}`, text: p.text, tone: "big" }
}

function GameView({ initial, boardAt, pinned }: { initial: LiveGameInfo; boardAt: number; pinned: Pinned | null }) {
	const { data, error, updatedAt, refresh } = usePolled<GameResponse>(`/api/live/game?id=${initial.id}`, (d) => (d?.game.info.state === "post" ? null : d?.game.info.state === "in" ? 10_000 : 30_000))
	const game = data?.game ?? null
	// The score comes from whichever of the two feeds answered last, so the bug and the picker agree.
	const info = game && (updatedAt ?? 0) >= boardAt ? game.info : initial
	const sides = sideColors(info)

	// Announce a play that arrives after the page loaded, if it is worth announcing.
	const seen = React.useRef<number | null>(null)
	const [banner, setBanner] = React.useState<Banner | null>(null)
	React.useEffect(() => {
		if (!game) return
		const plays = allPlays(game)
		const max = plays.reduce((m, p) => Math.max(m, p.seq), 0)
		if (seen.current == null) {
			seen.current = max
			return
		}
		const fresh = plays.filter((p) => p.seq > (seen.current as number) && p.big)
		seen.current = max
		const p = fresh[fresh.length - 1]
		if (p && game.info.state === "in") {
			setBanner(bannerFor(p))
			const t = window.setTimeout(() => setBanner(null), 5000)
			return () => window.clearTimeout(t)
		}
	}, [game])

	const raiders = info.home.abbr === RAIDERS_ABBR || info.away.abbr === RAIDERS_ABBR
	const focusIsHome = raiders ? info.home.abbr === RAIDERS_ABBR : true
	const focus = focusIsHome ? sides.home : sides.away
	const other = focusIsHome ? sides.away : sides.home

	const ago = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null

	return (
		<div className="lab-opp" style={sides.vars}>
			<div className="space-y-4 sm:space-y-6">
				<ScoreBug info={info} away={sides.away} home={sides.home} />

				<PinnedTake take={pinned} />

				{error && (
					<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-2.5 text-sm text-lab-soft">
						<span>{game ? "Having trouble refreshing. Showing the last update." : "The live feed isn't answering right now."}</span>
						<button type="button" onClick={refresh} className="font-semibold text-lab-ink underline underline-offset-4">
							Try again
						</button>
					</div>
				)}

				{!game && !error ? (
					<div className={card} aria-busy>
						<div className="h-64 animate-pulse rounded-xl bg-lab-tint sm:h-96" />
					</div>
				) : game ? (
					<div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
						<div className="space-y-4 sm:space-y-6">
							<div className={card + " overflow-hidden !p-2 sm:!p-4"}>
								<LiveField game={game} away={sides.away} home={sides.home} banner={banner} />
							</div>
							{data && (
								<div className={card}>
									<LiveWinChart info={info} series={data.wp.series} swings={data.wp.swings} focus={focus} other={other} live={info.state === "in"} />
								</div>
							)}
						</div>
						<div className="space-y-4 sm:space-y-6">
							<div className={card}>
								<PlayFeed game={game} sides={sides} />
							</div>
							<div className={card}>
								<TeamStats game={game} away={sides.away} home={sides.home} />
								{game.stats.length === 0 && <p className="text-sm text-lab-muted">Team stats appear once the game is underway.</p>}
							</div>
						</div>
					</div>
				) : null}

				<p className="text-center text-[11px] text-lab-muted" aria-live="off">
					{info.state === "in" ? "Updates on its own about every 10 seconds." : info.state === "post" ? "Final. This game is complete." : "Updates on its own once the game starts."}
					{ago != null && info.state === "in" ? ` Last update ${ago}s ago.` : ""}
					{data?.stale ? " Showing saved data while the feed recovers." : ""}
				</p>
			</div>

			<div className="sr-only" role="status" aria-live="polite">
				{banner ? `${banner.label}. ${banner.text}` : ""}
			</div>
		</div>
	)
}

/** The live page's engine: picks the game, keeps the week's scores fresh, and draws the selected game. */
export default function LiveCenter({ initialBoard, pinned }: { initialBoard: LiveGameInfo[] | null; pinned: Pinned | null }) {
	const seed: BoardResponse | null = initialBoard ? { games: initialBoard, featured: null, stale: false, at: 0 } : null
	const board = usePolled<BoardResponse>("/api/live/scoreboard", boardDelay, seed)
	const games = board.data?.games ?? initialBoard ?? []
	const [choice, setChoice] = React.useState<string | null>(null)

	const featured = React.useMemo(() => {
		const mine = games.find((g) => g.home.abbr === RAIDERS_ABBR || g.away.abbr === RAIDERS_ABBR)
		return mine ?? games.find((g) => g.state === "in") ?? games.find((g) => g.state === "pre") ?? games[games.length - 1] ?? null
	}, [games])
	const selected = games.find((g) => g.id === choice) ?? featured

	if (!selected) {
		return (
			<div className={card}>
				<p className="font-serif text-xl font-bold">{board.error ? "Live scores are unavailable right now." : "No games on the board."}</p>
				<p className="mt-2 text-sm text-lab-soft">
					{board.error ? "The score feed isn't answering. Try again in a minute." : "Check back on game day. Scores, plays and win probability show up here on their own."}
				</p>
				{board.error && (
					<button type="button" onClick={board.refresh} className="mt-3 text-sm font-semibold underline underline-offset-4">
						Try again
					</button>
				)}
			</div>
		)
	}

	return (
		<div className="space-y-4 sm:space-y-6">
			<GamePicker games={games} selected={selected.id} onSelect={setChoice} />
			<GameView key={selected.id} initial={selected} boardAt={board.updatedAt ?? 0} pinned={selected.home.abbr === RAIDERS_ABBR || selected.away.abbr === RAIDERS_ABBR ? pinned : null} />
		</div>
	)
}
