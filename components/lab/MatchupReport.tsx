import Link from "@/components/SiteLink"
import { getUnits } from "@/lib/lab/data"
import { namesFor } from "@/lib/lab/units"
import {
	GROUPS,
	GROUP_ORDER,
	STYLE,
	STYLE_ORDER,
	type GroupKey,
	type MatchupRow,
	type UnitTeam,
	coachTape,
	edgeSentence,
	formatStyle,
	groupsOfPair,
	isGameStatus,
	leaderLine,
	matchupPath,
	matchupRows,
	missingStarters,
	ordinal,
	paperEdge,
	percentile,
	reportNote,
	sampleNote,
	statLines,
	styleTrait,
	tally,
	teamCount,
	tierLabel,
	topEdges,
	watchPlayers,
} from "@/lib/lab/unitsKit"
import { type PairTheme } from "@/lib/lab/unitsTheme"
import { EdgeBadge, PairRail, RankPill, TeamTag } from "./UnitBits"

type Props = {
	a: string
	b: string
	theme: PairTheme
	/** The week being previewed, for the injury report's freshness. */
	week?: number | null
	/** Leave out the coaching, style and injury sections and link to the full report instead. */
	compact?: boolean
}

function Summary({ rows, a, b, names, theme }: { rows: MatchupRow[]; a: string; b: string; names: Record<string, string>; theme: PairTheme }) {
	const ta = tally(rows, a)
	const tb = tally(rows, b)
	const edge = paperEdge(rows, a)
	const lead = Math.abs(edge) < 6 ? null : edge > 0 ? a : b
	return (
		<div className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5">
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
				{[a, b].map((x, i) => (
					<div key={x} className={i === 0 ? "order-1" : "order-3"}>
						<p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-lab-muted">
							<TeamTag color={theme.color[x]} name={names[x]} />
						</p>
						<p className="m-0 mt-1 font-serif text-3xl font-bold tabular-nums">{x === a ? ta.edges : tb.edges}</p>
						<p className="m-0 text-xs text-lab-muted">pairings with the edge</p>
					</div>
				))}
				<div className="order-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">of {rows.length}</div>
			</div>
			<p className="m-0 mt-4 border-t border-lab-line pt-3 text-center text-sm text-lab-soft">
				{lead ? (
					<>
						On paper, the <span className="font-semibold text-lab-ink">{names[lead]}</span> hold the edge across the position groups.
					</>
				) : (
					<>On paper, the position groups cancel out. This one comes down to the details below.</>
				)}
			</p>
		</div>
	)
}

function Callouts({ rows, a, b, names, theme }: { rows: MatchupRow[]; a: string; b: string; names: Record<string, string>; theme: PairTheme }) {
	const items = [...topEdges(rows, a, 2).map((r) => ({ team: a, r })), ...topEdges(rows, b, 2).map((r) => ({ team: b, r }))].sort((x, y) => Math.abs(y.r.edge) - Math.abs(x.r.edge))
	if (!items.length) return <p className="m-0 text-sm text-lab-muted">No lopsided pairings: both teams look close to even at every position group.</p>
	return (
		<ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
			{items.map(({ team, r }) => (
				<li key={`${team}-${r.attacker}-${r.pair.id}`} className="rounded-xl border border-lab-line bg-lab-tint p-4" style={{ borderLeft: `4px solid ${theme.color[team]}` }}>
					<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{tierLabel(r, names)}</p>
					<h3 className="m-0 mt-1 font-serif text-base font-bold leading-snug">{edgeSentence(r, team, names)}</h3>
				</li>
			))}
		</ul>
	)
}

function StarterNote({ team, groups, name, week }: { team: UnitTeam; groups: GroupKey[]; name: string; week: number | null }) {
	const out = missingStarters(team, groups)
	if (!out.length) return null
	// A report from before the game's week may be out of date, so it says which week it is from.
	const old = week !== null && team.injuries.week !== null && team.injuries.week < week
	return (
		<p className="m-0 mt-1 text-xs leading-relaxed text-lab-soft">
			<span className="font-semibold text-lab-ink">{name} {old ? `(Week ${team.injuries.week} report, latest out)` : "report"}:</span> {out.map((p) => `${p.name} (${p.pos}, ${p.status.toLowerCase()}${p.injury ? `, ${p.injury.toLowerCase()}` : ""})`).join("; ")}
		</p>
	)
}

function PairCard({ row, data, names, theme, week }: { row: MatchupRow; data: ReturnType<typeof getUnits>; names: Record<string, string>; theme: PairTheme; week: number | null }) {
	const atk = data.teams[row.attacker]
	const def = data.teams[row.defender]
	const winner = row.tier === "even" ? null : row.edge > 0 ? row.attacker : row.defender
	const offLines = statLines(atk, row.pair.off)
	const defLines = statLines(def, row.pair.def)
	const offPlayers = watchPlayers(atk, row.pair.off)
	const defPlayers = watchPlayers(def, row.pair.def)
	return (
		<li className="rounded-xl border border-lab-line p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h4 className="m-0 font-serif text-lg font-bold leading-snug">{row.pair.label}</h4>
				<EdgeBadge label={tierLabel(row, names)} tier={row.tier} color={winner ? theme.color[winner] : null} ink={winner ? theme.on[winner] : null} />
			</div>
			<div className="mt-3">
				<PairRail
					attack={row.attack}
					defend={row.defend}
					attackColor={theme.color[row.attacker]}
					defendColor={theme.color[row.defender]}
					attackName={names[row.attacker]}
					defendName={names[row.defender]}
				/>
			</div>
			<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">
				The {names[row.attacker]} {row.pair.offName} ranks <span className="font-semibold text-lab-ink">{ordinal(row.attack.rank)}</span>. The {names[row.defender]} {row.pair.defName} ranks{" "}
				<span className="font-semibold text-lab-ink">{ordinal(row.defend.rank)}</span>.
			</p>
			<StarterNote team={atk} groups={groupsOfPair(row.pair, "off")} name={names[row.attacker]} week={week} />
			<StarterNote team={def} groups={groupsOfPair(row.pair, "def")} name={names[row.defender]} week={week} />
			<details className="group mt-3">
				<summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted hover:text-lab-ink">The numbers and the players</summary>
				<div className="mt-3 grid gap-5 sm:grid-cols-2">
					{[
						{ team: row.attacker, shape: "dot" as const, lines: offLines, players: offPlayers, unit: row.pair.offName },
						{ team: row.defender, shape: "diamond" as const, lines: defLines, players: defPlayers, unit: row.pair.defName },
					].map((side) => (
						<div key={side.team}>
							<p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
								<TeamTag color={theme.color[side.team]} name={`${names[side.team]} ${side.unit}`} shape={side.shape} />
							</p>
							<ul className="m-0 mt-2 list-none divide-y divide-lab-line p-0 text-sm">
								{side.lines.map((l) => (
									<li key={`${l.group}-${l.key}`} className="flex items-baseline justify-between gap-3 py-1.5">
										<span className="text-lab-soft">{l.label}</span>
										<span className="whitespace-nowrap font-mono text-xs tabular-nums">
											<span className="font-semibold">{l.value}</span> <span className="text-lab-muted">({ordinal(l.rank)})</span>
										</span>
									</li>
								))}
							</ul>
							{side.players.length ? (
								<ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-xs text-lab-soft">
									{side.players.map((p) => (
										<li key={`${p.group}-${p.name}`}>
											<span className="font-semibold text-lab-ink">{p.name}</span> {p.pos ? <span className="text-lab-muted">({p.pos})</span> : null} {leaderLine(p)}
										</li>
									))}
								</ul>
							) : null}
						</div>
					))}
				</div>
			</details>
		</li>
	)
}

function PairColumns({ rows, data, a, b, names, theme, week }: { rows: MatchupRow[]; data: ReturnType<typeof getUnits>; a: string; b: string; names: Record<string, string>; theme: PairTheme; week: number | null }) {
	return (
		<div className="grid gap-8 lg:grid-cols-2">
			{[a, b].map((team) => (
				<div key={team}>
					<h3 className="m-0 mb-3 font-serif text-xl font-bold">
						{names[team]} offense vs {names[team === a ? b : a]} defense
					</h3>
					<ul className="m-0 list-none space-y-3 p-0">
						{rows
							.filter((r) => r.attacker === team)
							.map((r) => (
								<PairCard key={`${r.attacker}-${r.pair.id}`} row={r} data={data} names={names} theme={theme} week={week} />
							))}
					</ul>
				</div>
			))}
		</div>
	)
}

function Tape({ a, b, data, names, theme }: { a: string; b: string; data: ReturnType<typeof getUnits>; names: Record<string, string>; theme: PairTheme }) {
	const n = teamCount(data)
	const ta = data.teams[a]
	const tb = data.teams[b]
	return (
		<div className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5">
			<div className="mb-3 grid grid-cols-[1fr_8rem_1fr] items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted sm:grid-cols-[1fr_11rem_1fr]">
				<span className="text-right">
					<TeamTag color={theme.color[a]} name={names[a]} />
				</span>
				<span />
				<span>
					<TeamTag color={theme.color[b]} name={names[b]} />
				</span>
			</div>
			<ul className="m-0 list-none space-y-2.5 p-0">
				{GROUP_ORDER.map((g) => {
					const ga = ta.groups[g]
					const gb = tb.groups[g]
					const pa = percentile(ga.rank, n)
					const pb = percentile(gb.rank, n)
					return (
						<li key={g} className="grid grid-cols-[1fr_8rem_1fr] items-center gap-2 sm:grid-cols-[1fr_11rem_1fr]">
							<div className="flex items-center justify-end gap-2" role="img" aria-label={`${names[a]} ${GROUPS[g].label} ranks ${ordinal(ga.rank)}`}>
								<span className="font-mono text-xs font-semibold tabular-nums">{ordinal(ga.rank)}</span>
								<div className="h-3 flex-1 overflow-hidden rounded-l-full bg-lab-tint">
									<div className="ml-auto h-full rounded-l-full" style={{ width: `${Math.max(4, pa)}%`, background: theme.color[a] }} />
								</div>
							</div>
							<div className="text-center text-xs font-semibold leading-tight">
								{GROUPS[g].label}
								<span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-lab-muted">{GROUPS[g].side === "off" ? "Offense" : "Defense"}</span>
							</div>
							<div className="flex items-center gap-2" role="img" aria-label={`${names[b]} ${GROUPS[g].label} ranks ${ordinal(gb.rank)}`}>
								<div className="h-3 flex-1 overflow-hidden rounded-r-full bg-lab-tint">
									<div className="h-full rounded-r-full" style={{ width: `${Math.max(4, pb)}%`, background: theme.color[b] }} />
								</div>
								<span className="font-mono text-xs font-semibold tabular-nums">{ordinal(gb.rank)}</span>
							</div>
						</li>
					)
				})}
			</ul>
			<p className="m-0 mt-3 text-xs text-lab-muted">Longer bar is better. Each unit is graded on the stats shown in the pairings above, ranked among all {n} teams.</p>
		</div>
	)
}

function Coaching({ a, b, data, names, theme }: { a: string; b: string; data: ReturnType<typeof getUnits>; names: Record<string, string>; theme: PairTheme }) {
	const tape = coachTape(a, b, data)
	if (!tape.length) return null
	const recent = data.teams[a].coach?.vs[b]?.recent ?? []
	return (
		<div className="overflow-hidden rounded-2xl border border-lab-line">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="bg-lab-tint text-left text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
						<th className="p-3 font-semibold">
							<span className="sr-only">Measure</span>
						</th>
						<th className="p-3 font-semibold">
							<TeamTag color={theme.color[a]} name={names[a]} />
						</th>
						<th className="p-3 font-semibold">
							<TeamTag color={theme.color[b]} name={names[b]} />
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-lab-line">
					{tape.map((r, i) => (
						<tr key={r.label} className={i === 0 ? "font-semibold" : ""}>
							<th scope="row" className="p-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-lab-muted">
								{r.label}
							</th>
							<td className="p-3 tabular-nums">{r.a}</td>
							<td className="p-3 tabular-nums">{r.b}</td>
						</tr>
					))}
				</tbody>
			</table>
			{recent.length ? (
				<div className="border-t border-lab-line p-3 text-xs text-lab-soft">
					<span className="font-semibold uppercase tracking-[0.1em] text-lab-muted">Last meetings, newest first: </span>
					{recent.map((m) => `${names[a]} ${m.pf}-${m.pa} (${m.season} Wk ${m.week})`).join(" · ")}
				</div>
			) : null}
		</div>
	)
}

function StyleTable({ a, b, data, names, theme }: { a: string; b: string; data: ReturnType<typeof getUnits>; names: Record<string, string>; theme: PairTheme }) {
	const n = teamCount(data)
	const rows = (side: "off" | "def") =>
		STYLE_ORDER[side].map((key) => {
			const ma = data.teams[a].style[side][key]
			const mb = data.teams[b].style[side][key]
			return { key, ma, mb }
		})
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{(["off", "def"] as const).map((side) => (
				<div key={side} className="overflow-hidden rounded-2xl border border-lab-line">
					<div className="bg-lab-tint p-3 text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">{side === "off" ? "How the offenses like to play" : "How the defenses like to play"}</div>
					<ul className="m-0 list-none divide-y divide-lab-line p-0">
						{rows(side).map(({ key, ma, mb }) => (
							<li key={key} className="p-3">
								<p className="m-0 text-sm font-semibold">{STYLE[key].label}</p>
								<div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
									{[
										{ team: a, m: ma },
										{ team: b, m: mb },
									].map(({ team, m }) =>
										m ? (
											<p key={team} className="m-0 text-xs leading-relaxed text-lab-soft">
												<TeamTag color={theme.color[team]} name={names[team]} /> <span className="font-mono font-semibold tabular-nums text-lab-ink">{formatStyle(key, m.v)}</span>{" "}
												<span className="text-lab-muted">({ordinal(m.rank)} highest)</span>
												{styleTrait(key, m.rank, n) ? <span> &mdash; {styleTrait(key, m.rank, n)}</span> : null}
											</p>
										) : null,
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

function Injuries({ a, b, data, names, theme, week }: { a: string; b: string; data: ReturnType<typeof getUnits>; names: Record<string, string>; theme: PairTheme; week: number | null }) {
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{[a, b].map((team) => {
				const t = data.teams[team]
				const note = reportNote(t, week)
				const players = t.injuries.players
				return (
					<div key={team} className="rounded-2xl border border-lab-line p-4">
						<h3 className="m-0 font-serif text-lg font-bold">
							<TeamTag color={theme.color[team]} name={names[team]} />
						</h3>
						{note ? <p className="m-0 mt-1 text-xs text-lab-muted">{note}</p> : null}
						{players.length ? (
							<ul className="m-0 mt-3 list-none divide-y divide-lab-line p-0 text-sm">
								{players.map((p) => (
									<li key={`${p.name}-${p.status}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
										<span>
											<span className="font-semibold">{p.name}</span> <span className="text-lab-muted">{p.pos}</span>
											{p.starter ? <span className="ml-2 rounded-full bg-lab-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-lab-soft">Starter</span> : null}
										</span>
										<span className={`text-xs ${isGameStatus(p.status) ? "font-semibold text-lab-ink" : "text-lab-muted"}`}>
											{p.status === "DNP" ? "Did not practice" : p.status === "Limited" ? "Limited in practice" : p.status}
											{p.injury ? ` · ${p.injury.toLowerCase()}` : ""}
											<span className="text-lab-muted"> · {GROUPS[p.group].label.toLowerCase()}</span>
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="m-0 mt-3 text-sm text-lab-soft">{t.injuries.week ? "Nobody at a tracked position is on the report." : "No report yet."}</p>
						)}
					</div>
				)
			})}
		</div>
	)
}

function Head({ children, id, sub }: { children: React.ReactNode; id: string; sub?: string }) {
	return (
		<div className="mb-4">
			<h2 id={id} className="m-0 scroll-mt-6 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
				{children}
			</h2>
			{sub ? <p className="m-0 mt-1 max-w-2xl text-sm leading-relaxed text-lab-muted">{sub}</p> : null}
		</div>
	)
}

export default function MatchupReport({ a, b, theme, week = null, compact = false }: Props) {
	const data = getUnits()
	const ta = data.teams[a]
	const tb = data.teams[b]
	if (!ta || !tb) return null
	const names = namesFor(a, b)
	const rows = matchupRows(data, a, b)
	const g = Math.min(ta.g, tb.g)

	return (
		<div className="space-y-12">
			<section aria-labelledby="paper-heading">
				<Head id="paper-heading" sub={`${sampleNote(g)} Ranks are out of ${teamCount(data)} teams and 1st is always best, on offense and defense alike.`}>
					On paper
				</Head>
				<div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
					<Summary rows={rows} a={a} b={b} names={names} theme={theme} />
					<Callouts rows={rows} a={a} b={b} names={names} theme={theme} />
				</div>
			</section>

			{compact ? null : (
				<section aria-labelledby="pairs-heading">
					<Head id="pairs-heading" sub="Each offense against the other team's defense, one position group at a time. Circle: the offense. Diamond: the defense. Whoever sits further right wins that pairing.">
						Position group by position group
					</Head>
					<PairColumns rows={rows} data={data} a={a} b={b} names={names} theme={theme} week={week} />
				</section>
			)}

			<section aria-labelledby="tape-heading">
				<Head id="tape-heading" sub="Every unit on its own, side by side.">
					Tale of the tape
				</Head>
				<Tape a={a} b={b} data={data} names={names} theme={theme} />
			</section>

			{compact ? (
				<p className="m-0 text-sm">
					<Link href={matchupPath(a, b)} className="font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						All eight pairings, the coaches and who is missing &rarr;
					</Link>
				</p>
			) : (
				<>
					<section aria-labelledby="coach-heading">
						<Head id="coach-heading" sub="Records are regular-season games since 1999, against the spread as listed by the games file. A new coach has no history here yet.">
							The coaches
						</Head>
						<Coaching a={a} b={b} data={data} names={names} theme={theme} />
					</section>

					<section aria-labelledby="style-heading">
						<Head id="style-heading" sub="Not good or bad, just the style. Ranks go from the highest rate down, so a 1st means the most of it in the league.">
							How each team plays
						</Head>
						<StyleTable a={a} b={b} data={data} names={names} theme={theme} />
					</section>

					<section aria-labelledby="injury-heading">
						<Head id="injury-heading" sub="The latest injury report for each team, sorted by position group. A starter averaged more than half the team's snaps in the games he played.">
							Who is missing
						</Head>
						<Injuries a={a} b={b} data={data} names={names} theme={theme} week={week} />
					</section>
				</>
			)}
		</div>
	)
}
