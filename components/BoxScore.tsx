import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type Props = {
	opponent: string
	homeAway: "home" | "away"
	raidersScore: number
	opponentScore: number
	teamStats?: TeamStatRow[]
	quarterScores?: QuarterScoreRow[]
	playerStats?: PlayerStatRow[]
}

function QuarterScoreboard({ opponent, quarterScores }: { opponent: string; quarterScores: QuarterScoreRow[] }) {
	const raidersTotal = quarterScores.reduce((sum, q) => sum + (q.raiders ?? 0), 0)
	const opponentTotal = quarterScores.reduce((sum, q) => sum + (q.opponent ?? 0), 0)

	return (
		<div className="overflow-x-auto px-6 py-4">
			<table className="w-full min-w-[360px] text-sm">
				<thead>
					<tr className="text-xs uppercase tracking-wide text-muted-foreground">
						<th className="pb-2 text-left font-semibold">&nbsp;</th>
						{quarterScores.map((q) => (
							<th key={q._key} className="pb-2 text-center font-semibold">
								{q.quarter}
							</th>
						))}
						<th className="pb-2 text-center font-semibold">F</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/60">
					<tr>
						<td className="py-1.5 font-semibold">LVR</td>
						{quarterScores.map((q) => (
							<td key={q._key} className="py-1.5 text-center tabular-nums text-muted-foreground">
								{q.raiders ?? "-"}
							</td>
						))}
						<td className="py-1.5 text-center font-bold tabular-nums">{raidersTotal}</td>
					</tr>
					<tr>
						<td className="py-1.5 font-semibold">{opponent.slice(0, 3).toUpperCase()}</td>
						{quarterScores.map((q) => (
							<td key={q._key} className="py-1.5 text-center tabular-nums text-muted-foreground">
								{q.opponent ?? "-"}
							</td>
						))}
						<td className="py-1.5 text-center font-bold tabular-nums">{opponentTotal}</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

function parseNumeric(value: string) {
	const n = parseFloat((value ?? "").replace(/[^0-9.\-]/g, ""))
	return Number.isFinite(n) ? n : null
}

function StatBar({ stat, raiders, opponent }: TeamStatRow) {
	const r = parseNumeric(raiders)
	const o = parseNumeric(opponent)
	const showBar = r !== null && o !== null && r + o > 0
	const raidersPct = showBar ? Math.round((r! / (r! + o!)) * 100) : 50

	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5 text-sm">
			<span className={cn("text-right font-semibold tabular-nums", showBar && raidersPct >= 50 && "text-foreground")}>
				{raiders}
			</span>
			<span className="w-32 text-center text-xs uppercase tracking-wide text-muted-foreground sm:w-40">
				{stat}
			</span>
			<span className="font-semibold tabular-nums">{opponent}</span>
			{showBar && (
				<div className="col-span-3 -mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
					<div className="bg-primary" style={{ width: `${raidersPct}%` }} />
					<div className="bg-border" style={{ width: `${100 - raidersPct}%` }} />
				</div>
			)}
		</div>
	)
}

function BoxScore({ opponent, homeAway, raidersScore, opponentScore, teamStats, quarterScores, playerStats }: Props) {
	const raidersWon = raidersScore > opponentScore
	const grouped = (playerStats ?? []).reduce<Record<string, PlayerStatRow[]>>((acc, row) => {
		acc[row.category] = acc[row.category] ?? []
		acc[row.category].push(row)
		return acc
	}, {})

	return (
		<Card className="overflow-hidden border-border/70">
			<div className="flex items-center justify-between bg-foreground px-6 py-5 text-background">
				<div>
					<p className="text-xs uppercase tracking-widest text-background/70">
						{homeAway === "home" ? "Raiders host" : "Raiders at"} {opponent}
					</p>
					<p className="mt-1 font-serif text-2xl font-bold">Final Score</p>
				</div>
				<div className="flex items-center gap-4 text-3xl font-bold tabular-nums">
					<span className={raidersWon ? "" : "text-background/50"}>LVR {raidersScore}</span>
					<span className="text-background/40">&ndash;</span>
					<span className={!raidersWon ? "" : "text-background/50"}>{opponentScore} {opponent.slice(0, 3).toUpperCase()}</span>
				</div>
			</div>

			{quarterScores && quarterScores.length > 0 && (
				<>
					<Separator />
					<QuarterScoreboard opponent={opponent} quarterScores={quarterScores} />
				</>
			)}

			{teamStats && teamStats.length > 0 && (
				<div className="px-6 py-4">
					<div className="mb-1 grid grid-cols-[1fr_auto_1fr] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<span className="text-right">Raiders</span>
						<span className="w-32 text-center sm:w-40">Team Stats</span>
						<span>{opponent}</span>
					</div>
					<div className="divide-y divide-border/60">
						{teamStats.map((row) => (
							<StatBar key={row._key} {...row} />
						))}
					</div>
				</div>
			)}

			{Object.keys(grouped).length > 0 && (
				<>
					<Separator />
					<div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
						{Object.entries(grouped).map(([category, rows]) => (
							<div key={category}>
								<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{category}
								</p>
								<div className="space-y-2">
									{rows.map((row) => (
										<div key={row._key} className="flex items-baseline justify-between gap-4 text-sm">
											<span className="font-semibold">{row.player}</span>
											<span className="text-right tabular-nums text-muted-foreground">{row.line}</span>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</>
			)}
		</Card>
	)
}

export default BoxScore
