"use client"

import { useState } from "react"
import { Trophy } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, hasVoted, markVoted } from "@/lib/utils"
import urlFor from "../lib/urlFor"

type Props = {
	docId: string
	candidates: PotmCandidate[]
}

function PlayerOfTheGame({ docId, candidates }: Props) {
	const [counts, setCounts] = useState<Record<string, number>>(() =>
		Object.fromEntries(candidates.map((c) => [c._key, c.votes ?? 0]))
	)
	const storageKey = `potm:${docId}`
	const [voted, setVoted] = useState(() => hasVoted(storageKey))
	const [picked, setPicked] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	const total = Object.values(counts).reduce((a, b) => a + b, 0)

	async function vote(candidateKey: string) {
		if (voted || pending) return
		setPending(true)
		setCounts((c) => ({ ...c, [candidateKey]: (c[candidateKey] ?? 0) + 1 }))
		setPicked(candidateKey)
		setVoted(true)
		markVoted(storageKey)

		try {
			await fetch("/api/potm-vote", {
				method: "POST",
				body: JSON.stringify({ _id: docId, candidateKey }),
			})
		} catch (err) {
			console.log("potm vote failed", err)
		} finally {
			setPending(false)
		}
	}

	if (!candidates?.length) return null

	return (
		<Card className="border-border/70 p-6">
			<p className="font-serif text-xl font-bold">Player of the Game</p>
			<p className="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
				{total} vote{total === 1 ? "" : "s"} cast
			</p>

			<div className="grid gap-3 sm:grid-cols-2">
				{candidates.map((c) => {
					const count = counts[c._key] ?? 0
					const pct = total > 0 ? Math.round((count / total) * 100) : 0
					const isLeader = voted && count > 0 && count === Math.max(...Object.values(counts))
					return (
						<button
							key={c._key}
							type="button"
							disabled={voted}
							onClick={() => vote(c._key)}
							className={cn(
								"relative flex items-center gap-3 overflow-hidden rounded-md border p-3 text-left transition-colors",
								picked === c._key ? "border-primary" : "border-border",
								voted ? "cursor-default" : "hover:border-primary"
							)}
						>
							{voted && (
								<div
									className="absolute inset-y-0 left-0 bg-accent transition-all duration-500"
									style={{ width: `${pct}%` }}
								/>
							)}
							<Avatar className="relative h-10 w-10 shrink-0">
								{c.image && <AvatarImage src={urlFor(c.image).width(80).height(80).fit("crop").url()} alt={c.name} />}
								<AvatarFallback>{c.name?.[0]}</AvatarFallback>
							</Avatar>
							<span className="relative flex flex-1 items-center gap-1.5 font-semibold">
								{isLeader && <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" />}
								{c.name}
							</span>
							{voted && <span className="relative text-sm tabular-nums text-muted-foreground">{pct}%</span>}
						</button>
					)
				})}
			</div>
		</Card>
	)
}

export default PlayerOfTheGame
