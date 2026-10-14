import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import ViewTabs from "@/components/lab/v2/ViewTabs"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import TrackView from "@/components/lab/players/TrackView"
import { getPlayers } from "@/lib/lab/data"
import { GROUP_META, type PlayerGroup, HEADLINE, ordinal, statInfo } from "@/lib/lab/playersKit"
import { boardHref, profileHref, teamNick } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
import {
	CONTRIBUTION_ONE_LINE,
	PROJECTION_LIMITS,
	PROJECTION_ONE_LINE,
	type ViewId,
	contributionBoard,
	observedKey,
	projectionBoard,
	sharePct,
	lowerLabel,
} from "@/lib/lab/v2/kit"
import { isV2 } from "@/lib/lab/v2/types"

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`

/**
 * The two v2 leaderboards that are not "this season": contribution so far and projection. Each says in its first lines what it ranks and
 * what it does not, lists everyone it can (contribution includes players under the card floor, shown without a link), and points back at
 * the season ranking, which is the default view.
 */
export default function V2Board({ group, view }: { group: PlayerGroup; view: Exclude<ViewId, "season"> }) {
	const data = getPlayers()
	if (!isV2(data)) return null
	const meta = GROUP_META[group]
	const seasonHref = boardHref(group, statInfo(group, observedKey(data, group))?.path ?? statInfo(group, HEADLINE[group])!.path)
	const projection = view === "projection" ? projectionBoard(data, group) : []
	const contribution = view === "contribution" ? contributionBoard(data, group) : []
	const rows = view === "projection" ? projection.length : contribution.length
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" data-testid={`v2-board-${view}`}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; <span>{meta.title}</span> &rsaquo; <span className="text-lab-soft">{view === "projection" ? "Projection" : "Contribution so far"}</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
						{view === "projection" ? `${meta.title}: projected` : `${meta.title}: contribution so far`}
					</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">{view === "projection" ? PROJECTION_ONE_LINE : CONTRIBUTION_ONE_LINE}</p>
					{view === "projection" ? (
						<p className="m-0 mt-3 max-w-3xl border-l-2 border-lab-line-strong pl-3 text-sm leading-relaxed text-lab-muted" data-testid="v2-board-note">
							This is not who is playing best. A projection counts earlier seasons too, so early in a season it can rank a player above someone who has played better in these games. The bar shows how much of each number is this season. {PROJECTION_LIMITS}
						</p>
					) : (
						<p className="m-0 mt-3 max-w-3xl border-l-2 border-lab-line-strong pl-3 text-sm leading-relaxed text-lab-muted" data-testid="v2-board-note">
							This is not who is playing best. It adds up points, so a player with more plays has more to add, and a good player who missed games ranks lower. Per-game is shown beside it. Players with too few plays for a card are listed too and are marked.
						</p>
					)}
					<ViewTabs data={data} group={group} current={view} seasonHref={seasonHref} />
					<TrackView event="board_view" props={{ group, board: view }} />
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-4" />
				</div>
			</section>

			<section className="container py-8 sm:py-10">
				{rows === 0 ? (
					<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">Nothing to rank here yet. This fills in as the season goes on.</p>
				) : view === "projection" ? (
					<div className="overflow-x-auto rounded-2xl border border-lab-line bg-lab-surface">
						<table className="w-full min-w-[640px] border-collapse text-sm" data-testid="v2-projection-table">
							<caption className="sr-only">{meta.title} ranked by projected {lowerLabel(statInfo(group, projection[0]?.player.grade?.k ?? HEADLINE[group])?.label ?? "")}</caption>
							<thead>
								<tr className="border-b border-lab-line text-left text-[11px] uppercase tracking-[0.12em] text-lab-muted">
									<th scope="col" className="px-3 py-2">Proj.</th>
									<th scope="col" className="px-3 py-2">Player</th>
									<th scope="col" className="px-3 py-2 text-right">Grade</th>
									<th scope="col" className="px-3 py-2 text-right">Likely range</th>
									<th scope="col" className="px-3 py-2 text-right">This season</th>
									<th scope="col" className="px-3 py-2">From this season</th>
								</tr>
							</thead>
							<tbody>
								{projection.map((r) => (
									<tr key={r.player.id} className="border-b border-lab-line last:border-b-0 align-top">
										<td className="px-3 py-2 font-mono tabular-nums">{r.rank}</td>
										<td className="px-3 py-2">
											<Link href={profileHref(r.player.slug)} className="font-semibold hover:underline">{r.player.name}</Link>
											<span className="ml-1 text-xs text-lab-muted">{r.player.team}</span>
											{r.env.kind === "new-team" || r.env.kind === "new-coach" ? (
												<span className="mt-0.5 block text-xs text-lab-muted" data-testid="v2-board-env">{r.env.kind === "new-team" ? `New team (was ${teamNick(r.player.prevTeam ?? "")})` : "New head coach"}: not adjusted for</span>
											) : null}
										</td>
										<td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{Math.round(r.grade)}</td>
										<td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-lab-soft">{Math.round(r.lo)} to {Math.round(r.hi)}</td>
										<td className="px-3 py-2 text-right text-xs text-lab-soft">{r.observedRank === null ? "–" : `${ordinal(r.observedRank)}`}</td>
										<td className="px-3 py-2 text-xs text-lab-soft">{sharePct(r.thisSeasonShare)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="overflow-x-auto rounded-2xl border border-lab-line bg-lab-surface">
						<table className="w-full min-w-[560px] border-collapse text-sm" data-testid="v2-contribution-table">
							<caption className="sr-only">{meta.title} ranked by points added above an average player at the job</caption>
							<thead>
								<tr className="border-b border-lab-line text-left text-[11px] uppercase tracking-[0.12em] text-lab-muted">
									<th scope="col" className="px-3 py-2">#</th>
									<th scope="col" className="px-3 py-2">Player</th>
									<th scope="col" className="px-3 py-2 text-right">EPA added</th>
									<th scope="col" className="px-3 py-2 text-right">Per game</th>
									<th scope="col" className="px-3 py-2 text-right">Games</th>
								</tr>
							</thead>
							<tbody>
								{contribution.map((r) => (
									<tr key={r.id} className="border-b border-lab-line last:border-b-0">
										<td className="px-3 py-2 font-mono tabular-nums">{r.rank}</td>
										<td className="px-3 py-2">
											{r.slug ? <Link href={profileHref(r.slug)} className="font-semibold hover:underline">{r.name}</Link> : <span className="font-semibold">{r.name}</span>}
											<span className="ml-1 text-xs text-lab-muted">{r.team}</span>
											{r.lowVolume ? <span className="ml-2 rounded-full border border-dashed border-lab-line-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lab-muted" data-testid="v2-low-volume">few plays, no card</span> : null}
										</td>
										<td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{signed(r.over)}</td>
										<td className="px-3 py-2 text-right font-mono tabular-nums text-lab-soft">{signed(r.perGame, 2)}</td>
										<td className="px-3 py-2 text-right font-mono tabular-nums text-lab-soft">{r.games}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<p className="m-0 mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted">
					Three questions, three rankings, never added together. <Link href="/lab/players#how-it-works" className="underline">How they work</Link>.
				</p>
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href={seasonHref} className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; This season&apos;s ranking
					</Link>
					<UnitsCredit />
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
