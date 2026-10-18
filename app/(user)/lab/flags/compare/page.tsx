import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import FlagShare from "@/components/lab/flags/FlagShare"
import FlagsMethod from "@/components/lab/flags/FlagsMethod"
import QueryControls from "@/components/lab/flags/QueryControls"
import MoreFromLab from "@/components/lab/MoreFromLab"
import { TeamLogo } from "@/components/lab/players/Media"
import TrackView from "@/components/lab/players/TrackView"
import { flagSeason, flagsStamp, getFlagFiles } from "@/lib/lab/flagsData"
import { COMPARE_PATH, FLAGS_PATH, penaltyHref, teamFlagsHref } from "@/lib/lab/flagsKit"
import { type DimId, type TeamProfile, compareEdges, dimension, teamProfiles } from "@/lib/lab/flagsSituations"
import { one } from "@/lib/lab/flagsShare"
import { teamName } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
import { TEAMS } from "@/lib/nfl"

// Two teams side by side: flags, yards and points lost a game, then by score, down, field position and the clock, and the penalties each one commits.
// Built for the request, because the two teams are in the address.

const SITE_URL = "https://www.raidersrundown.com"
const BAD = "text-rose-700 dark:text-rose-400"
const ABBRS = TEAMS.map((t) => t.abbr)
const SECTIONS: DimId[] = ["down", "score", "field", "clock", "quarter"]

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const files = getFlagFiles()
	const file = flagSeason(Number(one(sp.season))) ?? files[0]
	const teamOf = (v: string | undefined) => ABBRS.find((x) => x === v)
	if (!file) return null
	const profiles = teamProfiles(file.flags, ABBRS, file.games)
	const a = teamOf(one(sp.a)) ?? "LV"
	// With no second team chosen, the team whose flags cost the most a game (not the first one chosen).
	const worst = Object.values(profiles)
		.sort((x, y) => x.rank.cost - y.rank.cost)
		.map((p) => p.team)
		.find((t) => t !== a)
	const b = teamOf(one(sp.b)) !== a ? teamOf(one(sp.b)) ?? worst ?? "KC" : worst ?? "KC"
	return { files, file, profiles, a, b }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const r = await resolve(props)
	const title = r ? `${teamName(r.a)} vs ${teamName(r.b)} penalties: who flags more and what it costs | Raiders Rundown` : "Compare NFL team penalties | Raiders Rundown"
	const description = "Two teams' penalties side by side: flags, yards and points lost a game, and how they differ by the score, the down, the field and the clock."
	return { title, description, robots: { index: false, follow: true }, alternates: { canonical: `${SITE_URL}${COMPARE_PATH}` }, openGraph: { type: "website", title, description, url: `${SITE_URL}${COMPARE_PATH}`, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] } }
}

const nth = (n: number): string => {
	const v = n % 100
	const s = ["th", "st", "nd", "rd"]
	return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const perGame = (n: number, games: number): string => (games ? (n / games).toFixed(2) : "n/a")

function Side({ p }: { p: TeamProfile }) {
	return (
		<div className="min-w-0">
			<Link href={teamFlagsHref(p.team)} className="inline-flex items-center gap-2 text-lab-ink hover:underline">
				<TeamLogo team={p.team} size={32} />
				<span className="font-serif text-xl font-bold sm:text-2xl">{teamName(p.team)}</span>
			</Link>
			<p className="m-0 mt-1 text-xs text-lab-muted">
				{p.rank.cost ? `${p.rank.cost === 1 ? "Costliest" : `${nth(p.rank.cost)} costliest`} flags of ${p.rank.of} teams` : ""}
			</p>
		</div>
	)
}

export default async function ComparePage(props: Props) {
	const r = await resolve(props)
	if (!r) return null
	const { file, files, profiles, a, b } = r
	const pa = profiles[a]
	const pb = profiles[b]
	const edges = compareEdges(pa, pb, 5)
	const stamp = flagsStamp()
	const rows: [string, string, string, "a" | "b" | null][] = [
		["Games", String(pa.games), String(pb.games), null],
		["Flags a game", pa.perGame.flags.toFixed(2), pb.perGame.flags.toFixed(2), pa.perGame.flags > pb.perGame.flags ? "a" : pa.perGame.flags < pb.perGame.flags ? "b" : null],
		["Yards a game", pa.perGame.yards.toFixed(1), pb.perGame.yards.toFixed(1), pa.perGame.yards > pb.perGame.yards ? "a" : pa.perGame.yards < pb.perGame.yards ? "b" : null],
		["Points lost a game", pa.perGame.cost.toFixed(2), pb.perGame.cost.toFixed(2), pa.perGame.cost > pb.perGame.cost ? "a" : pa.perGame.cost < pb.perGame.cost ? "b" : null],
		["Points lost, season", pa.cost.toFixed(1), pb.cost.toFixed(1), null],
		["Costly flags", String(pa.costly), String(pb.costly), null],
		["Free first downs on 4th down", String(pa.gifts), String(pb.gifts), null],
		["On a named player", String(pa.players), String(pb.players), null],
		["Team and coaches", String(pa.coaches), String(pb.coaches), null],
	]
	// The penalties either team commits most, side by side.
	const typeNames = Array.from(new Set([...pa.types.slice(0, 6), ...pb.types.slice(0, 6)].map((t) => t.type)))
		.map((t) => ({ t, a: pa.types.find((x) => x.type === t)?.flags ?? 0, b: pb.types.find((x) => x.type === t)?.flags ?? 0 }))
		.sort((x, y) => y.a + y.b - (x.a + x.b))
		.slice(0, 8)
	const swap = `${COMPARE_PATH}?a=${b}&b=${a}${file.season !== files[0]?.season ? `&season=${file.season}` : ""}`
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href={FLAGS_PATH} className="hover:text-lab-ink">
							Flags
						</Link>{" "}
						&rsaquo; <span className="text-lab-soft">Compare teams</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Whose flags cost more?</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">Two teams side by side: how many penalties each commits a game, what they cost, and how that changes with the score, the down, the spot on the field and the clock.</p>
					<TrackView event="flags_compare_view" props={{ a, b }} />
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label="Compare two teams">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<QueryControls
						path={COMPARE_PATH}
						fields={[
							{ name: "a", label: "Team", value: a, options: TEAMS.map((t) => ({ value: t.abbr, label: t.name })).sort((x, y) => x.label.localeCompare(y.label)) },
							{ name: "b", label: "Against", value: b, options: TEAMS.map((t) => ({ value: t.abbr, label: t.name })).sort((x, y) => x.label.localeCompare(y.label)) },
							...(files.length > 1 ? [{ name: "season", label: "Season", value: String(file.season), options: files.map((f) => ({ value: String(f.season), label: String(f.season) })) }] : []),
						]}
					/>
					<div className="flex items-center gap-3">
						<Link href={swap} className="text-sm font-semibold text-lab-soft underline underline-offset-4 hover:text-lab-ink">
							Swap sides
						</Link>
						<FlagShare view={{ kind: "compare", a, b, season: file.season }} name="Team penalties compared" file={`flags-${a.toLowerCase()}-vs-${b.toLowerCase()}`} stamp={stamp} text={`${teamName(a)} vs ${teamName(b)}: whose penalties cost more, ${file.season}:`} alt={`${teamName(a)} and ${teamName(b)} penalties side by side`} />
					</div>
				</div>

				<div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
					<Side p={pa} />
					<span className="pt-2 font-serif text-lg font-bold text-lab-muted">vs</span>
					<div className="flex justify-end text-right">
						<Side p={pb} />
					</div>
				</div>

				<div role="region" aria-label="Penalties, side by side" tabIndex={0} className="mt-4 overflow-x-auto [contain:paint]">
					<table className="w-full border-collapse text-sm">
						<caption className="sr-only">
							{teamName(a)} and {teamName(b)} penalties, {file.season}
						</caption>
						<thead>
							<tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
								<th scope="col" className="w-1/3 py-1.5 pr-2 text-right">
									{a}
								</th>
								<th scope="col" className="w-1/3 py-1.5 text-center font-semibold">
									{file.season}
								</th>
								<th scope="col" className="w-1/3 py-1.5 pl-2 text-left">
									{b}
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map(([k, x, y, worse]) => (
								<tr key={k} className="border-t border-lab-line">
									<td className={`py-2 pr-2 text-right font-mono text-base tabular-nums ${worse === "a" ? `font-bold ${BAD}` : ""}`}>{x}</td>
									<th scope="row" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-lab-muted">
										{k}
									</th>
									<td className={`py-2 pl-2 text-left font-mono text-base tabular-nums ${worse === "b" ? `font-bold ${BAD}` : ""}`}>{y}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="m-0 mt-2 text-xs text-lab-muted">The worse number in each row is red. A game is any game the team played.</p>

				{edges.length ? (
					<>
						<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">Where they differ most</h2>
						<ul className="m-0 mt-3 list-none space-y-2 p-0">
							{edges.map((e) => (
								<li key={e.key} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-snug text-lab-ink">
									{e.text}
								</li>
							))}
						</ul>
					</>
				) : null}

				{SECTIONS.map((id) => {
					const d = dimension(id)!
					return (
						<div key={id} className="mt-10">
							<h2 className="font-serif text-2xl font-bold tracking-tight">By {d.label.toLowerCase()}</h2>
							<p className="m-0 mt-1 text-sm text-lab-soft">Flags a game, and the points each one cost.</p>
							<div role="region" aria-label={`By ${d.label.toLowerCase()}`} tabIndex={0} className="mt-3 overflow-x-auto [contain:paint]">
								<table className="w-full min-w-[26rem] border-collapse text-sm">
									<caption className="sr-only">
										Flags by {d.label.toLowerCase()}, {a} and {b}
									</caption>
									<thead>
										<tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
											<th scope="col" className="py-1.5 pr-2 text-left">
												{d.label}
											</th>
											<th scope="col" className="px-2 py-1.5 text-right">
												{a} a game
											</th>
											<th scope="col" className="px-2 py-1.5 text-right">
												{a} each
											</th>
											<th scope="col" className="px-2 py-1.5 text-right">
												{b} a game
											</th>
											<th scope="col" className="py-1.5 pl-2 text-right">
												{b} each
											</th>
										</tr>
									</thead>
									<tbody>
										{pa.dims[id].map((x, i) => {
											const y = pb.dims[id][i]
											const ga = pa.games ? x.flags / pa.games : 0
											const gb = pb.games && y ? y.flags / pb.games : 0
											return (
												<tr key={x.id} className="border-t border-lab-line">
													<th scope="row" className="py-2 pr-2 text-left font-semibold text-lab-ink">
														{x.label}
													</th>
													<td className={`px-2 py-2 text-right font-mono tabular-nums ${ga > gb * 1.3 && x.flags >= 4 ? `font-bold ${BAD}` : ""}`}>{perGame(x.flags, pa.games)}</td>
													<td className="px-2 py-2 text-right font-mono tabular-nums text-lab-soft">{x.flags ? x.avg.toFixed(1) : "n/a"}</td>
													<td className={`px-2 py-2 text-right font-mono tabular-nums ${gb > ga * 1.3 && (y?.flags ?? 0) >= 4 ? `font-bold ${BAD}` : ""}`}>{y ? perGame(y.flags, pb.games) : "n/a"}</td>
													<td className="py-2 pl-2 text-right font-mono tabular-nums text-lab-soft">{y?.flags ? y.avg.toFixed(1) : "n/a"}</td>
												</tr>
											)
										})}
									</tbody>
								</table>
							</div>
						</div>
					)
				})}

				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">The penalties they commit</h2>
				<div role="region" aria-label="Penalties each team commits" tabIndex={0} className="mt-3 overflow-x-auto [contain:paint]">
					<table className="w-full border-collapse text-sm">
						<caption className="sr-only">Penalties committed, {a} and {b}</caption>
						<thead>
							<tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
								<th scope="col" className="py-1.5 pr-2 text-left">
									Penalty
								</th>
								<th scope="col" className="px-2 py-1.5 text-right">
									{a}
								</th>
								<th scope="col" className="py-1.5 pl-2 text-right">
									{b}
								</th>
							</tr>
						</thead>
						<tbody>
							{typeNames.map((t) => (
								<tr key={t.t} className="border-t border-lab-line">
									<th scope="row" className="py-2 pr-2 text-left font-semibold">
										<Link href={penaltyHref(t.t)} className="text-lab-ink underline-offset-4 hover:underline">
											{t.t}
										</Link>
									</th>
									<td className={`px-2 py-2 text-right font-mono tabular-nums ${t.a > t.b ? "font-bold" : "text-lab-soft"}`}>{t.a}</td>
									<td className={`py-2 pl-2 text-right font-mono tabular-nums ${t.b > t.a ? "font-bold" : "text-lab-soft"}`}>{t.b}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
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
