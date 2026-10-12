import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import TrackView from "@/components/lab/players/TrackView"
import UnitsCredit from "@/components/lab/UnitsCredit"
import ComparePicker from "@/components/lab/players/ComparePicker"
import MoneyCompare from "@/components/lab/players/MoneyCompare"
import ProgressLine from "@/components/lab/players/ProgressLine"
import Yardstick from "@/components/lab/players/Yardstick"
import { getContracts } from "@/lib/lab/contractData"
import { dealFor, moneyRows, payRank, valueFor, valueSentence } from "@/lib/lab/contractsKit"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { labColorVarsB } from "@/lib/lab/colors"
import { cardStyle, compareHref, profileHref, teamName } from "@/lib/lab/playerView"
import {
	GROUP_META,
	HEADLINE,
	type PlayerRow,
	compareRows,
	formatStat,
	gradeWord,
	overall,
	overallRank,
	rankPhrase,
	rowsFor,
	searchIndex,
	statInfo,
	trailOf,
} from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"

type Search = { a?: string; b?: string }

export async function generateMetadata(props: { searchParams: Promise<Search> }): Promise<Metadata> {
	const { a, b } = await props.searchParams
	const data = getPlayers()
	const ra = a ? rowsFor(data, a)[0] : null
	const rb = b ? rowsFor(data, b)[0] : null
	const title = ra && rb ? `${ra.name} vs ${rb.name}: stats compared in context | Raiders Rundown` : "Compare any two NFL players in context | Raiders Rundown"
	const description = "Two players, side by side on the stats that matter for their position: where each ranks in the league, who is clearly ahead and who is too close to call."
	const base = `${SITE_URL}/lab/players/compare`
	return {
		title,
		description,
		alternates: { canonical: base },
		// A comparison of two particular players is a tool, not a page worth indexing on its own.
		robots: ra && rb ? { index: false, follow: true } : undefined,
		openGraph: { type: "website", title, description, url: base, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

function pick(rows: PlayerRow[], other?: PlayerRow): PlayerRow | null {
	if (!rows.length) return null
	return (other && rows.find((r) => r.group === other.group)) || rows[0]
}

function Header({ p, letter }: { p: PlayerRow; letter: string }) {
	const data = getPlayers()
	const o = overall(p)
	const rank = overallRank(data, p)
	const meta = GROUP_META[p.group]
	return (
		<div className="lab-opp rounded-2xl border border-lab-line bg-lab-surface p-4" style={cardStyle(p.team)}>
			<div className="flex items-center gap-3">
				<Headshot espn={p.espn} shot={p.shot} name={p.name} size={64} />
				<div className="min-w-0">
					<p className="m-0 flex items-center gap-2 text-xs text-lab-muted">
						<span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-lab-ink text-[10px] font-bold text-lab-ink">{letter}</span>
						<TeamLogo team={p.team} size={18} /> {teamName(p.team)} &middot; {p.pos}
					</p>
					<h2 className="m-0 mt-1 font-serif text-2xl font-bold leading-tight">
						<Link href={profileHref(p.slug)} className="hover:underline">
							{p.name}
						</Link>
					</h2>
				</div>
			</div>
			<p className="m-0 mt-2 flex items-baseline gap-2">
				<span className="font-mono text-4xl font-bold tabular-nums">{o === null ? "–" : Math.round(o)}</span>
				<span className="text-xs text-lab-muted">overall grade{o !== null ? `, ${gradeWord(o)}` : ""}</span>
			</p>
			{rank ? (
				<p className="m-0 text-sm text-lab-soft">
					<span className="font-semibold text-lab-ink">{rankPhrase(rank.rank, rank.of)}</span> {meta.peers}
				</p>
			) : null}
		</div>
	)
}

export default async function ComparePage(props: { searchParams: Promise<Search> }) {
	const { a, b } = await props.searchParams
	const data = getPlayers()
	const logs = getPlayerLogs().logs
	const ra = a ? rowsFor(data, a) : []
	const rb = b ? rowsFor(data, b) : []
	const A = pick(ra, rb[0])
	const B = pick(rb, A ?? undefined)
	const index = searchIndex(data)
	const entry = (slug?: string) => (slug ? (index.find((e) => e.slug === slug) ?? null) : null)
	const ready = A && B && A.group === B.group && A.id !== B.id
	const rows = ready ? compareRows(A, B) : []
	const graded = rows.filter((r) => r.info.higher !== null)
	const style = rows.filter((r) => r.info.higher === null)
	const contracts = getContracts()
	const dealA = ready && A ? dealFor(data, contracts, A.slug) : null
	const dealB = ready && B ? dealFor(data, contracts, B.slug) : null
	const money = ready && A && B ? moneyRows(dealA, dealB, dealA ? payRank(data, contracts, A.slug) : null, dealB ? payRank(data, contracts, B.slug) : null) : []
	const valueA = dealA && A ? valueFor(data, contracts, A.slug) : null
	const valueB = dealB && B ? valueFor(data, contracts, B.slug) : null
	const aWins = graded.filter((r) => r.edge === "a" && r.strength === "clear").length
	const bWins = graded.filter((r) => r.edge === "b" && r.strength === "clear").length
	const close = graded.filter((r) => r.strength === "toss-up").length

	// Suggestions: each Raider against the best player at his job.
	const suggest = data.players
		.filter((p) => p.team === data.team && p.stats.some((s) => s.k === HEADLINE[p.group]))
		.map((p) => {
			const best = data.players
				.filter((x) => x.group === p.group && x.id !== p.id)
				.sort((m, n) => (overall(n) ?? 0) - (overall(m) ?? 0))[0]
			return best ? { p, best } : null
		})
		.filter((x): x is { p: PlayerRow; best: PlayerRow } => Boolean(x))
		.slice(0, 8)

	const style2 = A && B ? { ...cardStyle(A.team), ...(B.team !== "LV" ? labColorVarsB(B.team) : {}) } : undefined
	const colorB = !B ? "var(--lab-ink)" : B.team === A?.team ? "var(--lab-ink)" : B.team === "LV" ? "var(--lab-team)" : "var(--lab-opp2)"

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; Compare
					</p>
					<h1 className="mt-3 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Compare two players</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">Put two players who do the same job side by side. For each stat you see where both rank in the league, and whether the gap between them is bigger than the noise a few plays create.</p>
					<div className="mt-6 max-w-3xl">
						<ComparePicker index={index} a={entry(A?.slug ?? a)} b={entry(B?.slug ?? b)} />
					</div>
					{A && B ? <TrackView event="player_compare" props={{ a: A.slug, b: B.slug, group: A.group }} /> : null}
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-5" />
				</div>
			</section>

			{ready && A && B ? (
				<div className="lab-opp lab-opp2" style={style2}>
					<section className="container py-8 sm:py-10">
						<div className="grid gap-4 md:grid-cols-2">
							<Header p={A} letter="A" />
							<Header p={B} letter="B" />
						</div>
						<p className="m-0 mt-5 max-w-3xl text-base leading-relaxed text-lab-soft" data-testid="verdict">
							{aWins === 0 && bWins === 0
								? `On the stats that count, ${A.name} and ${B.name} are too close to separate with the plays we have.`
								: `${A.name} is clearly ahead on ${aWins} ${aWins === 1 ? "stat" : "stats"}, ${B.name} on ${bWins}.`}{" "}
							{close ? `${close} ${close === 1 ? "is" : "are"} too close to call.` : ""}
						</p>
					</section>

					{(() => {
						const key = HEADLINE[A.group]
						const la = logs[A.slug]?.[A.group]
						const lb = logs[B.slug]?.[B.group]
						const pa = trailOf(la, key).map((t) => ({ w: t[0], pct: t[3] }))
						const pb = trailOf(lb, key).map((t) => ({ w: t[0], pct: t[3] }))
						if (pa.filter((x) => x.pct !== null).length + pb.filter((x) => x.pct !== null).length < 2) return null
						const info = statInfo(A.group, key)!
						return (
							<section className="border-t border-lab-line bg-lab-tint">
								<div className="container py-8 sm:py-10">
									<h2 className="m-0 font-serif text-2xl font-bold">The year so far: {info.label}</h2>
									<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Where each has ranked among {GROUP_META[A.group].peers} after every week. Solid line is {A.name}, dashed is {B.name}.</p>
									<div className="mt-4 max-w-3xl">
										<ProgressLine weeks={data.weeks} points={pa} second={{ points: pb, color: colorB }} formWeeks={data.formWeeks} label={`${A.name} and ${B.name}, ${info.label}: season-to-date rank among their peers after each week.`} />
									</div>
								</div>
							</section>
						)
					})()}

					<section className="border-t border-lab-line">
						<div className="container py-8 sm:py-10">
							<h2 className="m-0 font-serif text-2xl font-bold">Stat by stat</h2>
							<div className="mt-4 overflow-hidden rounded-xl border border-lab-line">
								<ul className="m-0 list-none p-0">
									{graded.map((r) => {
										const y = data.yard[A.group]?.[r.key]
										const winner = r.edge === "a" ? A.name : r.edge === "b" ? B.name : null
										return (
											<li key={r.key} className="border-t border-lab-line px-4 py-3 first:border-t-0" data-testid="compare-row">
												<div className="flex flex-wrap items-baseline justify-between gap-2">
													<h3 className="m-0 text-sm font-semibold text-lab-ink">
														{r.info.label} {r.info.higher === false ? <span className="font-normal text-lab-muted">(lower is better)</span> : null}
													</h3>
													<span className="text-xs text-lab-muted">
														{winner ? `${winner} is ${r.strength === "clear" ? "clearly" : "slightly"} ahead` : "Too close to call"}
													</span>
												</div>
												<div className="mt-2 grid items-center gap-3 sm:grid-cols-[6rem_1fr_6rem]">
													<p className="m-0 font-mono text-sm font-bold tabular-nums sm:text-right">
														<span className="text-lab-muted">A </span>
														{formatStat(A.group, r.key, r.a.season.v)}
														<span className="block text-[10px] font-normal text-lab-muted">{r.a.season.r ? rankPhrase(r.a.season.r, y?.n ?? r.a.season.r) : ""}</span>
													</p>
													{y ? (
														<Yardstick
															marks={[
																{ v: r.a.season.v, se: r.a.season.se, name: A.name, color: "var(--pc-accent)" },
																{ v: r.b.season.v, se: r.b.season.se, name: B.name, color: colorB },
															]}
															yard={y}
															higher={r.info.higher}
															fmt={(v) => formatStat(A.group, r.key, v)}
															peers={GROUP_META[A.group].peers}
														/>
													) : (
														<span />
													)}
													<p className="m-0 font-mono text-sm font-bold tabular-nums">
														<span className="text-lab-muted">B </span>
														{formatStat(B.group, r.key, r.b.season.v)}
														<span className="block text-[10px] font-normal text-lab-muted">{r.b.season.r ? rankPhrase(r.b.season.r, y?.n ?? r.b.season.r) : ""}</span>
													</p>
												</div>
											</li>
										)
									})}
								</ul>
							</div>
							{style.length ? (
								<>
									<h3 className="m-0 mb-3 mt-8 font-serif text-xl font-bold">Style</h3>
									<ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
										{style.map((r) => (
											<li key={r.key} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm">
												<span className="font-semibold text-lab-ink">{r.info.label}</span>
												<span className="mt-1 block text-lab-soft">
													{A.name}: <span className="font-mono">{formatStat(A.group, r.key, r.a.season.v)}</span> &middot; {B.name}: <span className="font-mono">{formatStat(B.group, r.key, r.b.season.v)}</span>
												</span>
											</li>
										))}
									</ul>
								</>
							) : null}
							<p className="m-0 mt-5 max-w-3xl text-xs leading-relaxed text-lab-muted">&ldquo;Clearly ahead&rdquo; means the gap is bigger than what the plays behind each number could produce by chance. &ldquo;Slightly&rdquo; means it points one way but could still be noise.</p>
						</div>
</section>

					<section className="border-t border-lab-line bg-lab-tint" aria-labelledby="money-h" id="money">
						<div className="container py-8 sm:py-10">
							<h2 id="money-h" className="m-0 font-serif text-2xl font-bold">The money</h2>
							{money.length ? (
								<>
									<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Contract and cap numbers side by side. Bars share one scale, so the longer bar is the bigger number. A bigger number is not a better one: it is only what each is paid.</p>
									<div className="mt-4">
										<MoneyCompare rows={money} aName={A.name} bName={B.name} colorB={colorB} />
									</div>
									{valueA || valueB ? (
										<ul className="m-0 mt-5 grid list-none gap-3 p-0 md:grid-cols-2" data-testid="money-value">
											{valueA ? (
												<li className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft">{valueSentence(A.name, A.group, valueA)}</li>
											) : null}
											{valueB ? (
												<li className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft">{valueSentence(B.name, B.group, valueB)}</li>
											) : null}
										</ul>
									) : null}
									<p className="m-0 mt-4 max-w-3xl text-xs leading-relaxed text-lab-muted">
										Contract figures as of {contracts.asOf}, kept by hand for {contracts.teams.length} teams so far. A player on another team shows &ldquo;not tracked&rdquo;.{" "}
										<Link href="/lab/players/value" className="underline hover:text-lab-ink">
											See pay against play for every position
										</Link>
										.
									</p>
								</>
							) : (
								<p className="m-0 mt-2 max-w-3xl text-sm text-lab-soft">We do not have contract numbers for either player yet. They are kept by hand for {contracts.teams.length} teams so far ({contracts.teams.join(", ")}).</p>
							)}
						</div>
					</section>

				</div>
			) : (
				<section className="container py-10 sm:py-14">
					{A && B && A.group !== B.group ? (
						<p className="m-0 mb-6 max-w-2xl rounded-xl border border-lab-line-strong bg-lab-surface p-4 text-sm text-lab-soft">
							{A.name} is a {GROUP_META[A.group].single.toLowerCase()} and {B.name} is a {GROUP_META[B.group].single.toLowerCase()}, and they are measured on different stats. Pick two players who do the same job.
						</p>
					) : null}
					<h2 className="m-0 font-serif text-2xl font-bold">Try a comparison</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">Each Raider against the best player at his job right now.</p>
					<ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
						{suggest.map(({ p, best }) => (
							<li key={p.id + p.group}>
								<Link href={compareHref(p.slug, best.slug)} className="block rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm hover:border-lab-ink">
									<span className="font-semibold text-lab-ink">{p.name}</span> <span className="text-lab-muted">vs</span> <span className="font-semibold text-lab-ink">{best.name}</span>
									<span className="block text-xs text-lab-muted">{GROUP_META[p.group].title}</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab/players" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; All players
					</Link>
					<UnitsCredit />
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
