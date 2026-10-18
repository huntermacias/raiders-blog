import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import FlagShare from "@/components/lab/flags/FlagShare"
import FlagsMethod from "@/components/lab/flags/FlagsMethod"
import QueryControls from "@/components/lab/flags/QueryControls"
import { MatrixTable, MixTable } from "@/components/lab/flags/SituationTables"
import MoreFromLab from "@/components/lab/MoreFromLab"
import TrackView from "@/components/lab/players/TrackView"
import { flagSeason, flagsStamp, getFlagFiles } from "@/lib/lab/flagsData"
import { COMPARE_PATH, FLAGS_PATH, SITUATIONS_PATH, teamFlagsHref } from "@/lib/lab/flagsKit"
import { DIMENSIONS, baselineOf, dimension, isDim, situationMix, standout, typeMatrix } from "@/lib/lab/flagsSituations"
import { one } from "@/lib/lab/flagsShare"
import { teamName } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
import { TEAMS } from "@/lib/nfl"

// Which spots flags come in: by the score, the quarter, the down, the distance, the field, the clock, home and away, and the unit. The whole league, or one
// team read against the league. The choice lives in the address, so every view is a link; the page is built for the request.

const SITE_URL = "https://www.raidersrundown.com"

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const files = getFlagFiles()
	const wanted = Number(one(sp.season))
	const file = flagSeason(wanted) ?? files[0]
	const dimId = one(sp.dim)
	const dim = dimension(isDim(dimId) ? dimId : "score")!
	const team = TEAMS.find((t) => t.abbr === one(sp.team))?.abbr ?? ""
	return { file, files, dim, team, spot: one(sp.spot) }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const { dim, team } = await resolve(props)
	const who = team ? `${teamName(team)} penalties` : "NFL penalties"
	const title = `${who} by ${dim.label.toLowerCase()}: when the flags come | Raiders Rundown`
	const description = "Every accepted penalty by the score, the quarter, the down and distance, the spot on the field and the clock: when flags come, what they cost and which ones, for the league or one team."
	return { title, description, robots: { index: !team && dim.id === "score", follow: true }, alternates: { canonical: `${SITE_URL}${SITUATIONS_PATH}` }, openGraph: { type: "website", title, description, url: `${SITE_URL}${SITUATIONS_PATH}`, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function SituationsPage(props: Props) {
	const { file, files, dim, team, spot } = await resolve(props)
	const stamp = flagsStamp()
	if (!file) return null
	const base = baselineOf(file.flags)
	const group = team ? file.flags.filter((f) => f.t === team) : file.flags
	const rows = situationMix(group, dim, team ? base : null)
	const mix = team ? standout(rows) : null
	const matrix = typeMatrix(group, dim, 8)
	const lead = [...rows].filter((r) => r.flags >= 5).sort((a, b) => b.avg - a.avg)[0]
	// Who does it most in the chosen spot: every team's flags there. Defaults to the spot that costs the most each.
	const leaguePick = [...situationMix(file.flags, dim, null)].filter((r) => r.flags >= 20).sort((a, b) => b.avg - a.avg)[0]
	const bucket = dim.buckets.find((b) => b.id === spot) ?? dim.buckets.find((b) => b.id === leaguePick?.id) ?? dim.buckets[0]
	const inSpot = file.flags.filter((f) => dim.of(f) === bucket.id)
	const perTeam = TEAMS.map((t) => {
		const mine = inSpot.filter((f) => f.t === t.abbr)
		const cost = mine.reduce((s, f) => s + f.c, 0)
		return { abbr: t.abbr, flags: mine.length, cost, costly: mine.filter((f) => f.tg.length).length }
	})
		.filter((r) => r.flags)
		.sort((a, b) => b.cost - a.cost || b.flags - a.flags)
		.slice(0, 10)
	const q = (extra: Record<string, string>) => {
		const p = new URLSearchParams({ ...(team ? { team } : {}), ...(file.season !== files[0]?.season ? { season: String(file.season) } : {}), ...extra })
		const s = p.toString()
		return `${SITUATIONS_PATH}${s ? `?${s}` : ""}`
	}
	const subject = team ? `The ${teamName(team)}` : "The league"
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href={FLAGS_PATH} className="hover:text-lab-ink">
							Flags
						</Link>{" "}
						&rsaquo; <span className="text-lab-soft">By situation</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">When the flags come</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						What the score was, the down, the spot on the field and the clock when each penalty was called, which penalties come in which spot and what each one cost. Read the whole league, or pick a team to see where it stands out.
					</p>
					<TrackView event="flags_situations_view" props={{ dim: dim.id, team: team || "league" }} />
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label="Flags by situation">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<QueryControls
						path={SITUATIONS_PATH}
						keep={{ dim: dim.id === "score" ? "" : dim.id }}
						fields={[
							{ name: "team", label: "Team", value: team, options: [{ value: "", label: "Whole league" }, ...TEAMS.map((t) => ({ value: t.abbr, label: t.name })).sort((a, b) => a.label.localeCompare(b.label))] },
							...(files.length > 1 ? [{ name: "season", label: "Season", value: String(file.season), options: files.map((f) => ({ value: String(f.season), label: String(f.season) })) }] : []),
						]}
					/>
					<FlagShare
						view={{ kind: "situation", dim: dim.id, ...(team ? { team } : {}), season: file.season }}
						name="Flags by situation"
						file={`flags-${dim.id}${team ? `-${team.toLowerCase()}` : ""}`}
						stamp={stamp}
						text={`${dim.question} ${subject} penalties, ${file.season}:`}
						alt={`${dim.question} ${subject} penalties by ${dim.label.toLowerCase()}`}
					/>
				</div>
				<nav aria-label="What to split the flags by" className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
					{DIMENSIONS.map((d) => (
						<Link key={d.id} href={q({ dim: d.id })} aria-current={d.id === dim.id ? "true" : undefined} className={`min-h-11 shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold ${d.id === dim.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}>
							{d.label}
						</Link>
					))}
				</nav>

				<h2 className="mt-8 font-serif text-2xl font-bold tracking-tight">{dim.question}</h2>
				<p className="m-0 mt-1 text-sm text-lab-soft">
					{subject}, {file.season} through week {file.week}: {group.length} accepted penalties.
					{lead ? ` The costliest spot is ${lead.label.toLowerCase()}, at ${lead.avg.toFixed(1)} points a flag.` : ""}
					{mix && mix.index ? ` ${teamName(team)} flags come ${mix.index.toFixed(1)}x as often as the league's when ${mix.label.toLowerCase()}.` : ""}
				</p>
				<div className="mt-4">
					<MixTable rows={rows} caption={`${subject} flags by ${dim.label.toLowerCase()}`} showIndex={!!team} />
				</div>

				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">Which penalties, in which spot</h2>
				<p className="m-0 mt-1 text-sm text-lab-soft">The {matrix.types.length} most common penalties against {dim.label.toLowerCase()}. The bold number is where each one comes most.</p>
				<div className="mt-4">
					<MatrixTable m={matrix} caption={`Penalties by ${dim.label.toLowerCase()}`} />
				</div>

				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">Who loses the most: {bucket.label.toLowerCase()}</h2>
				<nav aria-label="Pick a spot" className="mt-3 flex flex-wrap gap-1.5">
					{dim.buckets.map((b) => (
						<Link key={b.id} href={q({ dim: dim.id === "score" ? "" : dim.id, spot: b.id })} aria-current={b.id === bucket.id ? "true" : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${b.id === bucket.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}>
							{b.label}
						</Link>
					))}
				</nav>
				<div role="region" aria-label={`Teams by points lost, ${bucket.label.toLowerCase()}`} tabIndex={0} className="mt-4 overflow-x-auto [contain:paint]">
					<table className="w-full border-collapse text-sm">
						<caption className="sr-only">Teams by points lost to flags {bucket.label.toLowerCase()}</caption>
						<thead>
							<tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
								<th scope="col" className="w-8 py-1.5 pr-1">
									#
								</th>
								<th scope="col" className="py-1.5 pr-2">
									Team
								</th>
								<th scope="col" className="px-2 py-1.5 text-right">
									Flags
								</th>
								<th scope="col" className="px-2 py-1.5 text-right">
									Costly
								</th>
								<th scope="col" className="py-1.5 pl-2 text-right">
									Points lost
								</th>
							</tr>
						</thead>
						<tbody>
							{perTeam.map((r, i) => (
								<tr key={r.abbr} className="border-t border-lab-line">
									<td className="py-2 pr-1 font-mono text-xs text-lab-muted">{i + 1}</td>
									<th scope="row" className="py-2 pr-2 text-left font-semibold">
										<Link href={q({ team: r.abbr, dim: dim.id === "score" ? "" : dim.id })} className="text-lab-ink underline-offset-4 hover:underline">
											{teamName(r.abbr)}
										</Link>
									</th>
									<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
									<td className="px-2 py-2 text-right font-mono tabular-nums">{r.costly}</td>
									<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
					{team ? (
						<Link href={teamFlagsHref(team)} className="text-lab-ink underline underline-offset-4">
							Every {teamName(team)} flag
						</Link>
					) : null}
					<Link href={team ? `${COMPARE_PATH}?a=${team}` : COMPARE_PATH} className="text-lab-ink underline underline-offset-4">
						Compare two teams
					</Link>
				</p>
				<FlagsMethod per={file.turnoverCost} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container py-8">
					<Credit>Rosters also from nflverse. </Credit>
				</div>
			</section>
			<MoreFromLab current={FLAGS_PATH} weeks={labWeeks()} />
		</div>
	)
}
