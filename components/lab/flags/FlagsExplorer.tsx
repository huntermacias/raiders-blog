"use client"

import * as React from "react"

import Link from "@/components/SiteLink"
import FlagCard from "@/components/lab/flags/FlagCard"
import {
	type Filter,
	type Flag,
	type FlagPlayer,
	type Group,
	NO_FILTER,
	applyFilter,
	byDown,
	byGame,
	byType,
	downName,
	latestCostly,
	newest,
	playerFlagsHref,
	playerRows,
	totals,
	turnoversText,
} from "@/lib/lab/flagsKit"

export type SeasonFlags = { season: number; week: number; flags: Flag[]; turnoverCost: number; rank?: { rank: number; of: number } | null }

const BAD = "text-rose-700 dark:text-rose-400"
const PAGE = 20

function Tile({ label, value, sub, bad = false }: { label: string; value: string; sub?: string; bad?: boolean }) {
	return (
		<div className="rounded-xl border border-lab-line bg-lab-surface px-3.5 py-3">
			<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label}</p>
			<p className={`m-0 mt-1 font-mono text-2xl font-bold tabular-nums ${bad ? BAD : "text-lab-ink"}`}>{value}</p>
			{sub ? <p className="m-0 mt-0.5 text-xs leading-snug text-lab-muted">{sub}</p> : null}
		</div>
	)
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onClick}
			className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
		>
			{children}
		</button>
	)
}

/** Horizontal bars for a few groups: the bar is the points the flags cost; the numbers beside it say the same, so it is never the only signal. */
function Bars({ rows, caption, nameHead }: { rows: Group[]; caption: string; nameHead: string }) {
	const max = Math.max(0.1, ...rows.map((r) => Math.max(0, r.cost)))
	return (
		<div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto [contain:paint]">
			<table className="w-full border-collapse text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
						<th scope="col" className="py-1.5 pr-2 font-semibold">
							{nameHead}
						</th>
						<th scope="col" className="px-2 py-1.5 text-right font-semibold">
							Flags
						</th>
						<th scope="col" className="px-2 py-1.5 text-right font-semibold">
							Costly
						</th>
						<th scope="col" className="py-1.5 pl-2 text-right font-semibold">
							Cost
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.key} className="border-t border-lab-line align-middle">
							<th scope="row" className="py-2 pr-2 text-left font-semibold text-lab-ink">
								<span className="block">{r.label}</span>
								<span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-lab-tint">
									<span className="block h-full rounded-full bg-lab-ink/70" style={{ width: `${Math.max(0, Math.min(100, (Math.max(0, r.cost) / max) * 100))}%` }} />
								</span>
							</th>
							<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
							<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.costly ? BAD : "text-lab-muted"}`}>{r.costly}</td>
							<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/**
 * Everything about one team's or one player's flags: the season's totals, the costly ones first, the breakdowns by down and by penalty,
 * and the whole log with filters. `subject` is who the page is about; a team page also lists its players, a player page leaves that out.
 */
export default function FlagsExplorer({
	seasons,
	players,
	subject,
}: {
	seasons: SeasonFlags[]
	players: Record<string, FlagPlayer>
	subject: { kind: "team"; name: string } | { kind: "player"; name: string }
}) {
	const [season, setSeason] = React.useState(seasons[0]?.season ?? 0)
	const [filter, setFilter] = React.useState<Filter>(NO_FILTER)
	const [sort, setSort] = React.useState<"new" | "cost">("new")
	const [shown, setShown] = React.useState(PAGE)
	const cur = seasons.find((s) => s.season === season) ?? seasons[0]
	const flags = React.useMemo(() => cur?.flags ?? [], [cur])
	const per = cur?.turnoverCost
	const t = React.useMemo(() => totals(flags), [flags])
	const costly = React.useMemo(() => latestCostly(flags, 50), [flags])
	const log = React.useMemo(() => {
		const list = applyFilter(flags, filter)
		return sort === "cost" ? [...list].sort((a, b) => b.c - a.c || b.d.localeCompare(a.d)) : newest(list)
	}, [flags, filter, sort])
	const isTeam = subject.kind === "team"
	const rows = React.useMemo(() => (isTeam ? playerRows(flags, players) : []), [flags, players, isTeam])
	const teamFlags = React.useMemo(() => flags.filter((f) => f.ck === "team"), [flags])
	const types = React.useMemo(() => byType(flags), [flags])

	if (!cur) return null
	const who = isTeam ? "this team" : subject.name
	const set = (patch: Partial<Filter>) => {
		setFilter((f) => ({ ...f, ...patch }))
		setShown(PAGE)
	}

	return (
		<div>
			{seasons.length > 1 ? (
				<div role="group" aria-label="Season" className="mb-5 flex flex-wrap gap-1.5">
					{seasons.map((s) => (
						<Chip
							key={s.season}
							on={s.season === cur.season}
							onClick={() => {
								setSeason(s.season)
								setFilter(NO_FILTER)
								setShown(PAGE)
							}}
						>
							{s.season}
						</Chip>
					))}
				</div>
			) : null}

			{flags.length === 0 ? (
				<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">
					No accepted penalties in {cur.season} for {who} through week {cur.week}.
				</p>
			) : (
				<>
					<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="flag-totals">
						<Tile label="Flags" value={String(t.flags)} sub={`${t.yards} yards, through week ${cur.week}`} />
						<Tile label="Cost" value={t.cost.toFixed(1)} sub={`expected points, ${turnoversText(t.cost, per)}`} bad={t.cost >= (per ?? 4.4)} />
						<Tile label="Costly flags" value={String(t.costly)} sub="count like a turnover" bad={t.costly > 0} />
						<Tile label="Turnover-sized" value={t.costlyCost.toFixed(1)} sub={`points lost to those ${t.costly}`} />
					</div>
					{cur.rank && cur.rank.rank > 0 ? (
						<p className="m-0 mt-3 text-sm text-lab-soft">
							{isTeam ? "The " : ""}{subject.name} {isTeam ? "rank" : "ranks"} {ordinal(cur.rank.rank)} of {cur.rank.of} {isTeam ? "teams" : "players"} in what their flags cost in {cur.season} (1st costs the most).
						</p>
					) : null}
					{t.gifts || t.wipedTurnovers || t.wipedTouchdowns ? (
						<p className="m-0 mt-3 text-sm text-lab-soft">
							{[
								t.gifts ? `${t.gifts} gave a team a first down on 4th down` : "",
								t.wipedTurnovers ? `${t.wipedTurnovers} cancelled a takeaway` : "",
								t.wipedTouchdowns ? `${t.wipedTouchdowns} cancelled a touchdown` : "",
							]
								.filter(Boolean)
								.join(" · ")}
							.
						</p>
					) : null}

					<section className="mt-9" aria-labelledby="costly-h">
						<h2 id="costly-h" className="m-0 font-serif text-2xl font-bold tracking-tight">
							Costly flags
						</h2>
						<p className="m-0 mt-1 max-w-2xl text-sm text-lab-soft">The ones that count like a turnover, newest first. Open &ldquo;Play text&rdquo; on a card for the play as the league wrote it.</p>
						{costly.length ? (
							<ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-2">
								{costly.map((f) => (
									<FlagCard key={f.id} f={f} players={players} showWho={isTeam} per={per} />
								))}
							</ul>
						) : (
							<p className="m-0 mt-4 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">None so far in {cur.season}: no flag has cost {who} like a turnover.</p>
						)}
					</section>

					<section className="mt-10 grid gap-8 lg:grid-cols-2" aria-label="Where the flags come from">
						<div>
							<h2 className="m-0 font-serif text-xl font-bold tracking-tight">By down</h2>
							<p className="m-0 mb-2 mt-1 text-xs text-lab-muted">Fourth-down flags decide drives. &ldquo;Kicks&rdquo; are kickoffs and tries, which have no down.</p>
							<Bars rows={byDown(flags)} caption={`Flags by down for ${who}`} nameHead="Down" />
						</div>
						<div>
							<h2 className="m-0 font-serif text-xl font-bold tracking-tight">By penalty</h2>
							<p className="m-0 mb-2 mt-1 text-xs text-lab-muted">Costliest first.</p>
							<Bars rows={types.slice(0, 8)} caption={`Flags by penalty for ${who}`} nameHead="Penalty" />
						</div>
					</section>

					{isTeam && rows.length ? (
						<section className="mt-10" aria-labelledby="who-h">
							<h2 id="who-h" className="m-0 font-serif text-xl font-bold tracking-tight">
								Who gets them
							</h2>
							<p className="m-0 mb-2 mt-1 max-w-2xl text-xs text-lab-muted">
								Click a name for his every flag.
								{teamFlags.length ? ` ${teamFlags.length} more ${teamFlags.length === 1 ? "is" : "are"} the team's and its coaches' (too many men, illegal substitution), so they are not charged to a player.` : ""}
							</p>
							<div role="region" aria-label="Players by flag cost" tabIndex={0} className="overflow-x-auto [contain:paint]">
								<table className="w-full border-collapse text-sm">
									<caption className="sr-only">Players on this team, by what their flags cost</caption>
									<thead>
										<tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
											<th scope="col" className="py-1.5 pr-2 font-semibold">
												Player
											</th>
											<th scope="col" className="px-2 py-1.5 text-right font-semibold">
												Flags
											</th>
											<th scope="col" className="px-2 py-1.5 text-right font-semibold">
												4th down
											</th>
											<th scope="col" className="px-2 py-1.5 text-right font-semibold">
												Costly
											</th>
											<th scope="col" className="py-1.5 pl-2 text-right font-semibold">
												Cost
											</th>
										</tr>
									</thead>
									<tbody>
										{rows.slice(0, 15).map((r) => (
											<tr key={r.key} className="border-t border-lab-line">
												<th scope="row" className="py-2 pr-2 text-left font-semibold">
													{r.slug ? (
														<Link href={playerFlagsHref(r.slug)} className="text-lab-ink underline-offset-4 hover:underline">
															{r.label}
														</Link>
													) : (
														r.label
													)}
													{r.pos ? <span className="ml-1.5 text-xs font-normal text-lab-muted">{r.pos}</span> : null}
													{r.delay ? <span className="ml-1.5 text-xs font-normal text-lab-muted">{r.delay} delay of game</span> : null}
												</th>
												<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
												<td className="px-2 py-2 text-right font-mono tabular-nums">{r.fourth}</td>
												<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.costly ? BAD : "text-lab-muted"}`}>{r.costly}</td>
												<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					) : null}

					<section className="mt-10" aria-labelledby="games-h">
						<h2 id="games-h" className="m-0 font-serif text-xl font-bold tracking-tight">
							Game by game
						</h2>
						<div className="mt-2">
							<Bars rows={byGame(flags)} caption={`Flags by game for ${who}`} nameHead="Game" />
						</div>
					</section>

					<section className="mt-10" aria-labelledby="log-h">
						<h2 id="log-h" className="m-0 font-serif text-2xl font-bold tracking-tight">
							Every flag
						</h2>
						<div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter the flags">
							<Chip on={filter.down == null} onClick={() => set({ down: null })}>
								Any down
							</Chip>
							{[1, 2, 3, 4, 0].map((d) => (
								<Chip key={d} on={filter.down === d} onClick={() => set({ down: filter.down === d ? null : d })}>
									{d === 0 ? "Kicks" : downName(d)}
								</Chip>
							))}
							<span aria-hidden="true" className="mx-1 h-5 w-px bg-lab-line-strong" />
							<Chip on={filter.costlyOnly} onClick={() => set({ costlyOnly: !filter.costlyOnly })}>
								Costly only
							</Chip>
							<span aria-hidden="true" className="mx-1 h-5 w-px bg-lab-line-strong" />
							<Chip on={sort === "new"} onClick={() => setSort("new")}>
								Newest
							</Chip>
							<Chip on={sort === "cost"} onClick={() => setSort("cost")}>
								Costliest
							</Chip>
						</div>
						<p className="m-0 mt-3 text-xs text-lab-muted" aria-live="polite">
							{log.length} of {flags.length} flags
						</p>
						{log.length ? (
							<ul className="m-0 mt-3 grid list-none gap-3 p-0 md:grid-cols-2">
								{log.slice(0, shown).map((f) => (
									<FlagCard key={f.id} f={f} players={players} showWho={isTeam} per={per} />
								))}
							</ul>
						) : (
							<p className="m-0 mt-3 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">No flags match. Clear a filter.</p>
						)}
						{log.length > shown ? (
							<button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-4 rounded-full border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-ink hover:border-lab-ink">
								Show {Math.min(PAGE, log.length - shown)} more
							</button>
						) : null}
					</section>
				</>
			)}
		</div>
	)
}

function ordinal(n: number): string {
	const v = n % 100
	const s = ["th", "st", "nd", "rd"]
	return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
