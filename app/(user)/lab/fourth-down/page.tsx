import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import CardFigure from "@/components/lab/CardFigure"
import { labColorVars } from "@/lib/lab/colors"
import { gameSlug, getFourthDown, getGames, getSeason } from "@/lib/lab/data"
import { CAVEAT, VERDICTS, choiceText, explain, gameLine, ptsText, seasonTotals, spotText } from "@/lib/lab/fourthDown"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/fourth-down`

const stampOf = () => Date.parse(getSeason().generatedAt) || 0

export function generateMetadata(): Metadata {
	const t = seasonTotals(getFourthDown().games)
	const title = "Raiders fourth-down report card | Raiders Rundown"
	const description = t.graded
		? `Every Raiders fourth down this season, graded against similar spots from 2019 on. ${t.bestOrClose} of ${t.graded} graded calls were the best option or a toss-up, with ${ptsText(t.leftOnTable)} of win probability left on the table in all.`
		: "Every Raiders fourth down this season, graded against similar spots from 2019 on."
	const card = `${SITE_URL}/api/og?type=lab&slug=season&view=fourth&v=${stampOf()}`
	return {
		title,
		description,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title, description, url: PAGE_URL, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: "The Raiders' fourth-down report card" }] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
		other: { "og:image": card },
	}
}

export default function FourthDownPage() {
	const season = getSeason()
	const data = getFourthDown()
	const games = getGames()
	const t = seasonTotals(data.games)
	const latest = games[games.length - 1]
	const byWeek = (w: number) => games.find((g) => g.week === w)
	const worst = data.games
		.flatMap((g) => g.decisions.map((d) => ({ d, week: g.week })))
		.filter((x) => x.d.verdict === "questionable" || x.d.verdict === "costly")
		.sort((a, b) => (b.d.cost ?? 0) - (a.d.cost ?? 0))
		.slice(0, 5)

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(latest?.opp ?? "")}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {season.season} season
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">The fourth-down report card</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">
						Go for it, punt or kick? Every Raiders fourth down is compared with what happened after similar ones from 2019 to last season.
					</p>
					<dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{[
							{ label: "Fourth downs", value: String(t.decisions), note: `${t.graded} graded` },
							{ label: "Best call or toss-up", value: t.graded ? `${t.bestOrClose} of ${t.graded}` : "None", note: "graded calls" },
							{ label: "Went for it", value: t.wentFor ? `${t.converted} of ${t.wentFor}` : "0", note: "converted" },
							{ label: "Left on the table", value: ptsText(t.leftOnTable), note: "of win probability, all games added up" },
						].map((x) => (
							<div key={x.label} className="rounded-xl border border-lab-line bg-lab-tint p-4">
								<dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{x.label}</dt>
								<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl">{x.value}</dd>
								<dd className="m-0 mt-0.5 text-xs text-lab-muted">{x.note}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section className="container py-10 sm:py-14" aria-labelledby="worst-heading">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
					<div>
						<h2 id="worst-heading" className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{worst.length ? "The calls worth a second look" : "No calls worth a second look"}
						</h2>
						{worst.length ? (
							<ol className="m-0 mt-5 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
								{worst.map((x, i) => {
									const g = byWeek(x.week)
									const v = x.d.verdict ? VERDICTS[x.d.verdict] : null
									return (
										<li key={i} className="p-4 sm:p-5">
											<div className="flex flex-wrap items-baseline justify-between gap-x-4">
												<h3 className="font-serif text-lg font-bold">
													{spotText(x.d)}
													{g ? (
														<span className="ml-2 text-sm font-normal text-lab-muted">
															<Link href={`/lab/${gameSlug(g)}`} className="underline-offset-4 hover:text-lab-ink hover:underline">
																Week {x.week} vs {g.oppName}
															</Link>
														</span>
													) : null}
												</h3>
												<p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-lab-soft">{v?.label}</p>
											</div>
											<p className="m-0 mt-1 text-sm text-lab-soft">{choiceText(x.d.chosen, x.d.result)}</p>
											<p className="m-0 mt-1 text-sm leading-relaxed text-lab-muted">{explain(x.d)}</p>
										</li>
									)
								})}
							</ol>
						) : null}
					</div>
					<CardFigure src={`/api/og?type=lab&slug=season&view=fourth&v=${stampOf()}`} alt={`Fourth-down report card: ${t.bestOrClose} of ${t.graded} graded calls were the best option or a toss-up.`} filename="raiders-fourth-downs-season.png" caption="Season share card" />
				</div>
			</section>

			<section className="container pb-10 sm:pb-14" aria-labelledby="games-heading">
				<h2 id="games-heading" className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
					Game by game
				</h2>
				<ul className="m-0 mt-5 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
					{data.games.map((fg) => {
						const g = byWeek(fg.week)
						if (!g) return null
						return (
							<li key={fg.id}>
								<Link href={`/lab/${gameSlug(g)}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-lab-hover sm:px-5">
									<span className="font-semibold">
										Week {fg.week}: {g.home ? "vs" : "at"} the {g.oppName}
									</span>
									<span className="text-sm text-lab-muted">{gameLine(fg)}</span>
								</Link>
							</li>
						)
					})}
				</ul>
				<p className="mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted">{CAVEAT}</p>
			</section>

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<Credit>Win probability is the nflverse model&rsquo;s. </Credit>
				</div>
			</section>
		</div>
	)
}
