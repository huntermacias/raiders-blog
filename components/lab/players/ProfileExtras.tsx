import { DOWN, UP } from "@/components/lab/players/Bits"
import Yardstick from "@/components/lab/players/Yardstick"
import Link from "@/components/SiteLink"
import { boardHref, cardStyle, profileHref, teamNick } from "@/lib/lab/playerView"
import { singular, type BuildLine, type Rung, formatBox, formatStat, ordinal, statInfo, type Board, type PlayerGroup, type GamePick } from "@/lib/lab/playersKit"

// Three server-rendered pieces of a profile: the people just above and below him on a leaderboard, his build against his position, and his
// best and worst game on a stat. All of the thinking is in playersKit.ts; these only lay it out.

export function Ladders({ group, items, peers }: { group: PlayerGroup; items: { board: Board; rungs: Rung[] }[]; peers: string }) {
	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="ladders">
			{items.map(({ board, rungs }) => {
				const leader = rungs[0]?.rank === 1 ? rungs[0] : null
				const fmt = (v: number) => (board.kind === "box" ? formatBox(group, board.key, v) : formatStat(group, board.key, v))
				const info = board.kind === "stat" ? statInfo(group, board.key) : null
				return (
					<div key={`${board.kind}:${board.key}`} className="rounded-2xl border border-lab-line bg-lab-surface p-4">
						<h3 className="m-0 font-serif text-lg font-bold">
							<Link href={boardHref(group, board.path)} className="hover:underline">
								{board.label}
							</Link>
						</h3>
						<p className="m-0 mt-0.5 text-xs text-lab-muted">
							{info?.higher === false ? "Lower is better. " : ""}
							The {peers} just above and below him
						</p>
						<ol className="m-0 mt-3 list-none divide-y divide-lab-line p-0">
							{rungs.map((r) => (
								<li key={r.slug} className={`flex items-center gap-3 py-2 text-sm ${r.me ? "-mx-2 rounded-lg bg-lab-tint px-2 font-semibold" : ""}`} style={r.me ? cardStyle(r.team) : undefined} aria-current={r.me ? "true" : undefined}>
									<span className="w-9 shrink-0 font-mono text-xs tabular-nums text-lab-muted">{ordinal(r.rank)}</span>
									<span className="min-w-0 flex-1 truncate">
										{r.me ? (
											r.name
										) : (
											<Link href={profileHref(r.slug)} className="hover:underline">
												{r.name}
											</Link>
										)}{" "}
										<span className="text-xs font-normal text-lab-muted">{teamNick(r.team)}</span>
									</span>
									<span className="shrink-0 font-mono tabular-nums">{fmt(r.value)}</span>
								</li>
							))}
						</ol>
						{leader ? null : rungs[0] ? <p className="m-0 mt-2 text-xs text-lab-muted">The leader is further up the board.</p> : null}
					</div>
				)
			})}
		</div>
	)
}

export function BuildAgainstPeers({ lines, peers, name }: { lines: BuildLine[]; peers: string; name: string }) {
	return (
		<div className="grid gap-4 md:grid-cols-3" data-testid="build">
			{lines.map((l) => (
				<div key={l.label} className="rounded-2xl border border-lab-line bg-lab-surface p-4">
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{l.label}</p>
					<p className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums">{l.value}</p>
					<p className="m-0 mt-1 text-sm text-lab-soft">{name} is {l.word}.</p>
					<div className="mt-3">
						<Yardstick marks={[{ v: l.v, name }]} yard={l.yard} higher={null} fmt={(v) => (l.label === "Height" ? `${Math.floor(v / 12)}'${Math.round(v % 12)}"` : l.label === "Weight" ? `${Math.round(v)}` : String(Math.round(v)))} peers={peers} />
					</div>
				</div>
			))}
		</div>
	)
}

export type GameCall = { key: string; label: string; best: GamePick & { opp: string; result: string | null; won: boolean | null }; worst: GamePick & { opp: string; result: string | null; won: boolean | null }; per: string }

export function BestWorst({ group, calls }: { group: PlayerGroup; calls: GameCall[] }) {
	const on = (g: GameCall["best"], per: string) => `on ${g.volume} ${g.volume === 1 ? singular(per) : per}`
	return (
		<div className="grid gap-3 md:grid-cols-2" data-testid="best-worst">
			{calls.map((c) => (
				<div key={c.key} className="rounded-2xl border border-lab-line bg-lab-surface p-4">
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{c.label}</p>
					<dl className="m-0 mt-2 grid grid-cols-2 gap-3">
						{[
							{ tag: "Best game", g: c.best, mark: "▲", cls: UP },
							{ tag: "Worst game", g: c.worst, mark: "▼", cls: DOWN },
						].map((x) => (
							<div key={x.tag}>
								<dt className={`text-xs font-semibold ${x.cls}`}>
									{x.mark} {x.tag}
								</dt>
								<dd className="m-0 mt-0.5">
									<span className="block font-mono text-lg font-bold tabular-nums">{formatStat(group, c.key, x.g.value)}</span>
									<span className="block text-xs text-lab-soft">
										Week {x.g.week}
										{x.g.opp ? ` ${x.g.opp}` : ""}
										{x.g.result ? `, ${x.g.result}` : ""}
									</span>
									<span className="block text-xs text-lab-muted">{on(x.g, c.per)}</span>
								</dd>
							</div>
						))}
					</dl>
				</div>
			))}
		</div>
	)
}
