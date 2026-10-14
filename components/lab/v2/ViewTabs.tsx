import Link from "@/components/SiteLink"
import { type PlayerGroup, GROUP_META } from "@/lib/lab/playersKit"
import { boardHref } from "@/lib/lab/playerView"
import { CONTRIBUTION, PROJECTION, THIS_SEASON, VIEW_PATH, type ViewId, hasContributionBoard, hasProjectionBoard, topThree } from "@/lib/lab/v2/kit"
import type { V2Data } from "@/lib/lab/v2/types"

/**
 * The three ways to rank one job, side by side: who is playing best this season (the default), who has added the most so far, and who
 * the projection puts first. Shown on every v2 leaderboard so a reader can see all three leaders at once and why they may differ.
 * `seasonHref` is the page that holds the "this season" ranking (the job's headline board).
 */
export default function ViewTabs({ data, group, current, seasonHref }: { data: V2Data; group: PlayerGroup; current: ViewId; seasonHref: string }) {
	const top = topThree(data, group)
	const meta = GROUP_META[group]
	const sample = top.seasonSample
	const tabs: { id: ViewId; label: string; href: string; leader: string | null; show: boolean; note?: string }[] = [
		{ id: "season", label: THIS_SEASON, href: seasonHref, leader: top.season, show: true, note: sample ? `${Math.round(sample.n)} ${sample.per}${sample.small ? `, a small sample (a typical ${GROUP_META[group].single.toLowerCase()} has ${Math.round(sample.typical)})` : ""}` : undefined },
		{ id: "contribution", label: CONTRIBUTION, href: boardHref(group, VIEW_PATH.contribution), leader: top.contribution, show: hasContributionBoard(data, group) },
		{ id: "projection", label: PROJECTION, href: boardHref(group, VIEW_PATH.projection), leader: top.projection, show: hasProjectionBoard(data, group) },
	]
	return (
		<nav aria-label={`Three ways to rank ${meta.peers}`} className="mt-6 max-w-4xl" data-testid="v2-view-tabs">
			<ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
				{tabs
					.filter((t) => t.show)
					.map((t) => {
						const on = t.id === current
						return (
							<li key={t.id}>
								<Link
									href={t.href}
									aria-current={on ? "page" : undefined}
									className={`block h-full rounded-xl border px-4 py-3 ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-soft hover:border-lab-ink"} ${t.id === "projection" && !on ? "border-dashed" : ""}`}
								>
									<span className="block text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{t.label}</span>
									<span className="mt-1 block text-sm font-semibold leading-snug">{t.leader ? `Leader: ${t.leader}` : "No leader yet"}</span>
									{t.leader && t.note ? <span className="mt-0.5 block text-xs opacity-80" data-testid={`v2-leader-note-${t.id}`}>{t.note}</span> : null}
								</Link>
							</li>
						)
					})}
			</ul>
			{!tabs.every((t) => !t.show || t.leader === tabs[0].leader || t.leader === null) ? (
				<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted" data-testid="v2-leaders-differ">
					The leaders can differ, and that is not a mistake. This season is who has played best in these games. Contribution is who has added the most points, so it rewards playing more. Projection leans on earlier seasons too.
				</p>
			) : null}
		</nav>
	)
}
