"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn, hasVoted, markVoted } from "@/lib/utils"

const REACTIONS: { key: "fire" | "thumbsDown" | "angry"; emoji: string; label: string }[] = [
	{ key: "fire", emoji: "🔥", label: "Fire" },
	{ key: "thumbsDown", emoji: "👎", label: "Not it" },
	{ key: "angry", emoji: "😡", label: "Furious" },
]

type Props = {
	docId: string
	initialReactions?: Reactions
}

function ReactionBar({ docId, initialReactions }: Props) {
	const [counts, setCounts] = useState({
		fire: initialReactions?.fire ?? 0,
		thumbsDown: initialReactions?.thumbsDown ?? 0,
		angry: initialReactions?.angry ?? 0,
	})
	const storageKey = `react:${docId}`
	const [voted, setVoted] = useState(() => hasVoted(storageKey))
	const [pending, setPending] = useState(false)

	async function react(reaction: (typeof REACTIONS)[number]["key"]) {
		if (voted || pending) return
		setPending(true)
		setCounts((c) => ({ ...c, [reaction]: c[reaction] + 1 }))
		setVoted(true)
		markVoted(storageKey)

		try {
			await fetch("/api/react", {
				method: "POST",
				body: JSON.stringify({ _id: docId, reaction }),
			})
		} catch (err) {
			console.log("reaction failed", err)
		} finally {
			setPending(false)
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{REACTIONS.map(({ key, emoji, label }) => (
				<Button
					key={key}
					type="button"
					variant="outline"
					size="sm"
					disabled={voted}
					onClick={() => react(key)}
					className={cn("gap-1.5", voted && "opacity-70")}
					aria-label={label}
				>
					<span>{emoji}</span>
					<span className="tabular-nums">{counts[key]}</span>
				</Button>
			))}
		</div>
	)
}

export default ReactionBar
