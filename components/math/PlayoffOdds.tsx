import Link from "@/components/SiteLink"

import { DIVISIONS, teamInfo } from "@/lib/nfl"
import { cn } from "@/lib/utils"
import type { TeamDetail } from "@/lib/math/report"
import { TeamChip } from "@/components/predictions/TeamChip"
import { oddsText } from "./charts"

const recordText = (r: { w: number; l: number; t: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`

function Division({ name, teams, sims }: { name: string; teams: TeamDetail[]; sims: number }) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
			<table className="w-full text-left text-sm">
				<caption className="border-b border-border bg-muted/50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{name}</caption>
				<thead className="sr-only">
					<tr>
						<th scope="col">Team</th>
						<th scope="col">Record</th>
						<th scope="col">Projected wins</th>
						<th scope="col">Playoff chance</th>
						<th scope="col">Division chance</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{teams.map((t) => {
						const o = t.odds
						if (!o) return null
						const isLV = t.abbr === "LV"
						return (
							<tr key={t.abbr} className={cn(isLV && "bg-muted/60")}>
								<td className="px-3 py-2.5">
									<Link href={`#team-${t.abbr}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
										<TeamChip team={t.team} />
										<span className={cn(isLV && "font-extrabold")}>{t.nick}</span>
									</Link>
								</td>
								<td className="px-2 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{recordText(t.record)}</td>
								<td className="hidden px-2 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">{o.projWins.toFixed(1)} W</td>
								<td className="px-3 py-2.5">
									<div className="flex items-center justify-end gap-2">
										<span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
											<span className="block h-full bg-foreground" style={{ width: `${Math.round(o.playoffs * 100)}%` }} />
										</span>
										<span className="w-10 text-right font-serif text-base font-bold tabular-nums">{oddsText(o.playoffs, sims)}</span>
									</div>
								</td>
								<td className="w-12 px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
									<span className="sr-only">Division </span>
									{oddsText(o.division, sims)}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

/**
 * The simulated standings, laid out like real ones: each division with its four teams, best odds first.
 * Teams link down to their panel in the table below.
 */
export default function PlayoffOdds({ teams, sims }: { teams: TeamDetail[]; sims: number }) {
	const divisions = DIVISIONS.map((name) => ({
		name,
		teams: teams.filter((t) => teamInfo(t.team).division === name && t.odds).sort((a, b) => (b.odds?.division ?? 0) - (a.odds?.division ?? 0) || (b.odds?.playoffs ?? 0) - (a.odds?.playoffs ?? 0)),
	})).filter((d) => d.teams.length > 0)
	const afc = divisions.filter((d) => d.name.startsWith("AFC"))
	const nfc = divisions.filter((d) => d.name.startsWith("NFC"))
	return (
		<div className="space-y-8">
			{[
				["AFC", afc],
				["NFC", nfc],
			].map(([conf, list]) => (
				<div key={conf as string}>
					<h3 className="mb-3 font-serif text-xl font-bold">{conf as string}</h3>
					<div className="grid gap-3 lg:grid-cols-2">
						{(list as typeof divisions).map((d) => (
							<Division key={d.name} name={d.name} teams={d.teams} sims={sims} />
						))}
					</div>
				</div>
			))}
		</div>
	)
}
