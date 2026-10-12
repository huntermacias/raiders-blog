import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UnitsCredit from "@/components/lab/UnitsCredit"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import SituationBoard from "@/components/lab/players/SituationBoard"
import TrackView from "@/components/lab/players/TrackView"
import { getPlayers } from "@/lib/lab/data"
import { getSituations } from "@/lib/lab/situationData"
import { METRIC_WHAT, METRICS, ROLE, SIT_BOARDS, minPlaysFor, SPLIT_CHOICES, sitBoardHref, sitBoardOf, sitBoardRows } from "@/lib/lab/situationsKit"
import { GROUP_META } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

export const dynamicParams = false

export function generateStaticParams() {
	return SIT_BOARDS.map((b) => ({ board: b.slug }))
}

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata(props: { params: Promise<{ board: string }> }): Promise<Metadata> {
	const { board } = await props.params
	const def = sitBoardOf(board)
	if (!def) return { title: "Players | Raiders Rundown" }
	const title = `${def.title} on 3rd down, in the red zone and by distance: NFL ranked | Raiders Rundown`
	const description = `Every NFL ${GROUP_META[def.group].single.toLowerCase()} ranked on how he does on each down, at each distance and inside the 20: success rate, ${ROLE[def.role].label.ypp.toLowerCase()}, EPA and first-down rate against the league average.`
	const url = `${SITE_URL}${sitBoardHref(board)}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function SituationBoardPage(props: { params: Promise<{ board: string }> }) {
	const { board } = await props.params
	const def = sitBoardOf(board)
	if (!def) notFound()
	const data = getPlayers()
	const sit = getSituations()
	const meta = GROUP_META[def.group]
	const role = ROLE[def.role]
	const rows = sitBoardRows(sit, data.players, def)
	const league = sit.league[`${def.role}.${def.group}`] ?? {}
	const mins = Object.fromEntries(SPLIT_CHOICES.map((s) => [s.key, minPlaysFor(sit, def, s.key)]))
	const teams = Array.from(new Set(rows.map((r) => r.team))).sort()
	const url = `${SITE_URL}${sitBoardHref(board)}`
	const ld = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
			{ "@type": "ListItem", position: 2, name: "Players", item: `${SITE_URL}/lab/players` },
			{ "@type": "ListItem", position: 3, name: def.title, item: url },
		],
	}
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; <span className="text-lab-soft">Situational football</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{def.title}: down, distance and the red zone</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						Who actually delivers on 3rd down, on 3rd and short, or inside the 20? Every {meta.single.toLowerCase()} in the league, ranked in the spot you pick. {role.blurb} A box score cannot say whether a player&apos;s yards came when the offense needed them, and this can.
					</p>
					<p className="m-0 mt-3 max-w-3xl border-l-2 border-lab-line-strong pl-3 text-sm leading-relaxed text-lab-muted">
						<span className="font-semibold text-lab-soft">Success rate: </span>
						{METRIC_WHAT.sr}
					</p>
					<TrackView event="situation_board_view" props={{ board }} />
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-4" />
				</div>
			</section>

			<section className="container py-8 sm:py-10" aria-label="Pick another job">
				<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
					{SIT_BOARDS.map((b) => (
						<li key={b.slug}>
							<Link
								href={sitBoardHref(b.slug)}
								aria-current={b.slug === board ? "page" : undefined}
								className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${b.slug === board ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
							>
								{b.title}
							</Link>
						</li>
					))}
				</ul>
				<div className="mt-6">
					{rows.length ? (
						<SituationBoard role={def.role} peers={meta.peers} single={meta.single} rows={rows} league={league} mins={mins} teams={teams} />
					) : (
						<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">Nobody has enough plays yet. This fills in as the season goes on.</p>
					)}
				</div>
				<details className="mt-8 max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
					<summary className="cursor-pointer text-sm font-semibold text-lab-ink">How to read this table</summary>
					<ul className="mb-2 mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
						<li>The number on the left is the rank among every {meta.single.toLowerCase()} with enough {role.nouns} in the spot you picked, even when the list is filtered to one team.</li>
						<li>The first row is the league average in that spot. A green arrow means a player is better than it, a red arrow worse, and a dot means about the same. Every arrow has a word beside it for screen readers.</li>
						{METRICS.map((m) => (
							<li key={m}>
								<span className="font-semibold text-lab-soft">{role.label[m]}.</span> {METRIC_WHAT[m]}
							</li>
						))}
						<li>Small spots mean small samples. The minimum starts where the season&apos;s ranking does, and you can lower it to see everyone, at your own risk.</li>
					</ul>
				</details>
			</section>
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
