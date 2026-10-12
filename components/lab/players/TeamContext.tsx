import { TeamLogo } from "@/components/lab/players/Media"
import Link from "@/components/SiteLink"
import { cardStyle, profileHref, teamName, teamNick } from "@/lib/lab/playerView"
import { GROUP_META, type PlayerRow } from "@/lib/lab/playersKit"
import { type TeamView, teamSentence } from "@/lib/lab/playerTeam"
import { matchupPath, ordinal } from "@/lib/lab/unitsKit"

// The team around a player, in two server-rendered pieces: a one-line strip for the top of his page, and a section with his unit's
// league rank and the teammates in his room. All of the thinking is in lib/lab/playerTeam.ts.

/** A line under his name: the club's record, how its offense and defense rank, and who it plays next. */
export function TeamStrip({ view, team }: { view: TeamView; team: string }) {
	return (
		<p className="m-0 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-lab-soft" data-testid="team-strip">
			<span className="inline-flex items-center gap-1.5 font-semibold text-lab-ink">
				<TeamLogo team={team} size={20} />
				{teamNick(team)} <span className="font-mono tabular-nums">{view.record}</span>
			</span>
			{view.off ? (
				<span>
					Offense <span className="font-semibold text-lab-ink">{ordinal(view.off.rank)}</span>
				</span>
			) : null}
			{view.def ? (
				<span>
					Defense <span className="font-semibold text-lab-ink">{ordinal(view.def.rank)}</span>
				</span>
			) : null}
			{view.next ? (
				<Link href={matchupPath(team, view.next.opp)} className="font-semibold text-lab-ink underline decoration-lab-line-strong underline-offset-2">
					Next: {view.next.home ? "vs" : "at"} {teamNick(view.next.opp)} &rarr;
				</Link>
			) : null}
		</p>
	)
}

export default function TeamContext({ view, player }: { view: TeamView; player: PlayerRow }) {
	const meta = GROUP_META[player.group]
	const nick = teamNick(player.team)
	const sentence = teamSentence(view, player, meta.single, nick)
	return (
		<div data-testid="team-context">
			{sentence ? <p className="m-0 max-w-3xl text-base leading-relaxed text-lab-soft">{sentence}</p> : null}
			<div className="mt-5 grid gap-4 md:grid-cols-2">
				{view.unit ? (
					<div className="rounded-2xl border border-lab-line bg-lab-surface p-4" data-testid="unit-card">
						<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{nick} unit</p>
						<h3 className="m-0 mt-1 font-serif text-xl font-bold">
							{view.unit.label}: <span className="font-mono">{ordinal(view.unit.rank)}</span> of {view.teams}
						</h3>
						<ul className="m-0 mt-3 list-none divide-y divide-lab-line p-0">
							{view.unit.lines.map((l) => (
								<li key={l.label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
									<span className="text-lab-soft">{l.label}</span>
									<span className="shrink-0 font-mono tabular-nums">
										<span className="font-bold text-lab-ink">{l.value}</span> <span className="text-xs text-lab-muted">{ordinal(l.rank)}</span>
									</span>
								</li>
							))}
						</ul>
						<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">
							Ranked among all {view.teams} teams.{" "}
							<Link href="/lab/teams" className="underline">
								See every team
							</Link>
							.
						</p>
					</div>
				) : null}
				{view.room.length > 1 ? (
					<div className="rounded-2xl border border-lab-line bg-lab-surface p-4" data-testid="room-card">
						<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
							{teamName(player.team)} {meta.peers}
						</p>
						<h3 className="m-0 mt-1 font-serif text-xl font-bold">His room, by grade</h3>
						<ol className="m-0 mt-3 list-none divide-y divide-lab-line p-0">
							{view.room.map((m) => (
								<li key={m.slug + m.group} className={`flex items-center gap-3 py-2 text-sm ${m.me ? "-mx-2 rounded-lg bg-lab-tint px-2 font-semibold" : ""}`} style={m.me ? cardStyle(player.team) : undefined} aria-current={m.me ? "true" : undefined}>
									<span className="w-6 shrink-0 font-mono text-xs tabular-nums text-lab-muted">{m.grade === null ? "–" : m.rank}</span>
									<span className="min-w-0 flex-1 truncate">
										{m.me ? (
											m.name
										) : (
											<Link href={profileHref(m.slug)} className="hover:underline">
												{m.name}
											</Link>
										)}{" "}
										<span className="text-xs font-normal text-lab-muted">{m.pos}</span>
									</span>
									<span className="shrink-0 font-mono tabular-nums">{m.grade === null ? "–" : m.grade}</span>
								</li>
							))}
						</ol>
						<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">Overall grade, 20 to 80, against all {meta.peers} in the league. A teammate with too few plays to grade is listed without one.</p>
					</div>
				) : null}
			</div>
		</div>
	)
}
