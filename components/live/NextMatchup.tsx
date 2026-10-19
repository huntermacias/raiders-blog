import Link from "@/components/SiteLink"
import { TeamLogo } from "@/components/lab/players/Media"
import { teamFlagsHref } from "@/lib/lab/flagsKit"
import { cardStyle } from "@/lib/lab/playerView"
import { scoutLine, teamScout, watchList } from "@/lib/lab/scouting"
import { hasUnits, matchupFor } from "@/lib/lab/units"
import { kickoffText, matchupPath } from "@/lib/lab/unitsKit"
import { type NextUp, lineText } from "@/lib/live/nextUp"
import { teamByAbbr } from "@/lib/nfl"

type Card = { href: string; title: string; text: string }

function Tile({ card }: { card: Card }) {
	return (
		<li>
			<Link href={card.href} className="group block h-full rounded-xl border border-lab-line bg-lab-surface px-4 py-3 transition hover:border-lab-line-strong hover:bg-lab-tint">
				<span className="flex items-center justify-between gap-2 font-serif text-base font-bold">
					{card.title}
					<span aria-hidden="true" className="text-lab-muted transition-transform group-hover:translate-x-0.5">
						&rarr;
					</span>
				</span>
				<span className="mt-1 block text-sm leading-snug text-lab-soft">{card.text}</span>
			</Link>
		</li>
	)
}

/** The tiles that need the opponent. Each one is left out when the Lab has nothing behind it, so none of them can dead-end. */
export function cardsFor(opp: string): Card[] {
	const nick = teamByAbbr(opp).nick
	const cards: Card[] = []
	if (teamScout(opp)) {
		// The headlines name the stat ("Raiders edge: takeaways"); the detail lines alone don't, so they are not used here.
		const w = watchList(opp, nick)
		const edge = w.find((x) => x.kind === "edge")
		const danger = w.find((x) => x.kind === "danger")
		const text = [edge, danger].flatMap((x) => (x ? [x.headline] : [])).join(" · ")
		cards.push({ href: `/lab/scouting/${opp.toLowerCase()}`, title: `Scout the ${nick}`, text: text || scoutLine(opp, nick) })
	}
	if (hasUnits("LV") && hasUnits(opp)) {
		cards.push({ href: matchupPath("LV", opp), title: "Position group by position group", text: matchupFor("LV", opp).line })
	}
	cards.push({ href: teamFlagsHref(opp), title: `The ${nick}' flags`, text: `Every accepted ${nick} penalty, and the ones that cost like a turnover. Compare with the Raiders' own.` })
	cards.push({ href: "/lab/players", title: "Find the players to watch", text: `Look up any Raider or ${nick.replace(/s$/, "")} and see how each ranks against the players who do the same job.` })
	cards.push({ href: "/lab/rooting-guide", title: "Sunday Rooting Guide", text: "The other games that move the Raiders' playoff odds the most, and who to root for in each." })
	cards.push({ href: "/lab/playoff-machine", title: "Playoff Machine", text: `Call this game and every other one left, and watch the seeds and the Raiders' odds move.` })
	return cards
}

/** The fallback when there is no next game (the season is over): the Lab pages that still make sense. */
const WRAP_UP: Card[] = [
	{ href: "/lab/top-plays", title: "Top plays", text: "The snaps that moved the Raiders' chance to win the most this season." },
	{ href: "/lab/players", title: "Player Lab", text: "Every qualifying player ranked against the players who do his job." },
	{ href: "/lab/playoff-machine", title: "Playoff Machine", text: "Pick every game left and watch the seeds and the bracket move." },
	{ href: "/lab", title: "Everything in the Lab", text: "All of the tools, in one place." },
]

/**
 * "Get ready for next week": under the live scores on /live, sends fans to the Lab pages for the Raiders' next opponent. Replaces
 * the list of live threads from Sanity.
 */
export default function NextMatchup({ next }: { next: NextUp | null }) {
	if (!next) {
		return (
			<section className="container pb-12 sm:pb-16" aria-labelledby="next-matchup-heading" data-testid="next-matchup">
				<h2 id="next-matchup-heading" className="font-serif text-2xl font-bold tracking-tight">
					While you wait
				</h2>
				<p className="mt-1 text-sm text-lab-soft">No Raiders game is on the schedule. The Lab is still open.</p>
				<ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
					{WRAP_UP.map((c) => (
						<Tile key={c.href} card={c} />
					))}
				</ul>
			</section>
		)
	}

	const team = teamByAbbr(next.opp)
	const when = next.date ? kickoffText(next.date, next.time) : null
	const line = lineText(next, team.nick)
	const cards = cardsFor(next.opp)
	return (
		<section className="container pb-12 sm:pb-16" aria-labelledby="next-matchup-heading" data-testid="next-matchup">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<span style={cardStyle(next.opp)} className="inline-flex">
					<TeamLogo team={next.opp} size={44} />
				</span>
				<div className="min-w-0">
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.25em] text-lab-muted">Week {next.week} &middot; Get ready</p>
					<h2 id="next-matchup-heading" className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						Raiders {next.home ? "vs." : "at"} {team.name}
					</h2>
					<p className="m-0 mt-0.5 text-sm text-lab-soft" data-testid="next-kickoff">
						{[when, line].filter(Boolean).join(" · ")}
					</p>
				</div>
			</div>
			<ul className="m-0 mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
				{cards.map((c) => (
					<Tile key={c.href} card={c} />
				))}
			</ul>
		</section>
	)
}
