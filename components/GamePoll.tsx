"use client"

import { useEffect, useState } from "react"
import { Trophy } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn, hasVoted, markVoted } from "@/lib/utils"

type Props = {
	docId: string
	question: string
	optionA: string
	optionB: string
	initialVotesA?: number
	initialVotesB?: number
}

function GamePoll({ docId, question, optionA, optionB, initialVotesA, initialVotesB }: Props) {
	const [votesA, setVotesA] = useState(initialVotesA ?? 0)
	const [votesB, setVotesB] = useState(initialVotesB ?? 0)
	const storageKey = `poll:${docId}`
	// Start with SSR-safe defaults (no localStorage access during render) so the
	// server-rendered HTML and the client's first hydration pass match exactly.
	// The real, persisted vote/choice is picked up client-side in the effect below.
	const [choice, setChoice] = useState<"A" | "B" | null>(null)
	const [voted, setVoted] = useState(false)
	const [pending, setPending] = useState(false)

	useEffect(() => {
		setVoted(hasVoted(storageKey))
		try {
			const stored = window.localStorage.getItem(`raiders-rundown:poll-choice:${docId}`) as "A" | "B" | null
			if (stored) setChoice(stored)
		} catch {
			// ignore - storage may be unavailable (private mode, etc.)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [docId, storageKey])

	const total = votesA + votesB
	const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50
	const pctB = 100 - pctA

	async function vote(pick: "A" | "B") {
		if (voted || pending) return
		setPending(true)
		if (pick === "A") setVotesA((v) => v + 1)
		else setVotesB((v) => v + 1)
		setChoice(pick)
		setVoted(true)
		markVoted(storageKey)
		try {
			window.localStorage.setItem(`raiders-rundown:poll-choice:${docId}`, pick)
		} catch {
			// ignore
		}

		try {
			await fetch("/api/poll-vote", {
				method: "POST",
				body: JSON.stringify({ _id: docId, choice: pick }),
			})
		} catch (err) {
			console.log("poll vote failed", err)
		} finally {
			setPending(false)
		}
	}

	return (
		<Card className="border-border/70 p-6">
			<p className="font-serif text-xl font-bold">{question}</p>
			<p className="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
				{total} vote{total === 1 ? "" : "s"}
			</p>

			<div className="space-y-3">
				{([
					["A", optionA, votesA, pctA],
					["B", optionB, votesB, pctB],
				] as const).map(([key, label, count, pct]) => {
					const isLeader = voted && total > 0 && pctA !== pctB && pct === Math.max(pctA, pctB)
					return (
						<button
							key={key}
							type="button"
							disabled={voted}
							onClick={() => vote(key)}
							className={cn(
								"relative w-full overflow-hidden rounded-md border text-left transition-colors",
								choice === key ? "border-primary" : "border-border",
								voted ? "cursor-default" : "hover:border-primary"
							)}
						>
							{voted && (
								<div
									className="absolute inset-y-0 left-0 bg-accent transition-all duration-500"
									style={{ width: `${pct}%` }}
								/>
							)}
							<div className="relative flex items-center justify-between px-4 py-3">
								<span className="flex items-center gap-1.5 font-semibold">
									{isLeader && <Trophy className="h-3.5 w-3.5 text-primary" />}
									{label}
								</span>
								{voted && <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>}
							</div>
						</button>
					)
				})}
			</div>
		</Card>
	)
}

export default GamePoll
