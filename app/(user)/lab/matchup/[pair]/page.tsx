import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import { labWeeks } from "@/lib/lab/toolsData"
import MatchupReport from "@/components/lab/MatchupReport"
import ShareCard from "@/components/lab/ShareCard"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getUnits } from "@/lib/lab/data"
import { MATCHUP_SHARE_PATH, matchupQuery, viewText } from "@/lib/lab/matchupShare"
import { matchupFor, namesFor, parsePair } from "@/lib/lab/units"
import { canonicalPair, kickoffText, marketLine, matchupPath } from "@/lib/lab/unitsKit"
import { pairTheme } from "@/lib/lab/unitsTheme"
import { teamByAbbr } from "@/lib/nfl"

const SITE_URL = "https://www.raidersrundown.com"

// Every Raiders matchup and every game on the coming slate is built ahead of time; any other pairing is built the first time it is asked for.
export const dynamicParams = true

export function generateStaticParams() {
	const data = getUnits()
	const pairs = new Set<string>()
	for (const abbr of Object.keys(data.teams)) if (abbr !== "LV") pairs.add(matchupPath("LV", abbr))
	for (const g of data.slate?.games ?? []) pairs.add(matchupPath(g.away, g.home))
	return Array.from(pairs).map((p) => ({ pair: p.split("/").pop() as string }))
}

type Props = { params: Promise<{ pair: string }> }

function titleFor(a: string, b: string) {
	const n = namesFor(a, b)
	return `${n[a]} vs ${n[b]}: position-group matchup`
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const parsed = parsePair((await props.params).pair)
	if (!parsed) return { title: "The Lab | Raiders Rundown" }
	const [a, b] = canonicalPair(parsed.a, parsed.b)
	const data = getUnits()
	const title = `${titleFor(a, b)} | Raiders Rundown`
	const description = `${matchupFor(a, b).line} Quarterback, line, receivers, run game, pass rush, run defense and coverage for the ${teamByAbbr(a).name} and the ${teamByAbbr(b).name}, plus coaches and injuries.`
	const url = `${SITE_URL}${matchupPath(a, b)}`
	const card = `${SITE_URL}/api/og?type=matchup&${matchupQuery(a, b, "overview")}&size=wide&v=${Date.parse(data.generatedAt) || 0}`
	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: { type: "article", title, description, url, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: titleFor(a, b) }] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
		other: { "og:image": card },
	}
}

export default async function MatchupPage(props: Props) {
	const slug = (await props.params).pair
	const parsed = parsePair(slug)
	if (!parsed) notFound()
	const [a, b] = canonicalPair(parsed.a, parsed.b)
	// One address per pairing, so a link shared either way round lands on the same page.
	if (slug.toLowerCase() !== matchupPath(a, b).split("/").pop()) permanentRedirect(matchupPath(a, b))

	const data = getUnits()
	const names = namesFor(a, b)
	const theme = pairTheme(a, b)
	const stamp = Date.parse(data.generatedAt) || 0
	const game = data.slate?.games.find((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)) ?? null
	const line = matchupFor(a, b).line

	return (
		<div className={`${theme.className} min-h-screen bg-lab-page text-lab-ink`} style={theme.style}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot;{" "}
						<Link href="/lab/matchups" className="hover:text-lab-ink">
							Matchups
						</Link>
					</p>
					<div className="mt-3 flex flex-wrap items-start justify-between gap-4">
						<h1 className="m-0 max-w-4xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{titleFor(a, b)}</h1>
						<ShareCard
							target={{ type: "matchup", query: matchupQuery(a, b, "overview"), sharePath: MATCHUP_SHARE_PATH, name: `${names[a]} vs ${names[b]}`, file: `raiders-rundown-${a.toLowerCase()}-vs-${b.toLowerCase()}-matchup` }}
							stamp={stamp}
							text={viewText("overview", { a: names[a], b: names[b] }, line).text}
							alt={viewText("overview", { a: names[a], b: names[b] }, line).alt}
						/>
					</div>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">{line}</p>
					{game ? (
						<p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm tabular-nums text-lab-muted">
							<span>
								Week {data.slate!.week}: {names[game.away]} at {names[game.home]}
							</span>
							<span>{kickoffText(game.day, game.time)}</span>
							{marketLine(game, names) ? <span>{marketLine(game, names)}</span> : null}
						</p>
					) : null}
				</div>
			</section>
			<section className="container py-10 sm:py-14">
				<MatchupReport a={a} b={b} theme={theme} week={game ? data.slate!.week : null} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab/teams" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; All 32 teams
					</Link>
					<UnitsCredit>Ranks use the {data.season} regular season through Week {data.week}. </UnitsCredit>
				</div>
			</section>
			<MoreFromLab current="/lab/matchups" weeks={labWeeks()} />
		</div>
	)
}
