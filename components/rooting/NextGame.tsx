import { teamByAbbr } from "@/lib/nfl"
import { pctText, pointsText } from "@/lib/rooting/guide"
import type { OwnGame } from "@/lib/rooting/view"
import { TeamBadge } from "./parts"

type Props = { own: OwnGame; nick: string; team: string; goalPhrase: string; baseline: number; color: string }

/**
 * The followed team's next game, by itself: what its odds are after a win and after a loss. This is the answer to "what does my own team's
 * next game mean", kept apart from the ranked list of games to root in, which orders games by how much they matter whoever plays.
 */
export default function NextGame({ own, nick, team, goalPhrase, baseline, color }: Props) {
	const opp = teamByAbbr(own.opp)
	const swing = Math.round(own.swing * 100)
	const range = own.range ? `${Math.round(own.range[0] * 100)} to ${Math.round(own.range[1] * 100)}` : null
	return (
		<section aria-label={`The ${nick}' next game`} className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" style={{ borderLeft: `6px solid ${color}` }}>
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Your next game &middot; Week {own.week}</p>
			<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
				<span className="inline-flex items-center gap-2">
					<TeamBadge abbr={team} size={36} />
					<span className="text-sm font-semibold text-lab-soft">{own.venue === "vs" ? "vs." : "at"}</span>
					<TeamBadge abbr={own.opp} size={36} />
					<span className="font-serif text-xl font-bold leading-tight">{opp.nick}</span>
				</span>
				<span className="text-xs text-lab-muted">
					{pctText(own.pWin)} chance the {nick} win, from the {own.line ? "betting line" : "team ratings"}
				</span>
			</div>
			<dl className="m-0 mt-4 grid grid-cols-3 gap-3 text-center sm:max-w-xl">
				<div className="rounded-xl bg-lab-tint px-2 py-3">
					<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">If they win</dt>
					<dd className="m-0 font-serif text-3xl font-bold leading-tight tabular-nums">{pctText(own.win.p)}</dd>
					<dd className="m-0 text-xs text-lab-muted">{pointsText(own.win.delta)} from now</dd>
				</div>
				<div className="rounded-xl bg-lab-tint px-2 py-3">
					<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">If they lose</dt>
					<dd className="m-0 font-serif text-3xl font-bold leading-tight tabular-nums">{pctText(own.loss.p)}</dd>
					<dd className="m-0 text-xs text-lab-muted">{pointsText(own.loss.delta)} from now</dd>
				</div>
				<div className="rounded-xl border border-lab-line px-2 py-3">
					<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Swing</dt>
					<dd className="m-0 font-serif text-3xl font-bold leading-tight tabular-nums">{swing} pts</dd>
					<dd className="m-0 text-xs text-lab-muted">{range ? `${range} across refits` : "win minus loss"}</dd>
				</div>
			</dl>
			<p className="m-0 mt-3 text-xs text-lab-muted">
				Chance to {goalPhrase}, from {pctText(baseline)} today. The swing is what the game is worth to you; the change from now also depends on how likely each result was.
			</p>
		</section>
	)
}
