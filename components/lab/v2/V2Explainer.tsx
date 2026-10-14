import { CONTRIBUTION, CONTRIBUTION_ONE_LINE, PROJECTION, PROJECTION_LIMITS, PROJECTION_ONE_LINE, THIS_SEASON, THIS_SEASON_ONE_LINE } from "@/lib/lab/v2/kit"

/** The three questions the Player Lab answers, in the order the pages lead with them. Visible on the index, not in a methodology page. */
export function V2Cards() {
	const cards = [
		{ id: "season", title: THIS_SEASON, q: "Who is playing best right now?", body: THIS_SEASON_ONE_LINE, tag: "The default everywhere" },
		{ id: "contribution", title: CONTRIBUTION, q: "Who has added the most?", body: CONTRIBUTION_ONE_LINE, tag: "Rewards playing more" },
		{ id: "projection", title: PROJECTION, q: "Who is likely best going forward?", body: PROJECTION_ONE_LINE, tag: "Always shown with a range" },
	]
	return (
		<ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3" data-testid="v2-cards">
			{cards.map((c) => (
				<li key={c.id} className={`rounded-2xl border bg-lab-surface p-4 ${c.id === "projection" ? "border-dashed border-lab-line-strong" : "border-lab-line"}`}>
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{c.title}</p>
					<p className="m-0 mt-1 font-serif text-lg font-bold leading-snug">{c.q}</p>
					<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">{c.body}</p>
					<p className="m-0 mt-2 text-xs text-lab-muted">{c.tag}</p>
				</li>
			))}
		</ul>
	)
}

export function V2HowItWorks({ formGames }: { formGames: number }) {
	return (
		<ol className="mb-3 mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted" data-testid="v2-how">
			<li>Every player is compared only with players who do the same job, and only players with enough plays at it are ranked. Nobody is ranked on a handful of plays.</li>
			<li><span className="font-semibold text-lab-soft">This season</span> is the main number for the job (EPA per dropback for a quarterback, for example) from this season&apos;s plays only, and his rank among players with enough plays. It is the default on every page. Nothing in it comes from earlier seasons.</li>
			<li><span className="font-semibold text-lab-soft">Contribution so far</span> is points added (expected points added, EPA) above an average player at the same job, over every play he had, in total and per game. Players with too few plays for a card are counted in it and marked. It rewards playing more, so it is not the same as playing better.</li>
			<li><span className="font-semibold text-lab-soft">Projection</span> is an estimate of how good he is likely to be going forward. It combines this season with the league average and his earlier seasons, and shows a range (an 80% range), because the right answer is uncertain. It also shows how much of the number is this season&apos;s plays. {PROJECTION_LIMITS}</li>
			<li>The three can disagree, and early in a season they often do: at week 5 most of a projection is earlier seasons. A quarterback who is 10th on what he has done can be 33rd on the projection because his earlier seasons were weaker, and a receiver can be first on the projection because his earlier seasons were excellent. The page names the reason next to the numbers.</li>
			<li>For quarterbacks, EPA per dropback is the league&apos;s quarterback-only EPA: it counts the passer&apos;s own plays (sacks, scrambles and throws) and leaves a fumble by a receiver after the catch with the receiver. Team offense pages still use ordinary play-level EPA, so the two can differ.</li>
			<li>A chance of beating another player over the rest of the season is shown only for two quarterbacks with 4 to 10 games played and enough of the season left, only where the same method was checked on past seasons, rounded down to 5%, and never above 80%. It is a chance about EPA per dropback in the games still to come, luck included, not about who is the better quarterback.</li>
			<li>Running backs get no single grade. Rushing and receiving results do not repeat from season to season well enough, so a back&apos;s page shows the components (explosive-run rate, yards after contact, receiving) and his contribution, kept apart. Explosive runs and yards after contact overlap, and that is said where they are shown. Rushing yards over expected comes from tracking data on the carries it covers, is shown with how many carries those are, and is never part of a total.</li>
			<li>A new team or a new head coach is flagged on the projection and never adjusted for: past results travel less well when the setting changes, but the size of that is not measured well enough to correct for.</li>
			<li>The same stat can also be read over the team&apos;s last {formGames} games and the games before them (&ldquo;lately&rdquo;); that is a view of recent form, not part of the projection.</li>
			<li>These are not film grades. They come from play-by-play, charting and snap-count data, so they cannot see blocking, route running or assignments. Offensive linemen have no individual grade. Their page shows their own record and, labeled as the line&apos;s, the numbers the five who start together share.</li>
		</ol>
	)
}
