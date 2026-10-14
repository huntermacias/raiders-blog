import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { EarlyChip, TeamPill, TierChip } from "@/components/lab/players/Bits"
import GameLog from "@/components/lab/players/GameLog"
import ContractSection from "@/components/lab/players/ContractSection"
import GradeRing from "@/components/lab/players/GradeRing"
import LeagueMap from "@/components/lab/players/LeagueMap"
import LineCard from "@/components/lab/players/LineCard"
import { BestWorst, BuildAgainstPeers, Ladders, type GameCall } from "@/components/lab/players/ProfileExtras"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import PercentileProfile from "@/components/lab/players/PercentileProfile"
import ProfileShare from "@/components/lab/players/ProfileShare"
import TeamContext, { TeamStrip } from "@/components/lab/players/TeamContext"
import TrackView from "@/components/lab/players/TrackView"
import ProgressExplorer, { type ExplorerStat } from "@/components/lab/players/ProgressExplorer"
import SectionHead from "@/components/lab/players/SectionHead"
import SectionNav, { type NavItem } from "@/components/lab/players/SectionNav"
import Situations from "@/components/lab/players/Situations"
import SnapStrip from "@/components/lab/players/SnapStrip"
import StatTile from "@/components/lab/players/StatTile"
import { getContracts } from "@/lib/lab/contractData"
import { dealFor, mainRow, onRookieScale, payRank, valueFor } from "@/lib/lab/contractsKit"
import V2Summary from "@/components/lab/v2/V2Summary"
import { getPlayers, getUnits } from "@/lib/lab/data"
import { isV2, type V2Row } from "@/lib/lab/v2/types"
import { teamView } from "@/lib/lab/playerTeam"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { getPlayerHistory } from "@/lib/lab/playerHistoryData"
import { type Career, careerOf } from "@/lib/lab/seasonKit"
import CareerTable from "@/components/lab/players/CareerTable"
import { compareUrl } from "@/lib/lab/compareKit"
import { getSituations } from "@/lib/lab/situationData"
import { SIT_BOARDS, type Role, sitBoardHref, situationView } from "@/lib/lab/situationsKit"
import { boardHref, cardStyle, compareHref, profileHref, teamName } from "@/lib/lab/playerView"
import {
	BOX,
	STAT,
	isGraded,
	lc,
	type PlayerGroup,
	GROUP_META,
	HEADLINE,
	type LogPoint,
	type PlayerRow,
	badgesFor,
	bioFacts,
	buildVsPeers,
	extremeGames,
	ladder,
	boxRank,
	contextOf,
	type PlayerStat,
	type StatContext,
	formatBox,
	fingerprint,
	formatStat,
	gameLog,
	gradeWord,
	isCore,
	isEarly,
	gradeScore,
	lineRecord,
	ordinal,
	opponentFor,
	overall,
	overallRank,
	pctFromRank,
	profileSlugs,
	rankPhrase,
	roleOf,
	rowsFor,
	shownPct,
	scoutingRead,
	statInfo,
	tierOf,
	windowWeeks,
	winSentence,
} from "@/lib/lab/playersKit"
import { defaultAxes, mapData } from "@/lib/lab/mapKit"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"

// Every player is built once, ahead of time, from the JSON in the repo. A player who is not in the data is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return profileSlugs(getPlayers()).map((slug) => ({ slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await props.params
	const data = getPlayers()
	const rows = rowsFor(data, slug)
	if (!rows.length) return { title: "Players | Raiders Rundown" }
	const p = rows[0]
	const read = scoutingRead(data, p)[0] ?? ""
	const title = `${p.name} stats: ${teamName(p.team)} ${GROUP_META[p.group].single.toLowerCase()} ranked against the league | Raiders Rundown`
	const description = `${p.name}'s ${data.season} advanced stats ranked against every ${GROUP_META[p.group].single.toLowerCase()} in the NFL, with how he has changed through the season and how sure the numbers are. ${read}`.slice(0, 300)
	const url = `${SITE_URL}/lab/players/${slug}`
	// The share card is drawn on request from the same data, and the stamp changes whenever the data does.
	const card = `${SITE_URL}/api/og?type=player&slug=${slug}&v=${Date.parse(data.generatedAt) || 0}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "profile", title, description, url, siteName: "Raiders Rundown", images: [card] }, twitter: { card: "summary_large_image", title, description, images: [card] } }
}

/** The stats the similar-player match is made on, in words: every graded stat that is his own, not his unit's. */
function similarBasis(group: PlayerGroup): string {
	const names = Object.keys(STAT[group])
		.filter((k) => isGraded(group, k) && !statInfo(group, k)?.unit)
		.map((k) => lc(statInfo(group, k)!.label))
	if (names.length <= 1) return names.join("")
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** The link that sets him against himself: his latest finished season against the one being played. */
function selfOf(row: PlayerRow, career: Career | null, current: number): { href: string; season: number } | null {
	const past = (career?.rows ?? []).filter((r) => r.season < current)
	const last = past[past.length - 1]
	if (!last) return null
	return { href: compareUrl({ a: row.slug, b: row.slug, range: "season", metrics: null, group: row.group, sa: last.season, sb: null }), season: last.season }
}

function RoleSection({ row, primary }: { row: PlayerRow; primary: boolean }) {
	const data = getPlayers()
	const all = getPlayerLogs()
	const log = all.logs[row.slug]?.[row.group]
	const wins = all.win[row.group] ?? {}
	const meta = GROUP_META[row.group]
	const read = scoutingRead(data, row, { log })
	const team = teamView(getUnits(), data, row)
	const contracts = getContracts()
	const deal = primary && mainRow(data, row.slug)?.group === row.group ? dealFor(data, contracts, row.slug) : null
	const career = careerOf(data, getPlayerHistory(), row)
	const graded = row.stats.filter((s) => statInfo(row.group, s.k)?.higher !== null)
	const style = row.stats.filter((s) => statInfo(row.group, s.k)?.higher === null)
	const headFirst = graded.slice().sort((a, b) => (a.k === HEADLINE[row.group] ? -1 : b.k === HEADLINE[row.group] ? 1 : 0))
	const explorerStats: ExplorerStat[] = row.stats
		.filter((s) => log?.g[s.k]?.length)
		.map((s) => {
			const i = statInfo(row.group, s.k)!
			// A unit's number is charted by week but never ranked: the five linemen who start together share it.
			return { k: s.k, label: i.label, graded: i.higher !== null && !i.unit, lower: i.higher === false }
		})
		.sort((a, b) => (a.k === HEADLINE[row.group] ? -1 : b.k === HEADLINE[row.group] ? 1 : Number(b.graded) - Number(a.graded)))
	const trails: Record<string, LogPoint[]> = {}
	const per: Record<string, string> = {}
	const opp: Record<string, string> = {}
	for (const s of row.stats) {
		const pts = log?.g[s.k]
		if (!pts) continue
		trails[s.k] = pts
		per[s.k] = statInfo(row.group, s.k)?.per ?? "plays"
		for (const p of pts) opp[String(p[0])] = opponentFor(data, row.team, p[0], log)
	}
	const role = roleOf(row)
	const side = meta.side
	const weeks = Object.keys(data.opp[row.team] ?? {}).map(Number).sort((a, b) => a - b)
	const finished = windowWeeks(data, row.group)
	const boxKeys = Object.keys(BOX[row.group]).filter((k) => row.box[k] !== undefined)
	const games = gameLog(data, row, log, all.res)
	const sit = getSituations()
	const situations = (({ qb: ["pass", "rush"], rb: ["rush", "rec"], wr: ["rec"], te: ["rec"] } as Partial<Record<string, Role[]>>)[row.group] ?? [])
		.map((r) =>
			situationView(sit, row.slug, r, row.group, {
				opp: (w) => opponentFor(data, row.team, w, log),
				result: (w) => {
					const t = log?.t?.[String(w)] ?? row.team
					const g = all.res[t]?.[String(w)]
					return g ? { text: `${g[0] > g[1] ? "W" : g[0] < g[1] ? "L" : "T"} ${g[0]}–${g[1]}`, won: g[0] === g[1] ? null : g[0] > g[1] } : null
				},
			}),
		)
		.filter((v): v is NonNullable<typeof v> => v !== null)
	const logStats = headFirst.filter((s) => isCore(row.group, s.k)).slice(0, 4).map((s) => s.k)
	const sectionId = `${row.group}`
	const g = row.group
	// Sections take turns being plain and tinted, whichever of them a player has.
	let band = 0
	const tone = () => `pc-sheen ${(band += 1) % 2 === 0 ? "bg-lab-tint" : ""}`

	// The people just above and below him on the boards where he does best (his headline stat first), with the whole league's worth of
	// context in the map below them.
	const rankedStats = row.stats
		.filter((s) => {
			const i = statInfo(g, s.k)
			// A stat that is still mostly luck is not ranked on a ladder either: the order would be chance.
			return i && i.higher !== null && i.counts !== false && s.season.r !== undefined && s.season.r !== null && contextOf(data, row, s)?.signal !== "luck"
		})
		.sort((a, b) => (a.k === HEADLINE[g] ? -1 : b.k === HEADLINE[g] ? 1 : (a.season.r ?? 99) - (b.season.r ?? 99)))
	const ladders = rankedStats
		.slice(0, 3)
		.map((s) => ladder(data, row, s.k))
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.map((x) => ({ board: x.board, rungs: x.rungs }))
	const bios = all.bio
	const build = buildVsPeers(row, bios[row.slug], data.players.filter((q) => q.group === g).map((q) => bios[q.slug]), new Date())
	const mp = mapData(data, g)
	const [mapX, mapY] = defaultAxes(mp, HEADLINE[g])
	// Best and worst games on his two most telling stats, among games with at least half his usual workload so one stray target is not a "game".
	const calls: GameCall[] = []
	for (const s of rankedStats.slice(0, 2)) {
		const info = statInfo(g, s.k)!
		const vols = (log?.g[s.k] ?? []).map((p) => p[2]).sort((a, b) => a - b)
		const med = vols.length ? vols[vols.length >> 1] : 0
		const ex = extremeGames(log, s.k, info.higher, Math.max(2, Math.floor(med * 0.5)))
		if (!ex || ex.best.week === ex.worst.week) continue
		const tag = (w: number) => {
			const r = games.find((x) => x.week === w)
			return { opp: opponentFor(data, row.team, w, log), result: r?.result ?? null, won: r?.won ?? null }
		}
		const latest = games.length ? Math.max(...games.map((x) => x.week)) : 0
		const seen = new Set((log?.g[s.k] ?? []).map((p) => p[0]))
		calls.push({ key: s.k, label: info.label, per: info.per, best: { ...ex.best, ...tag(ex.best.week) }, worst: { ...ex.worst, ...tag(ex.worst.week) }, ...(latest && !seen.has(latest) ? { pending: latest } : {}) })
	}
	const navItems: NavItem[] = [
		...(read.length ? [{ id: `read-${g}`, label: "The read" }] : []),
		...(team && (team.unit || team.room.length > 1) ? [{ id: `team-${g}`, label: "His team" }] : []),
		{ id: `stack-${g}`, label: "How he stacks up" },
		{ id: `league-${g}`, label: "In the league" },
		...(explorerStats.length ? [{ id: `progress-${g}`, label: "Progress" }] : []),
		...(career ? [{ id: `career-${g}`, label: "Career" }] : []),
		...(situations.length ? [{ id: `situations-${g}`, label: "Situational" }] : []),
		{ id: `numbers-${g}`, label: "In context" },
		...(style.length ? [{ id: `style-${g}`, label: "How he plays" }] : []),
		...(deal ? [{ id: `money-${g}`, label: "Contract" }] : []),
		...(side !== "special" ? [{ id: `time-${g}`, label: "Playing time" }] : []),
		...(games.length ? [{ id: `log-${g}`, label: "Game by game" }] : []),
		...(boxKeys.length ? [{ id: `box-${g}`, label: "Box score" }] : []),
		...(row.like.length ? [{ id: `like-${g}`, label: "Similar profiles" }] : []),
	]
	const step = (key: string) => ({ n: navItems.findIndex((i) => i.id === `${key}-${g}`) + 1, of: navItems.length })
	return (
		<div className="lab-opp" style={cardStyle(row.team)} id={sectionId}>
			{primary ? <SectionNav items={navItems} /> : null}
			{!primary ? (
				<div className="container pt-10">
					<h2 className="m-0 font-serif text-3xl font-bold tracking-tight">As a {meta.single.toLowerCase()}</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">{meta.blurb}</p>
				</div>
			) : null}

			{row.group === "ol" ? (
				<section className="container pt-8" aria-label="What these numbers can and cannot say">
					<p className="m-0 max-w-3xl rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="ol-note">
						<span className="font-semibold text-lab-ink">What we can and cannot say about a lineman. </span>
						No public data credits one lineman with a block won or lost. This page shows what does exist: how often he is flagged compared with the other linemen, how much he plays, and how his whole line does in the games he starts. The line&apos;s numbers are shared by the five who start together, so they describe the unit more than the man.
					</p>
				</section>
			) : null}

			{read.length ? (
				<section className="pc-sheen scroll-mt-32" aria-labelledby={`read-h-${row.group}`} id={`read-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`read-h-${row.group}`} icon="read" step={step("read")} title="The read" className="mb-1" />
						<p className="m-0 mt-4 max-w-3xl font-serif text-xl leading-snug text-lab-ink sm:text-2xl sm:leading-snug" data-testid="read-lead">
							{read[0]}
						</p>
						{read.length > 1 ? (
							<ul className="m-0 mt-5 list-none gap-3 p-0 md:columns-2 [&>li]:mb-3" data-testid="read-cards">
								{read.slice(1).map((r, i) => (
									<li key={i} className="relative break-inside-avoid overflow-hidden rounded-xl border border-lab-line bg-lab-surface py-3.5 pl-5 pr-4 text-[15px] leading-relaxed text-lab-soft shadow-[0_1px_0_rgba(0,0,0,0.02)]">
										<span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: "var(--pc-accent)" }} />
										{r}
									</li>
								))}
							</ul>
						) : null}
						<p className="m-0 mt-4 max-w-3xl text-xs leading-relaxed text-lab-muted">Written from his numbers, not from film. {row.games} {row.games === 1 ? "game" : "games"} are behind the season figures.</p>
					</div>
				</section>
			) : null}

			{team && (team.unit || team.room.length > 1) ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`team-h-${row.group}`} id={`team-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`team-h-${row.group}`} icon="team" step={step("team")} title="His team" blurb={<>A player is part of a unit. Here is how the {teamName(row.team)} do at his job, and who he shares the room with.</>} className="mb-1" />
						<div className="mt-5">
							<TeamContext view={team} player={row} />
						</div>
					</div>
				</section>
			) : null}

			<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`pct-${row.group}`} id={`stack-${row.group}`}>
				<div className="container py-8 sm:py-10">
					<SectionHead id={`pct-${row.group}`} icon="stack" step={step("stack")} title="How he stacks up" blurb={<>Every graded stat at a glance, against all the {meta.peers} in the league.</>} className="mb-1" />
					<div className="mt-5 max-w-4xl">
						<PercentileProfile data={data} player={row} />
					</div>
				</div>
			</section>

			<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`league-h-${row.group}`} id={`league-${row.group}`}>
				<div className="container py-8 sm:py-10">
					<SectionHead id={`league-h-${row.group}`} icon="league" step={step("league")} title="In the league" blurb={<>Every {meta.single.toLowerCase()} in the league as a dot: pick any two stats and see where he sits, who is around him, and who is ahead.</>} className="mb-1" />
					<div className="mt-5">
						<LeagueMap group={row.group} focal={[row.slug]} headline={HEADLINE[row.group]} peers={meta.peers} initialX={mapX} initialY={mapY} />
					</div>
					{ladders.length ? (
						<>
							<h3 className="m-0 mt-10 font-serif text-xl font-bold">Who is around him on the leaderboards</h3>
							<p className="m-0 mb-4 mt-1 max-w-3xl text-sm text-lab-soft">His best numbers, with the {meta.peers} just ahead of and behind him. A number is easier to judge beside the names.</p>
							<Ladders group={row.group} items={ladders} peers={meta.peers} />
						</>
					) : null}
					{build.length ? (
						<>
							<h3 className="m-0 mt-10 font-serif text-xl font-bold">Build and age against the position</h3>
							<p className="m-0 mb-4 mt-1 max-w-3xl text-sm text-lab-soft">Size and age are not good or bad. They show what kind of {meta.single.toLowerCase()} he is and how he compares physically with the {meta.peers} in the league.</p>
							<BuildAgainstPeers lines={build} peers={meta.peers} name={row.name} />
						</>
					) : null}
				</div>
			</section>

			{explorerStats.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`prog-${row.group}`} id={`progress-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`prog-${row.group}`} icon="progress" step={step("progress")} title="How he has progressed" blurb={<>Where he has ranked among {meta.peers} after each week, and every game behind it.</>} className="mb-1" />
						<div className="mt-5">
							<ProgressExplorer group={row.group} name={row.name} stats={explorerStats} trails={trails} weeks={data.weeks} formWeeks={finished} opp={opp} initial={HEADLINE[row.group]} per={per} />
						</div>
					</div>
				</section>
			) : null}

			{career ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`career-h-${row.group}`} id={`career-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`career-h-${row.group}`} icon="career" step={step("career")} title="Career, season by season" blurb={<>The same grades for each of his last seasons, each against that season&apos;s league, so you can see whether he is rising, steady or slipping.</>} className="mb-1" />
						<div className="mt-5">
							<CareerTable career={career} group={row.group} name={row.name} data={data} usesHistory={row.stats.some((x) => Boolean(x.season.hn))} selfHref={selfOf(row, career, data.season)} />
						</div>
					</div>
				</section>
			) : null}

			{situations.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`sit-${row.group}`} id={`situations-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`sit-${row.group}`} icon="situations" step={step("situations")} title="Situational football" blurb={<>How he does on each down and at each distance, and every play of every game as a success or a failure.</>} className="mb-1" />
						<div className="mt-5">
							<Situations name={row.name} views={situations} />
							{situations.map((v) => {
								const b = SIT_BOARDS.find((x) => x.role === v.role && x.group === row.group)
								return b ? (
									<p key={v.role} className="m-0 mt-4 text-sm">
										<Link href={sitBoardHref(b.slug)} className="font-semibold text-lab-ink underline decoration-lab-line-strong underline-offset-2">
											See every {meta.single.toLowerCase()} ranked on 3rd down and in the red zone &rarr;
										</Link>
									</p>
								) : null
							}).slice(0, 1)}
						</div>
					</div>
				</section>
			) : null}

			<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`grades-${row.group}`} id={`numbers-${row.group}`}>
				<div className="container py-8 sm:py-10">
					<SectionHead id={`grades-${row.group}`} icon="numbers" step={step("numbers")} title="The numbers, in context" blurb={<>Each one against every {meta.single.toLowerCase()} with at least {meta.need}. Right on the strip is better.</>} className="mb-1" />
					<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{headFirst.map((s) => (
							<StatTile key={s.k} data={data} player={row} stat={s} showBox win={statInfo(row.group, s.k)?.unit ? null : winSentence(wins[s.k], meta.single, statInfo(row.group, s.k)?.label ?? "")} />
						))}
					</div>
				</div>
			</section>

			{style.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`style-${row.group}`} id={`style-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`style-${row.group}`} icon="style" step={step("style")} title="How he plays" blurb={<>Tendencies: how his game differs from the {meta.peers} around him. These are not better or worse, only different, and often say as much about the offense or defense he plays in as about him.</>} className="mb-1" />
						<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{style.map((s) => (
								<StatTile key={s.k} data={data} player={row} stat={s} showTrend={false} />
							))}
						</div>
					</div>
				</section>
			) : null}

			{deal ? (
				<ContractSection
					data={data}
					contracts={contracts}
					row={row}
					deal={deal}
					rank={payRank(data, contracts, row.slug)}
					value={valueFor(data, contracts, row.slug)}
					id={`money-${row.group}`}
					headingId={`money-h-${row.group}`}
					step={step("money")}
					rookie={onRookieScale(bios[row.slug]?.draft, data.season)}
					className={`scroll-mt-32 border-t border-lab-line ${tone()}`}
				/>
			) : null}

			{side !== "special" ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`time-${row.group}`} id={`time-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`time-${row.group}`} icon="time" step={step("time")} title="Playing time" className="mb-1" />{row.snaps.season ? (
							<p className="m-0 mt-1 max-w-3xl text-sm leading-relaxed text-lab-soft">
								He has played in {row.snaps.season[1]} of his team&apos;s {row.snaps.season[2]} {row.snaps.season[2] === 1 ? "game" : "games"} with snap counts, on the field for about {Math.round(((row.snaps.season[0] * row.snaps.season[2]) / Math.max(1, row.snaps.season[1])) * 100)}% of the team&apos;s {side === "offense" ? "offensive" : "defensive"} plays when he plays.
							</p>
						) : null}
						{role ? (
							<p className="m-0 mt-2 max-w-3xl text-sm leading-relaxed text-lab-ink">
								<span className="font-semibold">{role.headline}.</span> {role.detail}
							</p>
						) : null}
						{log?.s?.length ? (
							<div className="mt-5 max-w-3xl">
								<SnapStrip weeks={weeks} shares={log.s} formWeeks={finished} opp={data.opp[row.team]} />
								<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">
									Each column is a game: the share of his team&apos;s {side === "offense" ? "offensive" : "defensive"} snaps he played. 80% means about 8 of every 10 plays. &ldquo;Out&rdquo; means he did not play; a question mark means snap counts are not posted yet. Shaded games are the recent stretch.
								</p>
							</div>
						) : null}
					</div>
				</section>
			) : null}

			{games.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`log-${row.group}`} id={`log-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`log-${row.group}`} icon="log" step={step("log")} title="Game by game" blurb={<>Every game this season: how it ended for his team, how much he played, his box score, and the advanced numbers from that one game. One game is a small sample, so read the right-hand columns as a snapshot, not his level. A dash means that number is not in yet (charting posts a day or two after a game), not a zero.</>} className="mb-1" />
						{calls.length ? (
							<div className="mt-5">
								<BestWorst group={row.group} calls={calls} />
							</div>
						) : null}
						<div className="mt-5">
							<GameLog name={row.name} group={row.group} rows={games} boxKeys={Object.keys(BOX[row.group])} statKeys={logStats} snaps={side !== "special"} />
						</div>
					</div>
				</section>
			) : null}

			{boxKeys.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`box-${row.group}`} id={`box-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`box-${row.group}`} icon="box" step={step("box")} title="The box score" blurb={<>The traditional totals, with where each ranks among {meta.peers}. A total rewards volume, which is why the advanced numbers above matter.</>} className="mb-1" />
						<div className="mt-4 max-w-2xl overflow-hidden rounded-xl border border-lab-line">
							<table className="w-full border-collapse text-left text-sm">
								<caption className="sr-only">{row.name} box score totals</caption>
								<thead>
									<tr className="bg-lab-tint text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
										<th scope="col" className="px-3 py-2">Stat</th>
										<th scope="col" className="px-3 py-2 text-right">Total</th>
										<th scope="col" className="px-3 py-2 text-right">Rank</th>
									</tr>
								</thead>
								<tbody>
									{boxKeys.map((k) => {
										const r = boxRank(data, row, k)
										return (
											<tr key={k} className="border-t border-lab-line">
												<th scope="row" className="px-3 py-2 font-normal text-lab-soft">
													<Link href={boardHref(row.group, BOX[row.group][k].path)} className="hover:underline">
														{BOX[row.group][k].label}
													</Link>
												</th>
												<td className="px-3 py-2 text-right font-mono font-bold tabular-nums">{formatBox(row.group, k, row.box[k])}</td>
												<td className="px-3 py-2 text-right text-xs text-lab-muted">{r ? rankPhrase(r.rank, r.of) : "–"}{r && BOX[row.group][k].bad ? " (most)" : ""}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			) : null}

			{row.like.length ? (
				<section className={`scroll-mt-32 border-t border-lab-line ${tone()}`} aria-labelledby={`like-${row.group}`} id={`like-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<SectionHead id={`like-${row.group}`} icon="like" step={step("like")} title="Similar statistical profiles" blurb={<>The {meta.peers} whose grades are closest to his on {similarBasis(row.group)}. Similar means similar numbers, not the same style of play{row.group === "ol" ? ", and his line's run success and sacks allowed are left out, because linemen who start together share them" : ""}.</>} className="mb-1" />
						<ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
							{row.like.map((slug) => {
								const q = data.players.find((x) => x.slug === slug && x.group === row.group)
								if (!q) return null
								const o = gradeScore(data, q)
								return (
									<li key={slug} className="lab-opp relative rounded-xl border border-lab-line bg-lab-surface p-3 transition-shadow hover:shadow-md" style={{ ...cardStyle(q.team), borderTop: "4px solid var(--pc-accent)" }}>
										<p className="m-0 flex items-center gap-2 text-xs text-lab-muted">
											<TeamPill team={q.team} /> {q.pos}
										</p>
										<p className="m-0 mt-1 font-serif text-base font-bold">
											<Link href={profileHref(slug)} className="hover:underline">
												{q.name}
											</Link>
										</p>
										<span aria-hidden="true" className="absolute right-3 top-3 font-mono text-2xl font-bold tabular-nums text-lab-muted" style={{ opacity: 0.6 }}>{o === null || isV2(data) ? "" : o}</span>
										<p className="m-0 mt-1 text-xs text-lab-soft">
											{isV2(data) ? (overallRank(data, q) ? `${ordinal(overallRank(data, q)!.rank)} of ${overallRank(data, q)!.of} this season` : "Not ranked this season") : `Overall ${o === null ? "–" : Math.round(o)}`} &middot; {formatStat(q.group, HEADLINE[q.group], q.stats.find((s) => s.k === HEADLINE[q.group])?.season.v)}
										</p>
										<p className="m-0 mt-2 text-xs">
											<Link href={compareHref(row.slug, slug)} className="font-semibold text-lab-ink underline decoration-lab-line-strong underline-offset-2">
												Compare
											</Link>
										</p>
									</li>
								)
							})}
						</ul>
					</div>
				</section>
			) : null}
		</div>
	)
}

export default async function PlayerPage(props: { params: Promise<{ slug: string }> }) {
	const { slug } = await props.params
	const data = getPlayers()
	const rows = rowsFor(data, slug)
	if (!rows.length) notFound()
	const p = rows[0]
	const meta = GROUP_META[p.group]
	const o = overall(p)
	const score = gradeScore(data, p)
	const record = lineRecord(data, p)
	const rank = overallRank(data, p)
	const tier = rank ? tierOf(pctFromRank(rank.rank, rank.of)) : null
	const early = isEarly(data, p)
	const url = `${SITE_URL}/lab/players/${slug}`
	const bio = getPlayerLogs().bio[slug]
	const facts = bioFacts(bio, new Date())
	const badges = badgesFor(data, p)
	const traits = fingerprint(data, p, 3)
	const tv = teamView(getUnits(), data, p)
	// The three numbers he stands out on, for the hero: settled stats first (a lucky rate is never a headline), best place first.
	const contexts = p.stats.map((st) => ({ s: st, c: contextOf(data, p, st) })).filter((x): x is { s: PlayerStat; c: StatContext } => Boolean(x.c && x.c.pct !== null && x.c.rank !== null && x.c.of !== null && x.c.info.counts !== false && x.c.info.higher !== null))
	const settled = contexts.filter((x) => x.c.signal !== "luck" && x.c.sure !== "thin")
	const keyStats = (settled.length >= 3 ? settled : contexts.filter((x) => x.c.signal !== "luck"))
		.sort((a, b) => (b.c.pct ?? 0) - (a.c.pct ?? 0))
		.slice(0, 3)
	const ld = [
		{
			"@context": "https://schema.org",
			"@type": "Person",
			name: p.name,
			...(bio?.born ? { birthDate: bio.born } : {}),
			...(bio?.college ? { alumniOf: { "@type": "CollegeOrUniversity", name: bio.college } } : {}),
			...(bio?.ht ? { height: { "@type": "QuantitativeValue", value: bio.ht, unitCode: "INH" } } : {}),
			...(bio?.wt ? { weight: { "@type": "QuantitativeValue", value: bio.wt, unitCode: "LBR" } } : {}),
			jobTitle: `${meta.single}${p.pos ? ` (${p.pos})` : ""}`,
			memberOf: { "@type": "SportsTeam", name: teamName(p.team), sport: "American football" },
			url,
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
				{ "@type": "ListItem", position: 2, name: "Players", item: `${SITE_URL}/lab/players` },
				{ "@type": "ListItem", position: 3, name: p.name, item: url },
			],
		},
	]
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<TrackView event="player_view" props={{ slug, group: p.group, team: p.team }} />
			<section className="lab-opp pc-sheen relative overflow-hidden border-b border-lab-line" style={{ ...cardStyle(p.team), backgroundImage: "linear-gradient(115deg, color-mix(in srgb, var(--pc-accent) 15%, transparent) 0%, transparent 58%), var(--pc-sheen)" }}>
				<div className="w-full" aria-hidden="true">
					<div className="h-1.5" style={{ background: "var(--pc-accent)" }} />
					<div className="h-1.5" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--pc-accent) 0 8px, transparent 8px 16px)", opacity: 0.55 }} />
				</div>
				{bio?.no !== undefined ? (
					<span aria-hidden="true" className="pointer-events-none absolute -top-8 right-2 select-none font-serif text-[13rem] font-black leading-none sm:right-10 sm:text-[22rem]" style={{ color: "var(--pc-accent)", opacity: 0.07 }}>
						{bio.no}
					</span>
				) : null}
				<div className="container relative py-8 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo;{" "}
						<Link href={`/lab/players/leaders/${p.group}`} className="hover:text-lab-ink">
							{meta.title}
						</Link>
					</nav>
					<div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
						<div className="min-w-0">
							<div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
								<div className="relative shrink-0 self-start rounded-full p-[5px] shadow-lg sm:self-center" style={{ background: "linear-gradient(140deg, var(--pc-accent), color-mix(in srgb, var(--pc-accent) 35%, transparent))" }}>
									<Headshot espn={p.espn} shot={p.shot} name={p.name} size={128} className="ring-4 ring-lab-surface" />
									<span className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border border-lab-line bg-lab-surface">
										<TeamLogo team={p.team} size={28} />
									</span>
								</div>
								<div className="min-w-0">
									<p className="m-0 flex flex-wrap items-center gap-2 text-sm text-lab-soft">
										<TeamPill team={p.team} /> {teamName(p.team)} &middot; {p.pos || meta.single}
										{bio?.no !== undefined ? <span className="font-mono text-lab-muted">&middot; #{bio.no}</span> : null}
										{rows.length > 1 ? <span className="text-lab-muted"> &middot; also {rows.slice(1).map((r) => GROUP_META[r.group].single.toLowerCase()).join(", ")}</span> : null}
									</p>
									<h1 className="m-0 mt-2 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">{p.name}</h1>
									{facts.length ? (
										<dl className="m-0 mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-7" data-testid="bio">
											{facts.map((f) => (
												<div key={f.label} className={f.label === "Drafted" ? "col-span-2 sm:col-span-1" : undefined}>
													<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{f.label}</dt>
													<dd className="m-0 text-sm font-semibold text-lab-ink">{f.value}</dd>
												</div>
											))}
										</dl>
									) : null}
								</div>
							</div>
							{badges.length ? (
								<ul className="m-0 mt-6 flex list-none flex-wrap gap-1.5 p-0" aria-label="Where he leads the league" data-testid="badges">
									{badges.map((b, i) => (
										<li key={b.kind + b.key} className="rr-rise" style={{ animationDelay: `${120 + i * 60}ms` }}>
											<Link
												href={boardHref(p.group, b.path)}
												className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${b.rank === 1 ? "border-transparent" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:border-lab-ink"}`}
												style={b.rank === 1 ? { background: "var(--pc-accent)", color: "var(--pc-on)" } : undefined}
											>
												{b.rank === 1 ? <span aria-hidden="true">&#9733;</span> : null}
												{b.text}
											</Link>
										</li>
									))}
								</ul>
							) : null}
							{traits.length ? (
								<p className="m-0 mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-lab-soft" data-testid="traits">
									<span className="font-semibold uppercase tracking-[0.12em] text-lab-muted">Plays like</span>
									{traits.map((t) => (
										<span key={t.k} className="rounded-md bg-lab-tint px-2 py-0.5 font-medium text-lab-ink" title={`${t.label}: ${t.pct >= 50 ? "higher" : "lower"} than ${shownPct(t.pct >= 50 ? t.pct : 100 - t.pct)}% of ${meta.peers}`}>
											{t.text}
										</span>
									))}
								</p>
							) : null}
							<div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
								<Link href={compareHref(p.slug)} className="rounded-lg border border-lab-ink bg-lab-ink px-3.5 py-2 font-semibold text-lab-page">
									Compare with another player
								</Link>
								<Link href={boardHref(p.group, statInfo(p.group, HEADLINE[p.group])!.path)} className="rounded-lg border border-lab-line-strong px-3.5 py-2 font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink">
									{meta.title} leaderboard
								</Link>
								<ProfileShare slug={p.slug} name={p.name} group={p.group} stamp={Date.parse(data.generatedAt) || 0} text={record ? `${p.name}: his record and his line's numbers on Raiders Rundown.` : isV2(data) ? `${p.name}: ${rank ? `${rankPhrase(rank.rank, rank.of)} ${meta.peers} this season. ` : ""}This season, what he has contributed and his projection, kept apart, on Raiders Rundown.` : `${p.name}: ${score === null ? "" : `${score} overall, `}${rank ? `${rankPhrase(rank.rank, rank.of)} ${meta.peers}${early ? " on early numbers" : ""}. ` : ""}Advanced stats against the league on Raiders Rundown.`} />
							</div>
						</div>

						<aside className="grid min-w-0 gap-3" aria-label={record ? "His record" : isV2(data) ? "This season, contribution and projection" : "Overall"}>
							{record ? <LineCard record={record} peers={meta.peers} /> : isV2(data) ? <V2Summary data={data} player={p as V2Row} /> : (
							<div className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface/90 backdrop-blur" data-testid="overall">
								<div className="flex items-center gap-5 p-5">
									<div className="shrink-0"><GradeRing grade={o} pct={score} size={112}>
										<p className="m-0 font-mono text-4xl font-bold leading-none tabular-nums">{score === null ? "–" : score}</p>
										<p className="m-0 mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Overall</p>
									</GradeRing></div>
									<div className="min-w-0">
										{rank ? (
											<p className="m-0 text-sm leading-snug text-lab-soft">
												<span className="block font-serif text-3xl font-bold leading-none text-lab-ink">{ordinal(rank.rank)}</span>
												of {rank.of} {meta.peers}
											</p>
										) : null}
										{early ? <EarlyChip label="Early read" className="mt-2" /> : tier ? <TierChip tier={tier} className="mt-2" /> : null}
									</div>
								</div>
								{keyStats.length ? (
									<dl className="m-0 grid divide-x divide-lab-line border-t border-lab-line" style={{ gridTemplateColumns: `repeat(${keyStats.length}, minmax(0, 1fr))` }} data-testid="key-stats">
										{keyStats.map((x) => (
											<div key={x.s.k} className="min-w-0 px-3 py-3 text-center">
												<dd className="m-0 font-mono text-lg font-bold tabular-nums text-lab-ink">{formatStat(p.group, x.s.k, x.c.value)}</dd>
												<dt className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted" title={x.c.info.label}>{x.c.info.short}</dt>
												<p className="m-0 mt-0.5 text-[11px] text-lab-soft">{rankPhrase(x.c.rank!, x.c.of!)}</p>
											</div>
										))}
									</dl>
								) : null}
								{o !== null && score !== null ? (
									<p className="m-0 border-t border-lab-line bg-lab-tint px-5 py-3 text-xs leading-relaxed text-lab-muted" data-testid="overall-note">
										{early ? "Most of his numbers are still mostly luck. " : ""}
										Overall is his scouting grade stretched onto 0 to 99 (50 is average). Scouting grade {Math.round(o)} ({gradeWord(o)}; 50 is average).
									</p>
								) : null}
							</div>
							)}
							{tv ? <TeamStrip view={tv} team={p.team} className="mt-0" /> : null}
						</aside>
					</div>
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-6" />
				</div>
			</section>

			{rows.map((r, i) => (
				<RoleSection key={r.group} row={r} primary={i === 0} />
			))}

			<section className="border-t border-lab-line">
				<div className="container grid gap-3 py-8 text-xs leading-relaxed text-lab-muted">
					<p className="m-0 max-w-3xl">
						Ranks are among players at the same job who have enough plays to be graded. Grades and rankings come from play-by-play, charting and snap-count data, so they cannot see blocking, route running or assignments. See{" "}
						<Link href="/lab/players#how-it-works" className="underline">how the grades work</Link>.
					</p>
					<div className="flex flex-wrap items-center justify-between gap-4">
						<Link href="/lab/players" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
							&larr; All players
						</Link>
						<UnitsCredit />
					</div>
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
