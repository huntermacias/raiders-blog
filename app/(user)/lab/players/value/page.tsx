import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UnitsCredit from "@/components/lab/UnitsCredit"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import { DOWN, EarlyChip, UP } from "@/components/lab/players/Bits"
import { TeamLogo } from "@/components/lab/players/Media"
import TrackView from "@/components/lab/players/TrackView"
import { getContracts } from "@/lib/lab/contractData"
import { MIN_POOL, VERDICT_WORD, money, valueBoard } from "@/lib/lab/contractsKit"
import { getPlayers } from "@/lib/lab/data"
import { GROUP_META, GROUP_ORDER } from "@/lib/lab/playersKit"
import { profileHref, teamName } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/players/value`
const DESCRIPTION = "Every player we have a contract and a grade for, ranked on how he has played against how he is paid: who is earning more than his contract and who is not, with the early reads marked."

export async function generateMetadata(): Promise<Metadata> {
	const title = "Pay against play: who earns his NFL contract | Raiders Rundown"
	return {
		title,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title, description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

const MARK = { underpaid: { m: "▲", c: UP }, fair: { m: "●", c: "text-lab-soft" }, overpaid: { m: "▼", c: DOWN } } as const

export default function ValuePage() {
	const data = getPlayers()
	const contracts = getContracts()
	const groups = GROUP_ORDER.filter((g) => g !== "pr" && g !== "kr")
		.map((g) => ({ g, rows: valueBoard(data, contracts, g) }))
		.filter((x) => x.rows.length >= MIN_POOL)
	const called = groups.flatMap((x) => x.rows.filter((r) => r.value.verdict && r.value.verdict !== "fair").map((r) => ({ ...r, g: x.g })))
	const bargains = called.filter((r) => r.value.verdict === "underpaid").sort((a, b) => b.value.gap - a.value.gap).slice(0, 5)
	const pricey = called.filter((r) => r.value.verdict === "overpaid").sort((a, b) => a.value.gap - b.value.gap).slice(0, 5)

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; Pay against play
					</p>
					<h1 className="mt-3 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Pay against play</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">
						Who has played better than his contract suggests, and who has not. Each player is ranked by overall grade and by yearly pay against the other players at his job on the {contracts.teams.length} teams whose contracts we track, and the gap between the two ranks is the read.
					</p>
					<p className="mt-3 max-w-2xl rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="value-caveat">
						This is a comparison among {contracts.teams.join(", ")} players only, so a rank here is a rank among those, not among the league. A player whose grade is still an early read is shown without a verdict, and a position with few players tracked is not called either way. Contract figures are as of {contracts.asOf}.
					</p>
					<TrackView event="board_view" props={{ board: "value" }} />
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-5" />
					<nav aria-label="Positions" className="mt-6">
						<ul className="m-0 flex list-none flex-wrap gap-2 p-0">
							{groups.map(({ g }) => (
								<li key={g}>
									<a href={`#value-${g}`} className="inline-block rounded-full border border-lab-line-strong px-3 py-1 text-xs font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink">
										{GROUP_META[g].title}
									</a>
								</li>
							))}
						</ul>
					</nav>
				</div>
			</section>

			{bargains.length || pricey.length ? (
				<section className="border-b border-lab-line bg-lab-tint" aria-label="The biggest gaps">
					<div className="container grid gap-8 py-8 sm:py-10 md:grid-cols-2">
						{[
							{ title: "Playing above his pay", rows: bargains, v: "underpaid" as const },
							{ title: "Paid above his play so far", rows: pricey, v: "overpaid" as const },
						].map((blk) => (
							<div key={blk.v}>
								<h2 className="m-0 flex items-center gap-2 font-serif text-2xl font-bold">
									<span aria-hidden="true" className={`text-sm ${MARK[blk.v].c}`}>{MARK[blk.v].m}</span>
									{blk.title}
								</h2>
								{blk.rows.length ? (
									<ol className="m-0 mt-3 list-none p-0">
										{blk.rows.map((r) => (
											<li key={r.p.slug} className="flex items-baseline justify-between gap-3 border-t border-lab-line py-2 first:border-t-0">
												<span className="min-w-0">
													<Link href={profileHref(r.p.slug)} className="font-semibold text-lab-ink hover:underline">
														{r.p.name}
													</Link>
													<span className="ml-2 text-xs text-lab-muted">
														{r.p.team} &middot; {r.p.pos}
													</span>
												</span>
												<span className="shrink-0 text-right font-mono text-xs text-lab-soft">
													#{r.value.gradeRank} play, #{r.value.payRank} pay
												</span>
											</li>
										))}
									</ol>
								) : (
									<p className="m-0 mt-3 text-sm text-lab-soft">No one is far enough apart yet to call.</p>
								)}
							</div>
						))}
					</div>
				</section>
			) : null}

			{groups.map(({ g, rows }, i) => (
				<section key={g} className={`scroll-mt-24 border-b border-lab-line ${i % 2 ? "bg-lab-tint" : ""}`} aria-labelledby={`value-h-${g}`} id={`value-${g}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`value-h-${g}`} className="m-0 font-serif text-2xl font-bold">
							{GROUP_META[g].title}
						</h2>
						<p className="m-0 mt-1 text-sm text-lab-soft">
							{rows.length} {GROUP_META[g].peers} with a grade and a contract: settled grades first, biggest gap in his favor first, early reads last.
						</p>
						<div className="mt-4 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface">
							<table className="w-full min-w-[34rem] border-collapse text-left text-sm" data-testid="value-table">
								<thead>
									<tr className="text-[11px] uppercase tracking-[0.1em] text-lab-muted">
										<th scope="col" className="px-4 py-2 font-semibold">Player</th>
										<th scope="col" className="px-3 py-2 text-right font-semibold">Play</th>
										<th scope="col" className="px-3 py-2 text-right font-semibold">Pay</th>
										<th scope="col" className="px-3 py-2 text-right font-semibold">Per year</th>
										<th scope="col" className="px-3 py-2 text-right font-semibold">Cap hit</th>
										<th scope="col" className="px-4 py-2 font-semibold">Read</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r) => (
										<tr key={r.p.slug} className="border-t border-lab-line" data-testid="value-row">
											<th scope="row" className="px-4 py-2 font-normal">
												<span className="flex items-center gap-2">
													<TeamLogo team={r.p.team} size={16} />
													<Link href={profileHref(r.p.slug)} className="font-semibold text-lab-ink hover:underline">
														{r.p.name}
													</Link>
													<span className="sr-only">{teamName(r.p.team)}</span>
												</span>
											</th>
											<td className="px-3 py-2 text-right font-mono tabular-nums">{r.value.gradeRank} of {r.value.of}</td>
											<td className="px-3 py-2 text-right font-mono tabular-nums">{r.value.payRank} of {r.value.of}</td>
											<td className="px-3 py-2 text-right font-mono tabular-nums">{r.deal.apy !== null ? money(r.deal.apy) : "–"}</td>
											<td className="px-3 py-2 text-right font-mono tabular-nums">{money(r.deal.cap)}</td>
											<td className="px-4 py-2">
												{r.value.verdict ? (
													<span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] ${MARK[r.value.verdict].c}`}>
														<span aria-hidden="true" className="text-[9px]">{MARK[r.value.verdict].m}</span>
														{VERDICT_WORD[r.value.verdict]}
													</span>
												) : (
													<EarlyChip label={r.value.early ? "Early read" : "Too few to call"} />
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			))}

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
