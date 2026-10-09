import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import PlayoffMachine from "@/components/playoffs/PlayoffMachine"
import { getGames, getSchedule } from "@/lib/playoffs/data"
import { supportedSteps } from "@/lib/playoffs/tiebreakers"

// Built from the schedule file in the repo, so it is static: it changes when the Monday data refresh is deployed.
// The picks live in the visitor's browser, so nothing here is personal and nothing is requested from a server.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/playoff-machine`
const season = getSchedule().season
const TITLE = `NFL Playoff Machine ${season} | Raiders Rundown`
const DESCRIPTION = `Pick the winner of every remaining NFL game and watch the ${season} standings, seeds and playoff bracket update with the real tiebreakers. See the playoff odds and what it takes for the Raiders, or any team, and share your scenario.`
// The card for the race as it stands. A shared scenario has its own card, from the share page.
const CARD = `${SITE_URL}/api/og?type=playoffs&size=wide&v=${Date.parse(getSchedule().generatedAt) || 0}`

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [CARD] },
	twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [CARD] },
}

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "WebApplication",
	name: `NFL Playoff Machine ${season}`,
	url: PAGE_URL,
	description: DESCRIPTION,
	applicationCategory: "SportsApplication",
	operatingSystem: "Any",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	publisher: { "@type": "Organization", name: "Raiders Rundown", url: SITE_URL },
}

export default function PlayoffMachinePage() {
	const schedule = getSchedule()
	const games = getGames()
	const steps = supportedSteps()
	const projected = steps.filter((s) => s.inProjection)
	const needsScores = steps.filter((s) => s.needs === "scores")
	const updated = schedule.generatedAt.slice(0, 10)

	return (
		<div className="lab min-h-screen bg-lab-page text-lab-ink">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			<section className="border-b border-lab-line">
				<div className="container py-6 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {schedule.season} season, results through Week {schedule.throughWeek}
					</p>
					<h1 className="mt-2 max-w-3xl font-serif text-3xl font-bold leading-[1.05] tracking-tight sm:mt-3 sm:text-6xl">NFL Playoff Machine {schedule.season}</h1>
					<p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-lab-soft sm:mt-4 sm:text-lg">
						Pick the winner of every game left on the schedule. The standings, the seeds and the bracket update as you go, with the NFL&rsquo;s real tiebreakers, and the odds
						show what your team needs. Follow the Raiders, or any team you like.
					</p>
				</div>
			</section>

			<section className="container py-6 sm:py-10" aria-label="The playoff machine">
				<PlayoffMachine games={games} season={schedule.season} throughWeek={schedule.throughWeek} stamp={Date.parse(schedule.generatedAt) || 0} />
			</section>

			<section className="border-t border-lab-line" aria-label="About the playoff machine">
				<div className="container max-w-3xl py-10 sm:py-14">
					<h2 className="m-0 font-serif text-2xl font-bold">What the NFL Playoff Machine does</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						It turns the rest of the {schedule.season} schedule into a set of picks you control. Every game that has been played is locked to its real score. Every game that has
						not is yours to call: tap a team to pick it, tap it again to take the pick back, or call a tie. After every tap the whole league is worked out again, so you can
						see the records, the division races, the seven playoff teams in each conference and the first-round games they would play.
					</p>

					<h2 className="mt-10 font-serif text-2xl font-bold">How your predictions work</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						The table always shows the real results so far plus the picks you have made. A game you have not picked counts for nothing yet, so the table fills in as you go.
						Quick fill can pick the home team in every open game or flip a coin for each one, and it keeps the picks you made unless you tell it not to. Your picks are saved on
						this device, so you can leave and come back, and nothing about them is sent to us. &ldquo;Share&rdquo; makes a picture of your scenario, wide for link previews or tall for
						posting, and a short link to exactly your picks; anyone who opens it sees your scenario first, and your own saved picks are still there when they want them back.
					</p>

					<h2 className="mt-10 font-serif text-2xl font-bold">How NFL playoff seeding works</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						Seven teams in each conference make the playoffs. The four division winners take seeds 1 to 4, ordered by record, and a division winner is seeded above a
						wild card even when its record is worse. The three best remaining teams in the conference are the wild cards, seeds 5 to 7. The No. 1 seed gets a bye. In the
						first round the 2 seed hosts the 7, the 3 hosts the 6 and the 4 hosts the 5. After that the NFL reseeds, so the best seed left hosts the lowest one left.
					</p>

					<h2 className="mt-10 font-serif text-2xl font-bold">How ties are broken</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						Teams with the same record are not ordered by chance or by name. A division tie is settled by head-to-head record, then record in the division, in common games,
						in the conference, strength of victory and strength of schedule. A wild-card tie starts with head-to-head (or a head-to-head sweep when three or more teams are
						level), then conference record, common games with a minimum of four, strength of victory and strength of schedule. When several teams from one division are tied
						for a wild card, they are first cut to the best team from each division. When three or more teams are tied, the steps are applied to all of them together, and as
						soon as one team comes out ahead the rest start again from the top.
					</p>
					<p className="mt-3 leading-relaxed text-lab-soft">
						Used on every projection here: {projected.map((s) => s.label.toLowerCase()).join(", ")}. The steps after those compare points ({needsScores.map((s) => s.label.toLowerCase()).join("; ")}), so
						they are used only once every game of the season has a real score. A projected game has no score, so they cannot be used on one. Net touchdowns and the final coin
						toss are not supported at all. When a tie goes that far, the page says so and shows the teams in a fixed order by name, rather than pretending a rule decided it.
					</p>

					<h2 className="mt-10 font-serif text-2xl font-bold">Where the playoff odds come from</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						The odds are worked out by playing the rest of the season thousands of times. Every team gets an Elo rating built from this season&rsquo;s final scores alone, with
						the same method behind our Blogger vs. the Math page, and that rating gives each open game a win chance, with a small edge for the home team. The games you
						picked are treated as played, so the odds change as you pick. Each run produces a full set of standings with the same tiebreakers the page uses, and the odds
						are how often a team made the playoffs, won its division or took the No. 1 seed. The same simulated seasons are used for every comparison, so &ldquo;if they win
						out&rdquo; and &ldquo;if they lose out&rdquo; differ only because of the games they change.
					</p>
					<p className="mt-3 leading-relaxed text-lab-soft">
						This is a model, not a forecast. It knows nothing about injuries, quarterbacks, weather or last year, it starts every team at the same rating, and it does not
						simulate ties. Early in the season a few games decide a lot, so the odds are rough until more results are in. They are shown as &ldquo;&lt;1%&rdquo; or
						&ldquo;&gt;99%&rdquo; rather than 0 or 100 unless the standings themselves say the matter is settled.
					</p>

					<h2 className="mt-10 font-serif text-2xl font-bold">A simulation, not official standings</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						The standings and the bracket are a projection from the picks you make. They are not the NFL&rsquo;s standings. Results come in
						with our weekly data refresh (last run {updated}), so a game played this week may not show as final until the next one. &ldquo;Clinched&rdquo; and
						&ldquo;Eliminated&rdquo; are shown only when the games left cannot change the answer even if every tiebreaker went the other way, so the page can be a little
						slower than the NFL to call a team in or out, but it will not call one wrongly.
					</p>

					<p className="mt-8 text-xs leading-relaxed text-lab-muted">
						Schedule and scores: the{" "}
						<a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nfldata" target="_blank" rel="noopener noreferrer">
							nflverse nfldata
						</a>{" "}
						games file, CC BY 4.0. Tiebreaking follows the NFL&rsquo;s published procedures. Standings and tiebreakers calculated by Raiders Rundown.
					</p>
					<p className="mt-3 text-sm">
						<Link href="/lab/matchups" className="font-semibold underline underline-offset-4">
							See how this week&rsquo;s games stack up, position group by position group
						</Link>
					</p>
				</div>
			</section>
		</div>
	)
}
