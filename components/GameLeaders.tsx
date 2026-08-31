import { Star } from "lucide-react"

import { Card } from "@/components/ui/card"

function pickLeaders(playerStats?: PlayerStatRow[]) {
	if (!playerStats?.length) return []

	const flagged = playerStats.filter((row) => row.standout)
	if (flagged.length > 0) return flagged.slice(0, 3)

	// No standout flags set (e.g. older/seeded content) -- fall back to the
	// first stat line in each category so the highlight row is never empty.
	const seen = new Set<string>()
	const fallback: PlayerStatRow[] = []
	for (const row of playerStats) {
		if (seen.has(row.category)) continue
		seen.add(row.category)
		fallback.push(row)
		if (fallback.length === 3) break
	}
	return fallback
}

function GameLeaders({ playerStats }: { playerStats?: PlayerStatRow[] }) {
	const leaders = pickLeaders(playerStats)
	if (!leaders.length) return null

	return (
		<div className="grid gap-3 sm:grid-cols-3">
			{leaders.map((row) => (
				<Card key={row._key} className="border-border/70 p-4">
					<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
						<Star className="h-3.5 w-3.5 fill-primary" />
						{row.category}
					</div>
					<p className="mt-1.5 font-serif text-lg font-bold leading-snug">{row.player}</p>
					<p className="mt-0.5 text-sm text-muted-foreground">{row.line}</p>
				</Card>
			))}
		</div>
	)
}

export default GameLeaders
