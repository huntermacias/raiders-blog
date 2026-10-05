"use client"

import { useEffect, useState } from "react"

import { teamByAbbr } from "@/lib/nfl"
import { cn } from "@/lib/utils"
import { kickoffText, lineText } from "@/lib/math/format"
import type { SlateGame } from "@/lib/math/report"
import { type Side, type Tally, sharePct } from "@/lib/math/votes"
import { TeamChip } from "@/components/predictions/TeamChip"

const storeKey = (season: number, key: string) => `mathvote:${season}:${key}`

function readChoice(season: number, key: string): Side | null {
	try {
		const v = window.localStorage.getItem(storeKey(season, key))
		return v === "blogger" || v === "math" ? v : null
	} catch {
		return null
	}
}

function saveChoice(season: number, key: string, side: Side) {
	try {
		window.localStorage.setItem(storeKey(season, key), side)
	} catch {
		// Private windows can refuse storage; the vote still counted, it just can't be remembered here.
	}
}

type VoteState = { choice: Side | null; tally: Tally | null; busy: boolean; error: string | null }

/** The next games, the math's forecast for each and, where my pick and the math's differ, a vote. */
export default function Slate({ slate, season, tallies, hot }: { slate: SlateGame[]; season: number; tallies: Record<string, Tally>; hot?: string }) {
	const [onlySplits, setOnlySplits] = useState(false)
	// Time-dependent and storage-dependent bits are filled in after mount so the server and browser agree.
	const [now, setNow] = useState<number | null>(null)
	const [votes, setVotes] = useState<Record<string, VoteState>>({})

	useEffect(() => {
		setNow(Date.now())
		const next: Record<string, VoteState> = {}
		for (const g of slate) {
			const choice = readChoice(season, g.key)
			if (choice) next[g.key] = { choice, tally: tallies[g.key] ?? null, busy: false, error: null }
		}
		setVotes(next)
	}, [slate, season, tallies])

	const splits = slate.filter((g) => g.split)
	const shown = onlySplits ? splits : slate
	const weeks = Array.from(new Set(shown.map((g) => g.week)))

	async function vote(g: SlateGame, side: Side) {
		setVotes((v) => ({ ...v, [g.key]: { choice: v[g.key]?.choice ?? null, tally: v[g.key]?.tally ?? null, busy: true, error: null } }))
		try {
			const res = await fetch("/api/math-vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: g.key, side }) })
			if (!res.ok) {
				const msg = res.status === 409 ? "Voting just closed for this game." : "Couldn’t save your vote. Try again in a moment."
				setVotes((v) => ({ ...v, [g.key]: { choice: null, tally: v[g.key]?.tally ?? null, busy: false, error: msg } }))
				return
			}
			const data = (await res.json()) as Tally
			saveChoice(season, g.key, side)
			setVotes((v) => ({ ...v, [g.key]: { choice: side, tally: { blogger: data.blogger, math: data.math }, busy: false, error: null } }))
		} catch {
			setVotes((v) => ({ ...v, [g.key]: { choice: null, tally: v[g.key]?.tally ?? null, busy: false, error: "Couldn’t save your vote. Try again in a moment." } }))
		}
	}

	if (slate.length === 0) {
		return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No upcoming games to forecast right now.</p>
	}

	return (
		<div>
			{splits.length > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-3">
					<button
						type="button"
						aria-pressed={onlySplits}
						onClick={() => setOnlySplits((s) => !s)}
						className={cn(
							"inline-flex h-8 items-center rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
							onlySplits ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"
						)}
					>
						Only where we split ({splits.length})
					</button>
					<span className="text-xs text-muted-foreground">We split when the team I rank higher is not the team the math favors.</span>
				</div>
			)}

			{weeks.map((w) => (
				<div key={w} className="mb-6">
					<h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Week {w}</h3>
					<ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
						{shown
							.filter((g) => g.week === w)
							.map((g) => (
								<Row key={g.key} g={g} now={now} state={votes[g.key]} tally={tallies[g.key]} onVote={(side) => vote(g, side)} hot={hot === g.key || g.home === "LV" || g.away === "LV"} />
							))}
					</ul>
				</div>
			))}
			<p className="text-xs text-muted-foreground">
				Percentages are the math&rsquo;s chance each side wins, with home field, rest and travel included. The line is the margin the ratings expect, to the nearest half point. My pick is the higher team on my board.
			</p>
		</div>
	)
}

function Row({ g, now, state, tally, onVote, hot }: { g: SlateGame; now: number | null; state: VoteState | undefined; tally: Tally | undefined; onVote: (side: Side) => void; hot: boolean }) {
	const away = teamByAbbr(g.away)
	const home = teamByAbbr(g.home)
	const awayPct = Math.round((1 - g.homeChance) * 100)
	const homePct = 100 - awayPct
	const kickoff = g.kickoff ? Date.parse(g.kickoff) : NaN
	const open = now != null && Number.isFinite(kickoff) && now < kickoff
	const choice = state?.choice ?? null
	const shownTally = state?.tally ?? tally
	const bloggerName = g.bloggerPick ? teamByAbbr(g.bloggerPick).nick : null
	const mathName = teamByAbbr(g.mathPick).nick

	return (
		<li className={cn("px-4 py-3", hot && "bg-muted/50")}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<div className="flex min-w-0 flex-1 basis-[22rem] flex-col gap-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
						<TeamChip team={away.name} />
						<span>{away.nick}</span>
						<span className="text-xs font-normal text-muted-foreground">at</span>
						<TeamChip team={home.name} />
						<span>{home.nick}</span>
					</div>
					<p className="text-xs text-muted-foreground">{kickoffText(g.kickoff) || "Time TBD"}</p>
					{g.split && bloggerName && (
						<div className="mt-1.5">
							{choice ? (
								<VoteResult g={g} choice={choice} tally={shownTally} bloggerName={bloggerName} mathName={mathName} />
							) : open ? (
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Who do you trust?</span>
									<button type="button" disabled={state?.busy} onClick={() => onVote("blogger")} className={voteBtn}>
										Blogger: {bloggerName}
									</button>
									<button type="button" disabled={state?.busy} onClick={() => onVote("math")} className={voteBtn}>
										Math: {mathName}
									</button>
									{state?.error && <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">{state.error}</span>}
								</div>
							) : now != null ? (
								shownTally && shownTally.blogger + shownTally.math > 0 ? (
									<VoteResult g={g} choice={null} tally={shownTally} bloggerName={bloggerName} mathName={mathName} />
								) : (
									<p className="text-xs text-muted-foreground">Voting is closed for this game.</p>
								)
							) : null}
						</div>
					)}
				</div>

				<div className="w-full basis-52 sm:w-52 sm:flex-none">
					<div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${away.nick} ${awayPct} percent, ${home.nick} ${homePct} percent`}>
						<span className={cn("block h-full", awayPct >= homePct ? "bg-foreground" : "bg-foreground/35")} style={{ width: `${awayPct}%` }} />
						<span className={cn("block h-full border-l-2 border-card", homePct > awayPct ? "bg-foreground" : "bg-foreground/35")} style={{ width: `${homePct}%` }} />
					</div>
					<div className="mt-1 flex items-center justify-between text-xs tabular-nums">
						<span className={cn(awayPct >= homePct ? "font-bold" : "text-muted-foreground")}>{g.away} {awayPct}%</span>
						<span className="text-muted-foreground">{lineText(g.homeMargin, g.home, g.away)}</span>
						<span className={cn(homePct > awayPct ? "font-bold" : "text-muted-foreground")}>{homePct}% {g.home}</span>
					</div>
				</div>

				<div className="flex w-full items-center gap-2 text-xs sm:w-auto sm:min-w-[9.5rem] sm:flex-col sm:items-end sm:gap-1">
					{g.split ? (
						<span className="rounded-full border border-foreground/60 bg-foreground px-2 py-0.5 font-bold uppercase tracking-wide text-background">We split</span>
					) : g.bloggerPick ? (
						<span className="rounded-full border border-border px-2 py-0.5 font-semibold text-muted-foreground">We agree</span>
					) : null}
					<span className="text-muted-foreground">
						{g.bloggerPick ? <>Me: <strong className="text-foreground">{g.bloggerPick}</strong> · Math: <strong className="text-foreground">{g.mathPick}</strong></> : <>Math: <strong className="text-foreground">{g.mathPick}</strong></>}
					</span>
				</div>
			</div>

		</li>
	)
}

const voteBtn =
	"inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

function VoteResult({ g, choice, tally, bloggerName, mathName }: { g: SlateGame; choice: Side | null; tally: Tally | null | undefined; bloggerName: string; mathName: string }) {
	const b = sharePct(tally ?? undefined, "blogger")
	const m = sharePct(tally ?? undefined, "math")
	const total = tally ? tally.blogger + tally.math : 0
	return (
		<div aria-label={`Votes on ${g.key}`}>
			{choice && <p className="mb-1.5 text-xs font-semibold">Thanks, you went with {choice === "blogger" ? `the blogger (${bloggerName})` : `the math (${mathName})`}.</p>}
			{b == null || m == null ? (
				<p className="text-xs text-muted-foreground">You&rsquo;re the first vote.</p>
			) : (
				<>
					<div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
						<span className="block h-full bg-foreground" style={{ width: `${b}%` }} />
						<span className="block h-full border-l-2 border-card bg-foreground/35" style={{ width: `${m}%` }} />
					</div>
					<p className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
						<span>Blogger {b}%</span>
						<span>{total} vote{total === 1 ? "" : "s"}</span>
						<span>Math {m}%</span>
					</p>
				</>
			)}
		</div>
	)
}
