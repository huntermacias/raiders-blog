import Link from "@/components/SiteLink"

import ChallengeLink from "@/components/league/ChallengeLink"
import { shortDay, oneDecimal } from "@/lib/league2/format"
import type { ProfileView } from "@/lib/league2/view/btb"
import { TEAMS, teamInfo } from "@/lib/nfl"
import { ResultCard, RivalryPanel, SectionHeading } from "./sections"

function Tile({ label, value, foot }: { label: string; value: string; foot?: string }) {
	return (
		<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
			<p className="mt-2 font-serif text-3xl font-bold leading-none tabular-nums md:text-4xl">{value}</p>
			{foot && <p className="mt-2 text-xs text-muted-foreground">{foot}</p>}
		</div>
	)
}

const TEAMS_BY_ABBR = (abbr: string) => teamInfo(TEAMS.find((t) => t.abbr === abbr)?.name)

export default function ProfileV2({ p, isMe }: { p: ProfileView; isMe: boolean }) {
	const m = p.me
	const hidden = !p.privacy.profile && !isMe
	const fav = p.favoriteTeam ? TEAMS_BY_ABBR(p.favoriteTeam) : null
	if (hidden)
		return (
			<div className="container py-10 md:py-14">
				<Link href="/league" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
					&larr; Beat the Blogger
				</Link>
				<h1 className="mt-3 font-serif text-4xl font-bold tracking-tight md:text-5xl">{p.handle}</h1>
				<p className="mt-3 max-w-xl rounded-xl border border-dashed border-border p-6 text-muted-foreground">This player keeps their profile private. You can still find them on the standings.</p>
			</div>
		)
	return (
		<div className="container py-10 md:py-14">
			<Link href="/league" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
				&larr; Beat the Blogger
			</Link>
			<div className="mt-3 flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Player since {shortDay(p.joinedAt)}</p>
					<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">{p.handle}</h1>
					{fav && (
						<p className="mt-1 text-sm text-muted-foreground">
							<span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-baseline" style={{ background: fav.color }} />
							Fan of the {fav.name}
						</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<ChallengeLink handle={p.handle} />
					{isMe && (
						<Link href="/league/account" className="text-sm font-semibold underline underline-offset-4">
							Account settings
						</Link>
					)}
				</div>
			</div>

			{isMe && (!p.privacy.profile || !p.privacy.history) && (
				<p role="status" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
					{!p.privacy.profile ? "Only you can see this page." : "Only you can see your game-by-game picks."}{" "}
					<Link href="/league/account#profile" className="font-semibold underline underline-offset-4">
						Change who sees what
					</Link>
				</p>
			)}

			<section aria-label="Season" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
				<Tile label="Rank" value={m.rank > 0 ? `#${m.rank}` : "–"} foot={m.rank > 0 ? `of ${m.of}` : "No graded games yet"} />
				<Tile label="Points" value={String(m.points)} foot={`${m.games} graded game${m.games === 1 ? "" : "s"}`} />
				<Tile label="Right winners" value={String(m.correct)} foot={`${m.exact} exact score${m.exact === 1 ? "" : "s"}`} />
				<Tile label="Average miss" value={oneDecimal(m.avgMarginError)} foot="points off the margin" />
			</section>

			<section aria-labelledby="riv" className="mt-10">
				<SectionHeading id="riv" title={`${p.handle} vs the blogger`} />
				<RivalryPanel me={m} />
			</section>

			<section aria-labelledby="hist" className="mt-10">
				<SectionHeading id="hist" title="Game by game" sub="Picks appear here once a game locks." />
				{!p.privacy.history && !isMe ? (
					<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">This player keeps their picks private.</p>
				) : p.history.length === 0 ? (
					<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No locked games yet.</p>
				) : (
					<ul className="grid gap-3 md:grid-cols-2">
						{p.history.map((c) => (
							<ResultCard key={c.eventId} c={c} signedIn subject={isMe ? "You" : p.handle} />
						))}
					</ul>
				)}
			</section>
		</div>
	)
}
