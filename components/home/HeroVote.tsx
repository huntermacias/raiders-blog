"use client"

import { useEffect, useState } from "react"
import { Lock, Share2 } from "lucide-react"

import { cn, hasVoted, markVoted } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import type { Side } from "@/lib/predictions"

const SITE_URL = "https://www.raidersrundown.com"

export type HeroPick = {
	_id: string
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	readerVotesAway?: number | null
	readerVotesHome?: number | null
}

/**
 * One-tap "who wins?" for the homepage hero. Same endpoint, same lock rules
 * and same localStorage keys as the card on /predictions, so a vote cast here
 * shows up there (and the other way round).
 */
export default function HeroVote({ pick }: { pick: HeroPick }) {
	const away = teamInfo(pick.awayTeam)
	const home = teamInfo(pick.homeTeam)

	const [votesAway, setVotesAway] = useState(pick.readerVotesAway ?? 0)
	const [votesHome, setVotesHome] = useState(pick.readerVotesHome ?? 0)
	// SSR-safe defaults; the real values are read in the effect so hydration matches.
	const [locked, setLocked] = useState(false)
	const [voted, setVoted] = useState(false)
	const [choice, setChoice] = useState<Side | null>(null)
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const storageKey = `pick:${pick._id}`
	const choiceKey = `raiders-rundown:pick-choice:${pick._id}`

	useEffect(() => {
		setLocked(Date.now() >= new Date(pick.kickoff).getTime())
		setVoted(hasVoted(storageKey))
		try {
			const stored = window.localStorage.getItem(choiceKey) as Side | null
			if (stored === "away" || stored === "home") setChoice(stored)
		} catch {
			// storage unavailable (private mode etc.) - fine
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pick._id, pick.kickoff])

	const total = votesAway + votesHome
	const pctAway = total > 0 ? Math.round((votesAway / total) * 100) : 0
	const pctHome = total > 0 ? 100 - pctAway : 0
	const canVote = !locked && !voted

	async function vote(side: Side) {
		if (!canVote || pending) return
		setPending(true)
		setError(null)

		// Optimistic, but rolled back unless the server confirms the write.
		const prevAway = votesAway
		const prevHome = votesHome
		if (side === "away") setVotesAway(prevAway + 1)
		else setVotesHome(prevHome + 1)
		setChoice(side)
		setVoted(true)

		const rollback = () => {
			setVotesAway(prevAway)
			setVotesHome(prevHome)
			setChoice(null)
			setVoted(false)
		}

		try {
			const res = await fetch("/api/prediction-vote", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ _id: pick._id, choice: side }),
			})
			if (res.ok) {
				const data = await res.json().catch(() => null)
				if (data && typeof data.readerVotesAway === "number" && typeof data.readerVotesHome === "number") {
					setVotesAway(data.readerVotesAway)
					setVotesHome(data.readerVotesHome)
				}
				markVoted(storageKey)
				try {
					window.localStorage.setItem(choiceKey, side)
				} catch {
					// ignore
				}
				return
			}
			rollback()
			if (res.status === 409) setLocked(true)
			else setError("Couldn't save your pick. Please try again in a moment.")
		} catch {
			rollback()
			setError("Couldn't save your pick. Check your connection and try again.")
		} finally {
			setPending(false)
		}
	}

	const sides = [
		{ side: "away" as const, info: away },
		{ side: "home" as const, info: home },
	]

	const pickedNick = choice ? (choice === "away" ? away.nick : home.nick) : null
	const shareText = pickedNick
		? `I'm taking the ${pickedNick} in ${away.nick} at ${home.nick}. Who you got?`
		: `${away.nick} at ${home.nick}. Who you got?`
	const shareHref = `https://twitter.com/intent/tweet?${new URLSearchParams({
		text: shareText,
		url: `${SITE_URL}/predictions/pick/${pick._id}`,
	}).toString()}`

	return (
		<div>
			{canVote ? (
				<>
					{error && (
						<p role="alert" className="mb-2 text-xs font-medium text-rose-300">
							{error}
						</p>
					)}
					<div className="grid grid-cols-2 gap-2.5">
						{sides.map((s) => (
							<button
								key={s.side}
								type="button"
								disabled={pending}
								onClick={() => vote(s.side)}
								aria-label={`Pick the ${s.info.nick} to win`}
								className="group flex flex-col items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-4 transition-colors hover:border-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:opacity-60"
							>
								<span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-zinc-400">
									<span aria-hidden className="h-2 w-2 rounded-full ring-1 ring-white/20" style={{ backgroundColor: s.info.color }} />
									{s.info.abbr}
								</span>
								<span className="font-serif text-xl font-bold text-zinc-50">{s.info.nick}</span>
							</button>
						))}
					</div>
					<p className="mt-2.5 text-xs text-zinc-500">
						{total > 0 ? `${total} reader pick${total === 1 ? "" : "s"} so far. ` : "Be the first to pick. "}Results show after you vote.
					</p>
				</>
			) : (
				<div>
					<div
						className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-800"
						role="img"
						aria-label={total > 0 ? `${away.nick} ${pctAway} percent, ${home.nick} ${pctHome} percent of reader picks` : "No reader picks yet"}
					>
						{total > 0 && (
							<>
								<div className="h-full rounded-l-full bg-zinc-50 transition-all duration-500" style={{ width: `${pctAway}%` }} />
								<div className="h-full rounded-r-full bg-zinc-500 transition-all duration-500" style={{ width: `${pctHome}%` }} />
							</>
						)}
					</div>
					<div className="mt-2.5 flex items-center justify-between text-sm tabular-nums">
						<span className="inline-flex items-center gap-1.5 font-semibold text-zinc-100">
							<span aria-hidden className="h-2 w-2 rounded-sm bg-zinc-50" />
							{away.nick} {total > 0 ? `${pctAway}%` : "—"}
							{choice === "away" && <span className="text-xs font-normal text-zinc-400">(you)</span>}
						</span>
						<span className="inline-flex items-center gap-1.5 font-semibold text-zinc-100">
							{choice === "home" && <span className="text-xs font-normal text-zinc-400">(you)</span>}
							{home.nick} {total > 0 ? `${pctHome}%` : "—"}
							<span aria-hidden className="h-2 w-2 rounded-sm bg-zinc-500" />
						</span>
					</div>
					<p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
						{locked && !voted ? (
							<>
								<Lock aria-hidden className="h-3 w-3" /> Picks are closed. {total} reader{total === 1 ? "" : "s"} weighed in.
							</>
						) : (
							<>
								{total} reader pick{total === 1 ? "" : "s"}. Thanks for weighing in.
							</>
						)}
					</p>
				</div>
			)}

			<a
				href={shareHref}
				target="_blank"
				rel="noopener noreferrer"
				className={cn(
					"mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline",
					canVote && "opacity-90"
				)}
			>
				<Share2 aria-hidden className="h-4 w-4" /> Challenge a friend
				<span className="sr-only"> (opens in a new tab)</span>
			</a>
		</div>
	)
}
