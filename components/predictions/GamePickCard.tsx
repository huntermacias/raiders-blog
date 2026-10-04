"use client"

import { useEffect, useState } from "react"
import Link from "@/components/SiteLink"
import { ArrowRight, Lock, Share2, Users } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn, hasVoted, markVoted } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import { type GamePrediction, type Side, gradeGame, involvesRaiders, predictedWinner } from "@/lib/predictions"
import { TeamChip } from "./TeamChip"
import { PickPill } from "./StatusPill"
import KeysScorecard from "./KeysScorecard"

const SITE_URL = "https://www.raidersrundown.com"

// Fixed timezone so the server render and the client hydration agree exactly.
function formatKickoff(iso: string) {
	return new Date(iso).toLocaleString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "America/Los_Angeles",
		timeZoneName: "short",
	})
}

export default function GamePickCard({ pick }: { pick: GamePrediction }) {
	const grade = gradeGame(pick)
	const away = teamInfo(pick.awayTeam)
	const home = teamInfo(pick.homeTeam)
	const pickSide = predictedWinner(pick)

	const [votesAway, setVotesAway] = useState(pick.readerVotesAway ?? 0)
	const [votesHome, setVotesHome] = useState(pick.readerVotesHome ?? 0)
	// SSR-safe defaults (no localStorage / Date.now during render); the real
	// values are picked up in the effect so hydration always matches.
	const [locked, setLocked] = useState(grade.final)
	const [voted, setVoted] = useState(false)
	const [choice, setChoice] = useState<Side | null>(null)
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const storageKey = `pick:${pick._id}`
	const choiceKey = `raiders-rundown:pick-choice:${pick._id}`

	useEffect(() => {
		setLocked(grade.final || Date.now() >= new Date(pick.kickoff).getTime())
		setVoted(hasVoted(storageKey))
		try {
			const stored = window.localStorage.getItem(choiceKey) as Side | null
			if (stored === "away" || stored === "home") setChoice(stored)
		} catch {
			// storage unavailable (private mode etc.) - fine
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pick._id, pick.kickoff, grade.final])

	const total = votesAway + votesHome
	const pctAway = total > 0 ? Math.round((votesAway / total) * 100) : 0
	const pctHome = total > 0 ? 100 - pctAway : 0
	const canVote = !locked && !voted

	async function vote(side: Side) {
		if (!canVote || pending) return
		setPending(true)
		setError(null)

		// Optimistic: show the pick right away, but only keep it if the server
		// confirms the write. Otherwise roll everything back so a failed save
		// never looks like a counted vote (or locks the reader out).
		const prevAway = votesAway
		const prevHome = votesHome
		if (side === "away") setVotesAway(prevAway + 1)
		else setVotesHome(prevHome + 1)
		setChoice(side)
		setVoted(true)

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

			// Not saved: undo the optimistic update.
			setVotesAway(prevAway)
			setVotesHome(prevHome)
			setChoice(null)
			setVoted(false)
			if (res.status === 409) {
				setLocked(true)
			} else {
				console.log("prediction vote rejected", res.status)
				setError("Couldn't save your pick. Please try again in a moment.")
			}
		} catch (err) {
			console.log("prediction vote failed", err)
			setVotesAway(prevAway)
			setVotesHome(prevHome)
			setChoice(null)
			setVoted(false)
			setError("Couldn't save your pick. Check your connection and try again.")
		} finally {
			setPending(false)
		}
	}

	const rows = [
		{ side: "away" as const, info: away, pred: pick.predictedAwayScore, actual: pick.actualAwayScore },
		{ side: "home" as const, info: home, pred: pick.predictedHomeScore, actual: pick.actualHomeScore },
	]

	const predMargin = Math.abs(pick.predictedHomeScore - pick.predictedAwayScore)
	const actualMargin = grade.final ? Math.abs((pick.actualHomeScore as number) - (pick.actualAwayScore as number)) : 0
	const actualWinnerNick =
		grade.final && pick.actualAwayScore !== pick.actualHomeScore
			? (pick.actualHomeScore as number) > (pick.actualAwayScore as number)
				? home.nick
				: away.nick
			: null
	const pickNick = pickSide === "home" ? home.nick : away.nick

	const shareText = grade.final
		? `My Week ${pick.week} pick: ${away.nick} ${pick.predictedAwayScore}, ${home.nick} ${pick.predictedHomeScore}. Final: ${pick.actualAwayScore}-${pick.actualHomeScore}.${
				grade.result === "hit" ? " Called it." : grade.result === "miss" ? " Missed." : ""
		  }`
		: `My Week ${pick.week} pick: ${away.nick} ${pick.predictedAwayScore}, ${home.nick} ${pick.predictedHomeScore}. Who you got?`
	const shareHref = `https://twitter.com/intent/tweet?${new URLSearchParams({
		text: shareText,
		url: `${SITE_URL}/predictions/pick/${pick._id}`,
	}).toString()}`

	return (
		<Card id={`pick-${pick._id}`} className={cn("flex h-full scroll-mt-24 flex-col overflow-hidden border-border/70", involvesRaiders(pick) && "ring-1 ring-foreground/20")}>
			<div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-5 py-2.5">
				<div className="min-w-0">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						Week {pick.week}
						{involvesRaiders(pick) && <span className="text-foreground"> &middot; Raiders</span>}
					</p>
					<p className="truncate text-xs text-muted-foreground">{formatKickoff(pick.kickoff)}</p>
				</div>
				<PickPill result={grade.result} />
			</div>

			<div className="flex-1 p-5">
				<div className={cn("mb-2 grid items-end gap-x-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", grade.final ? "grid-cols-[1fr_3.5rem_3.5rem]" : "grid-cols-[1fr_3.5rem]")}>
					<span aria-hidden />
					<span className="text-right">My pick</span>
					{grade.final && <span className="text-right">Final</span>}
				</div>

				<ul className="space-y-2.5">
					{rows.map((r) => {
						const isPick = r.side === pickSide
						const isFinalWinner = grade.final && pick.actualAwayScore !== pick.actualHomeScore && (r.actual as number) > (r.side === "away" ? (pick.actualHomeScore as number) : (pick.actualAwayScore as number))
						return (
							<li key={r.side} className={cn("grid items-center gap-x-3", grade.final ? "grid-cols-[1fr_3.5rem_3.5rem]" : "grid-cols-[1fr_3.5rem]")}>
								<div className="flex min-w-0 items-center gap-2.5">
									<TeamChip team={r.info.name} />
									<span className={cn("truncate text-sm", isPick ? "font-bold" : "font-medium text-muted-foreground")}>{r.info.nick}</span>
									{isPick && (
										<span className="rounded bg-foreground px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-background">Pick</span>
									)}
								</div>
								<span className={cn("text-right font-serif text-2xl tabular-nums", isPick ? "font-bold" : "text-muted-foreground")}>{r.pred}</span>
								{grade.final && (
									<span className={cn("text-right font-serif text-2xl tabular-nums", isFinalWinner ? "font-bold" : "text-muted-foreground")}>{r.actual}</span>
								)}
							</li>
						)
					})}
				</ul>

				{grade.final && grade.marginError !== null && (
					<p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
						Picked <strong className="text-foreground">{pickNick}</strong> by {predMargin}
						{actualWinnerNick ? (
							<>
								{" "}
								&middot; finished <strong className="text-foreground">{actualWinnerNick}</strong> by {actualMargin}
							</>
						) : (
							<> &middot; finished tied</>
						)}{" "}
						&middot;{" "}
						<strong className="whitespace-nowrap text-foreground">{grade.marginError === 0 ? "dead on" : `${grade.marginError} pt${grade.marginError === 1 ? "" : "s"} off`}</strong>
					</p>
				)}

				{pick.writeup && <p className="mt-4 line-clamp-4 text-sm italic leading-relaxed text-muted-foreground">&ldquo;{pick.writeup}&rdquo;</p>}

				{pick.keys && pick.keys.length > 0 && <KeysScorecard keys={pick.keys} variant="compact" className="mt-4" />}

				{(pick.preview?.slug || pick.report?.slug) && (
					<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
						{pick.preview?.slug && (
							<Link href={`/post/${pick.preview.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
								Read the preview <ArrowRight aria-hidden className="h-3.5 w-3.5" />
							</Link>
						)}
						{pick.report?.slug && (
							<Link href={`/games/${pick.report.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
								Read the recap <ArrowRight aria-hidden className="h-3.5 w-3.5" />
							</Link>
						)}
					</div>
				)}
			</div>

			<div className="border-t border-border/60 bg-muted/30 px-5 py-4">
				<div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<Users aria-hidden className="h-3.5 w-3.5" /> Reader picks
					</span>
					<span className="tabular-nums normal-case tracking-normal">
						{total} pick{total === 1 ? "" : "s"}
						{locked && !grade.final && (
							<span className="ml-2 inline-flex items-center gap-1">
								<Lock aria-hidden className="h-3 w-3" /> closed
							</span>
						)}
					</span>
				</div>

				{canVote ? (
					<div>
					{error && (
						<p role="alert" className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
							{error}
						</p>
					)}
					<div className="grid grid-cols-2 gap-2">
						{rows.map((r) => (
							<button
								key={r.side}
								type="button"
								disabled={pending}
								onClick={() => vote(r.side)}
								aria-label={`Pick the ${r.info.nick} to win`}
								className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:border-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
							>
								{r.info.nick}
							</button>
						))}
					</div>
					</div>
				) : (
					<div>
						<div
							className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-secondary"
							role="img"
							aria-label={total > 0 ? `${away.nick} ${pctAway} percent, ${home.nick} ${pctHome} percent of reader picks` : "No reader picks yet"}
						>
							{total > 0 && (
								<>
									<div className="h-full rounded-l-full bg-foreground transition-all duration-500" style={{ width: `${pctAway}%` }} />
									<div className="h-full rounded-r-full bg-muted-foreground/45 transition-all duration-500" style={{ width: `${pctHome}%` }} />
								</>
							)}
						</div>
						<div className="mt-2 flex items-center justify-between text-xs tabular-nums">
							<span className="inline-flex items-center gap-1.5 font-semibold">
								<span aria-hidden className="h-2 w-2 rounded-sm bg-foreground" />
								{away.nick} {total > 0 ? `${pctAway}%` : "—"}
								{choice === "away" && <span className="font-normal text-muted-foreground">(your pick)</span>}
							</span>
							<span className="inline-flex items-center gap-1.5 font-semibold">
								{choice === "home" && <span className="font-normal text-muted-foreground">(your pick)</span>}
								{home.nick} {total > 0 ? `${pctHome}%` : "—"}
								<span aria-hidden className="h-2 w-2 rounded-sm bg-muted-foreground/45" />
							</span>
						</div>
						{grade.final && grade.readers !== "none" && grade.readers !== "pending" && (
							<p className="mt-2 text-xs text-muted-foreground">
								Readers {grade.readers === "hit" ? "called it" : "missed"} on this one.
							</p>
						)}
					</div>
				)}

				<div className="mt-3 flex justify-end">
					<a
						href={shareHref}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
					>
						<Share2 aria-hidden className="h-3.5 w-3.5" /> Share this pick
						<span className="sr-only"> (opens in a new tab)</span>
					</a>
				</div>
			</div>
		</Card>
	)
}
