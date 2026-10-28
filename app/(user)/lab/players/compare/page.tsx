import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import type { ShareVariant } from "@/components/lab/ShareCard"
import CompareBars from "@/components/lab/players/CompareBars"
import CompareControls from "@/components/lab/players/CompareControls"
import ComparePicker from "@/components/lab/players/ComparePicker"
import CompareCross from "@/components/lab/players/CompareCross"
import CompareHero from "@/components/lab/players/CompareHero"
import V2Compare from "@/components/lab/v2/V2Compare"
import { isV2, type V2Row } from "@/lib/lab/v2/types"
import CompareRadar from "@/components/lab/players/CompareRadar"
import CompareSeasons from "@/components/lab/players/CompareSeasons"
import CompareShare from "@/components/lab/players/CompareShare"
import MoneyCompare from "@/components/lab/players/MoneyCompare"
import ProgressLine from "@/components/lab/players/ProgressLine"
import TrackView from "@/components/lab/players/TrackView"
import UnitsCredit from "@/components/lab/UnitsCredit"
import {
	type CompareConfig,
	MAX_METRICS,
	RANGE_IDS,
	buildComparison,
	compareUrl,
	configQuery,
	crossDebates,
	featuredDebates,
	nameOf,
	peersWord,
	rangeLabels,
	readConfig,
	resolvePair,
	shareText,
	spotlightOf,
	viewsFor,
} from "@/lib/lab/compareKit"
import { getContracts } from "@/lib/lab/contractData"
import { coverageWords, dealFor, moneyRows, payRank, valueFor, valueSentence } from "@/lib/lab/contractsKit"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { getPlayerHistory } from "@/lib/lab/playerHistoryData"
import { seasonsOf } from "@/lib/lab/seasonKit"
import { labColorVarsB } from "@/lib/lab/colors"
import { cardStyle, compareHref, sideColors } from "@/lib/lab/playerView"
import { GROUP_META, HEADLINE, STAT, UNIT_NOTE, isCore, lineRecord, searchIndex, statInfo, trailOf } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"
import { compareMetadata } from "@/lib/lab/compareMeta"

const SITE_URL = "https://www.raidersrundown.com"

type Search = { a?: string; b?: string; r?: string; m?: string; g?: string; y?: string; ya?: string; yb?: string }

const possessive = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`)

const stampOf = (generatedAt: string) => {
	const t = Date.parse(generatedAt)
	return Number.isFinite(t) ? t : 0
}

export async function generateMetadata(props: { searchParams: Promise<Search> }): Promise<Metadata> {
	return compareMetadata(await props.searchParams)
}

function problemText(p: ReturnType<typeof resolvePair>, cfg: CompareConfig, current: number): string | null {
	if (!("problem" in p)) return null
	if (p.problem === "same") return "That is one player twice in the same season. Pick someone else for the other side, or set him against himself in another season."
	if (p.problem === "missing" && (cfg.sa !== null || cfg.sb !== null)) {
		const who = !p.a ? cfg.a : cfg.b
		return `We have no ${(!p.a ? cfg.sa : cfg.sb) ?? current} line for ${who.replace(/-/g, " ")}. Try another season, or the one being played.`
	}
	if (p.problem === "jobs" && p.a && p.b) {
		return `${p.a.name} is a ${GROUP_META[p.a.group].single.toLowerCase()} and ${p.b.name} is a ${GROUP_META[p.b.group].single.toLowerCase()}, and they are measured on different stats, with none defined the same way. Pick two players at one position, or across positions that share stats: wide receivers and tight ends, a running back and a receiver, edge rushers and interior linemen, cornerbacks and safeties.`
	}
	return null
}

export default async function ComparePage(props: { searchParams: Promise<Search> }) {
	const q = await props.searchParams
	const data = getPlayers()
	const logs = getPlayerLogs().logs
	const history = getPlayerHistory()
	const cfg: CompareConfig = readConfig(q)
	const index = searchIndex(data)
	const entry = (slug?: string) => (slug ? (index.find((e) => e.slug === slug) ?? null) : null)
	const views = viewsFor(data, cfg, history)
	const pair = cfg.a && cfg.b ? resolvePair(views.a, cfg, views.b) : null
	const c = pair && !("problem" in pair) ? buildComparison(data, cfg, history) : null
	// A past season is a whole, finished season: no recent-games ranges, no season-long trail by week, and the contract is today's.
	const past = c ? c.seasons.a !== data.season || c.seasons.b !== data.season : false
	const an = c ? nameOf(c, "a") : ""
	const bn = c ? nameOf(c, "b") : ""
	const stamp = stampOf(data.generatedAt)

	const contracts = getContracts()
	const A = c?.a ?? null
	const B = c?.b ?? null
	const dealA = A && !past ? dealFor(data, contracts, A.slug) : null
	const dealB = B && !past ? dealFor(data, contracts, B.slug) : null
	const money = A && B ? moneyRows(dealA, dealB, dealA ? payRank(data, contracts, A.slug) : null, dealB ? payRank(data, contracts, B.slug) : null) : []
	const valueA = dealA && A ? valueFor(data, contracts, A.slug) : null
	const valueB = dealB && B ? valueFor(data, contracts, B.slug) : null

	const colors = A && B ? sideColors(A.team, B.team) : null
	const pageStyle = A && B ? { ...cardStyle(A.team), ...(B.team !== "LV" && B.team !== A.team ? labColorVarsB(B.team) : {}) } : undefined

	// What the controls offer: the three stretches (one with nothing to compare is greyed out), every stat for this job, and the default set.
	const ranges = c
		? RANGE_IDS.map((id) => {
				if (past) return id === "season" ? { id, label: c.rangeName, weeks: c.rangeWeeks, disabled: false } : { id, label: rangeLabels(data, c.a, id).name, weeks: "", disabled: true }
				const l = rangeLabels(data, c.a, id)
				const has = id === c.range ? c.metrics.length > 0 : (buildComparison(data, { ...cfg, range: id, metrics: null }, history)?.metrics.length ?? 0) > 0
				return { id, label: l.name, weeks: l.weeks, disabled: !has }
			})
		: []
	const defaults = c ? (cfg.metrics ? (buildComparison(data, { ...cfg, metrics: null }, history)?.metrics ?? c.metrics) : c.metrics).map((m) => m.key) : []

	// The graphics on offer: a head to head always; a radar when there are three stats with a percentile each; a case for each player when he has enough to say.
	const variants: ShareVariant[] = c
		? [
				{ id: "h2h", name: "Head to head", hint: "Both players, both grades and the stats side by side. The default link preview.", params: "f=h2h", alt: `${an} against ${bn}, stat by stat` },
				...(c.radar.length >= 3 ? [{ id: "radar", name: "Radar", hint: "The shape of each player across the stats you chose.", params: "f=radar", alt: `Radar chart of ${an} and ${bn}` }] : []),
				...(["a", "b"] as const)
					.filter((side) => spotlightOf(c, side, 4).length >= 2)
					.map((side) => {
						const p = side === "a" ? c.a : c.b
						const shown = nameOf(c, side)
						return { id: `spot-${side}`, name: `${possessive(p.name.split(" ").slice(-1)[0])} case`, hint: c.cross ? `${shown}'s strongest numbers among ${c.cross.pool}.` : `${shown}'s strongest numbers against his position.`, params: `f=spot&side=${side}`, alt: `${shown}'s strongest numbers` }
					}),
			]
		: []

	// A line's chart opens on his own stat: his headline is the line's, which both men on one line share.
	let trail: { key: string; label: string; pa: { w: number; pct: number | null }[]; pb: { w: number; pct: number | null }[] } | null = null
	// Across positions a weekly rank is a rank at each man's own position, so there is no one line to draw for both.
	if (c && A && B && !past && !c.cross) {
		const key = statInfo(A.group, HEADLINE[A.group])?.unit ? (Object.keys(STAT[A.group]).find((k) => isCore(A.group, k)) ?? HEADLINE[A.group]) : HEADLINE[A.group]
		const pa = trailOf(logs[A.slug]?.[A.group], key).map((t) => ({ w: t[0], pct: t[3] }))
		const pb = trailOf(logs[B.slug]?.[B.group], key).map((t) => ({ w: t[0], pct: t[3] }))
		if (pa.filter((x) => x.pct !== null).length + pb.filter((x) => x.pct !== null).length >= 2) trail = { key, label: statInfo(A.group, key)!.label, pa, pb }
	}

	const debates = featuredDebates(data, 10)
	const acrossDebates = crossDebates(data, 4)
	const note = pair ? problemText(pair, cfg, data.season) : null
	// A man set against nobody can be set against himself in another season.
	const self = pair && "problem" in pair && pair.problem === "same" ? seasonsOf(data, history, cfg.a).filter((y) => y !== data.season) : []

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-8 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; Compare
					</p>
					<h1 className="mt-3 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Settle the debate</h1>
					<p className="mt-3 max-w-2xl text-base leading-relaxed text-lab-soft">Put two players side by side. For each stat you see where both rank in the league, who is ahead, and whether the gap is bigger than the noise a few plays create. Then post the graphic.</p>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-lab-muted" data-testid="pairing-help">
						Same position, or across positions on the stats they share: receivers and tight ends, a running back against a receiver, edge rushers against interior linemen, corners against safeties.
					</p>
					<div className="mt-6 max-w-3xl">
						<ComparePicker key={`${cfg.a}|${cfg.b}|${cfg.sa}|${cfg.sb}`} index={index} a={entry(c?.a.slug ?? cfg.a)} b={entry(c?.b.slug ?? cfg.b)} range={cfg.range} sa={cfg.sa} sb={cfg.sb} />
					</div>
					{c ? <TrackView event="player_compare" props={{ a: c.a.slug, b: c.b.slug, group: c.group, cross: c.cross?.family ?? "none", range: c.range, sa: c.seasons.a, sb: c.seasons.b }} /> : null}
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-5" />
				</div>
			</section>

			{c && A && B && colors ? (
				<div className="lab-opp lab-opp2" style={pageStyle}>
					<section className="container py-6 sm:py-10">
						<CompareHero data={data} c={c} />
						<CompareCross c={c} />
						{isV2(data) && c.range === "season" && c.seasons.a === data.season && c.seasons.b === data.season && c.a.group === c.b.group && !lineRecord(data, c.a) ? <V2Compare data={data} a={c.a as V2Row} b={c.b as V2Row} colors={colors} /> : null}
						{c.early.a || c.early.b ? (
							<p className="m-0 mt-3 max-w-3xl text-xs leading-relaxed text-lab-muted" data-testid="early-note">
								Early read: {c.early.a && c.early.b ? `${an} and ${bn} have` : `${c.early.a ? an : bn} has`} played little so far, so these numbers move fast.
							</p>
						) : null}
					</section>

					<section className="border-t border-lab-line bg-lab-tint" aria-label="Choose what is compared">
						<div className="container py-6">
							<div className="mb-3">
								<CompareSeasons
									cfg={{ ...cfg, a: A.slug, b: B.slug }}
									current={data.season}
									a={{ name: A.name, seasons: seasonsOf(data, history, A.slug, c.group), shown: c.seasons.a }}
									b={{ name: B.name, seasons: seasonsOf(data, history, B.slug, B.group), shown: c.seasons.b }}
								/>
							</div>
							<CompareControls
								cfg={{ ...cfg, a: A.slug, b: B.slug, range: c.range }}
								ranges={ranges}
								options={c.options.map((m) => ({ key: m.key, label: m.label, luck: m.signal === "luck" }))}
								selected={c.metrics.map((m) => m.key)}
								defaults={defaults}
								max={MAX_METRICS}
							/>
						</div>
					</section>

					{c.metrics.length === 0 ? (
						<section className="container py-10">
							<p className="m-0 max-w-2xl rounded-xl border border-lab-line-strong bg-lab-surface p-4 text-sm text-lab-soft">
								{an} and {bn} do not have a stat in common over {c.rangeName.toLowerCase()}. Try {past ? "another season" : "another stretch of games"}.
							</p>
						</section>
					) : (
						<>
							<section className="border-t border-lab-line" aria-labelledby="shape-h">
								<div className="container py-8 sm:py-10">
									<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
										{c.radar.length >= 3 ? (
											<div>
												<h2 id="shape-h" className="m-0 font-serif text-2xl font-bold">
													The shape of each player
												</h2>
												<p className="m-0 mb-3 mt-1 max-w-xl text-sm text-lab-soft">{c.cross ? `Each spoke is a stat both positions share. The farther out a point sits, the better he ranks among all ${peersWord(c)}.` : "Each spoke is a stat. The farther out a point sits, the better he ranks at his job."}</p>
												<CompareRadar axes={c.radar} aName={an} bName={bn} colorA={colors.a} colorB={colors.b} />
											</div>
										) : null}
										<div className={c.radar.length >= 3 ? "" : "lg:col-span-2"}>
											<h2 id={c.radar.length >= 3 ? undefined : "shape-h"} className="m-0 font-serif text-2xl font-bold">
												What the numbers say
											</h2>
											<ul className="m-0 mt-3 grid list-none gap-3 p-0" data-testid="takeaways">
												{c.insights.map((t, i) => (
													<li key={i} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft">
														{t}
													</li>
												))}
											</ul>
											<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">{c.basis}</p>
										</div>
									</div>
								</div>
							</section>

							<section className="border-t border-lab-line" aria-labelledby="stats-h">
								<div className="container py-8 sm:py-10">
									<h2 id="stats-h" className="m-0 font-serif text-2xl font-bold">
										Stat by stat
									</h2>
									<p className="m-0 mb-4 mt-1 max-w-3xl text-sm text-lab-soft">{c.rangeName}. {c.rangeWeeks}.</p>
									<CompareBars c={c} colorA={colors.a} colorB={colors.b} />
									<p className="m-0 mt-4 max-w-3xl text-xs leading-relaxed text-lab-muted">&ldquo;Clear lead&rdquo; means the gap is bigger than what the plays behind each number could produce by chance. &ldquo;Slight edge&rdquo; points one way but could still be noise.</p>

									{c.style.length ? (
										<>
											<h3 className="m-0 mb-3 mt-8 font-serif text-xl font-bold">Style</h3>
											<ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
												{c.style.map((m) => (
													<li key={m.key} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm">
														<span className="font-semibold text-lab-ink">{m.label}</span>
														<span className="mt-1 block text-lab-soft">
															{an}: <span className="font-mono">{m.a.text}</span> &middot; {bn}: <span className="font-mono">{m.b.text}</span>
														</span>
													</li>
												))}
											</ul>
										</>
									) : null}
									{c.line.length ? (
										<>
											<h3 className="m-0 mb-1 mt-8 font-serif text-xl font-bold">Their lines</h3>
											<p className="m-0 mb-3 max-w-3xl text-sm text-lab-soft">{UNIT_NOTE} They are shown side by side, not scored.</p>
											<ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="line-rows">
												{c.line.map((m) => (
													<li key={m.key} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm">
														<span className="font-semibold text-lab-ink">{m.label}</span>
														<span className="mt-1 block text-lab-soft">
															{an}: <span className="font-mono">{m.a.text}</span> &middot; {bn}: <span className="font-mono">{m.b.text}</span>
														</span>
													</li>
												))}
											</ul>
										</>
									) : null}
								</div>
							</section>

							{trail ? (
								<section className="border-t border-lab-line bg-lab-tint">
									<div className="container py-8 sm:py-10">
										<h2 className="m-0 font-serif text-2xl font-bold">The year so far: {trail.label}</h2>
										<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">
											Where each has ranked among {GROUP_META[A.group].peers} after every week. Solid line is {A.name}, dashed is {B.name}.
										</p>
										<div className="mt-4 max-w-3xl">
											<ProgressLine weeks={data.weeks} points={trail.pa} second={{ points: trail.pb, color: colors.b }} formWeeks={data.formWeeks} label={`${A.name} and ${B.name}, ${trail.label}: season-to-date rank among their peers after each week.`} />
										</div>
									</div>
								</section>
							) : null}

							<section className="border-t border-lab-line" aria-labelledby="share-h" id="share">
								<div className="container py-8 sm:py-12">
									<h2 id="share-h" className="m-0 mb-5 font-serif text-2xl font-bold sm:text-3xl">
										Make it a graphic
									</h2>
									<CompareShare
										query={configQuery({ ...cfg, a: A.slug, b: B.slug })}
										stamp={stamp}
										text={shareText(c)}
										a={{ slug: A.slug, name: an }}
										b={{ slug: B.slug, name: bn }}
										group={c.cross ? `${c.cross.tags.a}-${c.cross.tags.b}` : c.group}
										variants={variants}
									/>
								</div>
							</section>
						</>
					)}

					{past ? null : (
					<section className="border-t border-lab-line bg-lab-tint" aria-labelledby="money-h" id="money">
						<div className="container py-8 sm:py-10">
							<h2 id="money-h" className="m-0 font-serif text-2xl font-bold">
								The money
							</h2>
							{money.length ? (
								<>
									<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Contract and cap numbers side by side. Bars share one scale, so the longer bar is the bigger number. A bigger number is not a better one: it is only what each is paid.</p>
									<div className="mt-4">
										<MoneyCompare rows={money} aName={A.name} bName={B.name} colorB={colors.b} />
									</div>
									{valueA || valueB ? (
										<ul className="m-0 mt-5 grid list-none gap-3 p-0 md:grid-cols-2" data-testid="money-value">
											{valueA ? <li className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft">{valueSentence(A.name, A.group, valueA)}</li> : null}
											{valueB ? <li className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft">{valueSentence(B.name, B.group, valueB)}</li> : null}
										</ul>
									) : null}
									<p className="m-0 mt-4 max-w-3xl text-xs leading-relaxed text-lab-muted">
										Contract figures as of {contracts.asOf}, read from public cap pages for {coverageWords(contracts)}. A player with no row there, such as a practice-squad name, shows &ldquo;not tracked&rdquo;.{" "}
										<Link href="/lab/players/value" className="underline hover:text-lab-ink">
											See pay against play for every position
										</Link>
										.
									</p>
								</>
							) : (
								<p className="m-0 mt-2 max-w-3xl text-sm text-lab-soft">We have no contract row for either player. The file covers {coverageWords(contracts)}, but a practice-squad or just-signed player may not be on it yet.</p>
							)}
						</div>
					</section>
					)}
				</div>
			) : (
				<section className="container py-10 sm:py-14">
					{note ? <p className="m-0 mb-6 max-w-2xl rounded-xl border border-lab-line-strong bg-lab-surface p-4 text-sm text-lab-soft">{note}</p> : null}
					{self.length ? (
						<ul className="m-0 mb-6 flex list-none flex-wrap gap-2 p-0" data-testid="self-seasons">
							{self.map((y) => (
								<li key={y}>
									<Link href={compareUrl({ ...cfg, sa: y, sb: null })} rel="nofollow" className="inline-flex min-h-[44px] items-center rounded-xl border border-lab-line-strong bg-lab-surface px-4 py-2 text-sm font-semibold text-lab-ink hover:border-lab-ink">
										{y} against {data.season}
									</Link>
								</li>
							))}
						</ul>
					) : null}
					<h2 className="m-0 font-serif text-2xl font-bold">Start with a debate</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">Each Raider against the best player at his job right now, and the top two at the biggest positions.</p>
					<ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="debates">
						{debates.map(({ a, b, tag }) => (
							<li key={`${a.slug}|${b.slug}`}>
								<Link href={compareHref(a.slug, b.slug)} rel="nofollow" className="block rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm transition hover:border-lab-ink">
									<span className="font-semibold text-lab-ink">{a.name}</span> <span className="text-lab-muted">vs</span> <span className="font-semibold text-lab-ink">{b.name}</span>
									<span className="block text-xs text-lab-muted">{tag}</span>
								</Link>
							</li>
						))}
					</ul>
					{acrossDebates.length ? (
						<>
							<h2 className="m-0 mt-10 font-serif text-2xl font-bold">Across positions</h2>
							<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Different jobs, compared only on the stats both are measured on the same way.</p>
							<ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="cross-debates">
								{acrossDebates.map(({ a, b, tag }) => (
									<li key={`${a.slug}|${b.slug}`}>
										<Link href={compareHref(a.slug, b.slug)} rel="nofollow" className="block rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm transition hover:border-lab-ink">
											<span className="font-semibold text-lab-ink">{a.name}</span> <span className="text-lab-muted">vs</span> <span className="font-semibold text-lab-ink">{b.name}</span>
											<span className="block text-xs text-lab-muted">{tag}</span>
										</Link>
									</li>
								))}
							</ul>
						</>
					) : null}
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
