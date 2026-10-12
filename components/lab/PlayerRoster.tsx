import {
	GROUP_LABEL,
	GROUP_ORDER,
	type PlayerGroup,
	type PlayerRow,
	type PlayersData,
	formName,
	formWeeks,
	formatStat,
	gradeWord,
	level,
	moveText,
	ordinal,
	players,
	roleMove,
	snapText,
	statInfo,
	HEADLINE,
} from "@/lib/lab/playersKit"

const UP = "text-emerald-700 dark:text-emerald-400"
const DOWN = "text-rose-700 dark:text-rose-400"

function Delta({ v }: { v: number | undefined }) {
	if (v === undefined) return <span className="text-lab-muted">&ndash;</span>
	if (Math.abs(v) < 1) return <span className="text-lab-muted">even</span>
	return (
		<span className={`font-mono font-bold tabular-nums ${v > 0 ? UP : DOWN}`}>
			<span aria-hidden="true">{v > 0 ? "▲" : "▼"} </span>
			{moveText(v)}
		</span>
	)
}

function cell(group: PlayerGroup, key: string, s: PlayerRow["stats"][number]["season"]) {
	if (!s) return <span className="text-lab-muted">&ndash;</span>
	return (
		<span className={s.pct === null ? "text-lab-muted" : ""} title={s.pct === null ? "Too few plays to grade yet" : `${ordinal(Math.round(s.pct))} percentile`}>
			{formatStat(group, key, s.v)}
		</span>
	)
}

/** Every graded stat for one player, with season, recent and earlier side by side. */
function StatTable({ data, p }: { data: PlayersData; p: PlayerRow }) {
	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-lab-line">
			<table className="w-full border-collapse text-left text-xs sm:text-sm">
				<thead>
					<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted sm:text-[11px]">
						<th scope="col" className="px-3 py-2">Stat</th>
						<th scope="col" className="px-2 py-2 text-right">Season</th>
						<th scope="col" className="px-2 py-2 text-right">{formName(data, p.group)}</th>
						<th scope="col" className="px-2 py-2 text-right">Before</th>
						<th scope="col" className="px-3 py-2 text-right">Change</th>
					</tr>
				</thead>
				<tbody>
					{p.stats.map((s) => {
						const info = statInfo(p.group, s.k)
						if (!info) return null
						return (
							<tr key={s.k} className="border-t border-lab-line align-top">
								<th scope="row" className="px-3 py-2 font-normal">
									<span className="font-semibold text-lab-ink">{info.label}</span>
									{info.higher === false ? <span className="text-lab-muted"> (lower is better)</span> : null}
									{info.higher === null ? <span className="text-lab-muted"> (style, not a grade)</span> : null}
									<span className="mt-0.5 block text-[11px] leading-snug text-lab-muted">{info.what}</span>
								</th>
								<td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
									{cell(p.group, s.k, s.season)}
									{s.season?.pct !== null && s.season?.pct !== undefined && info.higher !== null ? <span className="block text-[10px] text-lab-muted">{ordinal(Math.round(s.season.pct))} pct</span> : null}
								</td>
								<td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">{cell(p.group, s.k, s.form)}</td>
								<td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">{cell(p.group, s.k, s.earlier)}</td>
								<td className="whitespace-nowrap px-3 py-2 text-right">{info.higher === null ? <span className="text-lab-muted">&ndash;</span> : <Delta v={s.delta} />}</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

function PlayerLine({ data, p }: { data: PlayersData; p: PlayerRow }) {
	const head = p.stats.find((s) => s.k === HEADLINE[p.group])
	const season = level(p, "season")
	const role = roleMove(p)
	return (
		<details className="group rounded-xl border border-lab-line bg-lab-surface px-4 py-3 open:bg-lab-page" data-testid="roster-player">
			<summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
				<span className="min-w-0">
					<span className="font-serif text-base font-bold">{p.name}</span>{" "}
					<span className="text-xs text-lab-muted">{p.pos}</span>
				</span>
				<span className="hidden text-xs text-lab-soft sm:block">
					{head?.season ? (
						<>
							{statInfo(p.group, head.k)?.label}: <span className="font-mono font-semibold text-lab-ink">{formatStat(p.group, head.k, head.season.v)}</span>
						</>
					) : (
						"Not enough plays to grade yet"
					)}
				</span>
				<span className="hidden text-xs text-lab-muted sm:block">
					{snapText(p.snaps.season)} of snaps{role ? <span className={role === "up" ? UP : DOWN}> {role === "up" ? "▲" : "▼"}</span> : null}
				</span>
				<span className="justify-self-end text-right">
					{p.mover ? <span className={`font-mono text-sm font-bold tabular-nums ${p.mover.score >= 0 ? UP : DOWN}`}>{p.mover.score >= 0 ? "▲" : "▼"} {moveText(p.mover.score)}</span> : <span className="text-xs text-lab-muted">No trend yet</span>}
					<span className="block text-[10px] text-lab-muted">{season === null ? "" : `grade ${Math.round(season)}, ${gradeWord(season)}`}</span>
				</span>
			</summary>
			<div className="mt-2">
				<p className="m-0 text-xs leading-relaxed text-lab-muted">
					{p.games} {p.games === 1 ? "game" : "games"} with data. {snapText(p.snaps.season)} of the team&apos;s snaps this season: {snapText(p.snaps.earlier)} before, {snapText(p.snaps.form)} in {formWeeks(data, p.group).toLowerCase()}.
				</p>
				<StatTable data={data} p={p} />
			</div>
		</details>
	)
}

/** Every Raiders player the data covers, grouped by position, each one opening into all his stats. */
export default function PlayerRoster({ data }: { data: PlayersData }) {
	return (
		<div className="grid gap-10">
			{GROUP_ORDER.map((g) => {
				const list = players(data, g)
				if (!list.length) return null
				const n = data.leagueN[g]
				return (
					<section key={g} aria-labelledby={`roster-${g}`}>
						<h3 id={`roster-${g}`} className="m-0 font-serif text-xl font-bold">{GROUP_LABEL[g].title}</h3>
						<p className="m-0 mt-1 text-xs text-lab-muted">
							Graded against {n ? `${n} ` : ""}{GROUP_LABEL[g].peers} around the league with enough plays.
						</p>
						<div className="mt-3 grid gap-2">
							{list
								.slice()
								.sort((a, b) => (b.snaps.season ?? 0) - (a.snaps.season ?? 0) || a.name.localeCompare(b.name))
								.map((p) => (
									<PlayerLine key={p.id} data={data} p={p} />
								))}
						</div>
					</section>
				)
			})}
		</div>
	)
}
