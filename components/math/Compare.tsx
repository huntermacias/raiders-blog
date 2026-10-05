"use client"

import { useState } from "react"
import { ArrowLeftRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { type CompareTeam, headToHead } from "@/lib/math/headToHead"
import { TeamChip } from "@/components/predictions/TeamChip"
import { oddsText } from "./charts"

const pct = (p: number) => `${Math.round(p * 100)}%`
const signedPts = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : `−${Math.abs(n).toFixed(1)}`)
const recordText = (r: { w: number; l: number; t: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`

type Row = { label: string; a: string; b: string; /** Which side is better; "high"/"low" by the numbers below. */ lead: "a" | "b" | null }

const lead = (a: number | null, b: number | null, better: "high" | "low"): "a" | "b" | null => {
	if (a == null || b == null || a === b) return null
	return (better === "high" ? a > b : a < b) ? "a" : "b"
}

function rowsFor(a: CompareTeam, b: CompareTeam, sims: number): Row[] {
	const rows: Row[] = [
		{ label: "My rank", a: `No. ${a.blogger}`, b: `No. ${b.blogger}`, lead: lead(a.blogger, b.blogger, "low") },
		{ label: "The math’s rank", a: `No. ${a.math}`, b: `No. ${b.math}`, lead: lead(a.math, b.math, "low") },
		{ label: "Math rating", a: Math.round(a.rating).toString(), b: Math.round(b.rating).toString(), lead: lead(a.rating, b.rating, "high") },
		{ label: "Record", a: recordText(a.record), b: recordText(b.record), lead: lead(a.record.w - a.record.l, b.record.w - b.record.l, "high") },
	]
	if (a.playoffs != null && b.playoffs != null) {
		rows.push({ label: "Make the playoffs", a: oddsText(a.playoffs, sims), b: oddsText(b.playoffs, sims), lead: lead(a.playoffs, b.playoffs, "high") })
		rows.push({ label: "Win the division", a: oddsText(a.division ?? 0, sims), b: oddsText(b.division ?? 0, sims), lead: lead(a.division, b.division, "high") })
	}
	if (a.projWins != null && b.projWins != null) rows.push({ label: "Projected wins", a: a.projWins.toFixed(1), b: b.projWins.toFixed(1), lead: lead(a.projWins, b.projWins, "high") })
	if (a.sosRank != null && b.sosRank != null) rows.push({ label: "Schedule left (1 = hardest)", a: `No. ${a.sosRank}`, b: `No. ${b.sosRank}`, lead: null })
	if (a.margin != null && b.margin != null) rows.push({ label: "Scoring margin per game", a: signedPts(a.margin), b: signedPts(b.margin), lead: lead(a.margin, b.margin, "high") })
	if (a.yardageMargin != null && b.yardageMargin != null) rows.push({ label: "Margin by yards per play", a: signedPts(a.yardageMargin), b: signedPts(b.yardageMargin), lead: lead(a.yardageMargin, b.yardageMargin, "high") })
	if (a.turnoverMargin != null && b.turnoverMargin != null) rows.push({ label: "Turnover margin per game", a: signedPts(a.turnoverMargin), b: signedPts(b.turnoverMargin), lead: lead(a.turnoverMargin, b.turnoverMargin, "high") })
	return rows
}

/** Pick any two teams: ratings, odds, and what the math says if they played. */
export default function Compare({ teams, sims, initial = ["LV", "KC"] }: { teams: CompareTeam[]; sims: number; initial?: [string, string] }) {
	const sorted = [...teams].sort((x, y) => x.name.localeCompare(y.name))
	const find = (abbr: string) => teams.find((t) => t.abbr === abbr)
	const [first, second] = [find(initial[0]) ?? teams[0], find(initial[1]) ?? teams.find((t) => t.abbr !== (find(initial[0]) ?? teams[0]).abbr) ?? teams[1]]
	const [aAbbr, setA] = useState(first?.abbr)
	const [bAbbr, setB] = useState(second?.abbr)
	const a = find(aAbbr ?? "")
	const b = find(bAbbr ?? "")
	if (!a || !b) return null
	const same = a.abbr === b.abbr
	const h = same ? null : headToHead(a, b)
	const fav = h ? (h.neutral >= 0.5 ? a : b) : null
	const favPct = h ? Math.round(Math.max(h.neutral, 1 - h.neutral) * 100) : 0
	const aPct = h ? Math.round(h.neutral * 100) : 50

	const select = (id: string, value: string, onChange: (v: string) => void, label: string) => (
		<div className="min-w-0 flex-1">
			<label htmlFor={id} className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>
			<select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground">
				{sorted.map((t) => (
					<option key={t.abbr} value={t.abbr}>{t.name}</option>
				))}
			</select>
		</div>
	)

	return (
		<div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
			<div className="flex items-end gap-2">
				{select("compare-a", a.abbr, setA, "Team one")}
				<button type="button" onClick={() => { setA(b.abbr); setB(a.abbr) }} aria-label="Swap the two teams" className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground">
					<ArrowLeftRight aria-hidden className="h-4 w-4" />
				</button>
				{select("compare-b", b.abbr, setB, "Team two")}
			</div>

			{same || !h || !fav ? (
				<p role="status" className="mt-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Pick two different teams to compare.</p>
			) : (
				<>
					<div role="status" className="mt-5">
						<p className="font-serif text-2xl font-bold leading-snug">
							On a neutral field the math gives the {fav.nick} a {favPct}% chance.
						</p>
						<div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
							<span className="block h-full" style={{ width: `${aPct}%`, backgroundColor: a.color }} />
							<span className="block h-full border-l-2 border-card" style={{ width: `${100 - aPct}%`, backgroundColor: b.color }} />
						</div>
						<div className="mt-1.5 flex justify-between text-xs font-semibold tabular-nums">
							<span>{a.nick} {aPct}%</span>
							<span>{100 - aPct}% {b.nick}</span>
						</div>
						<p className="mt-2 text-sm text-muted-foreground tabular-nums">
							At {a.nick} home: {pct(h.atA)} {a.nick}. At {b.nick} home: {pct(h.atB)} {a.nick}. Expected margin on a neutral field: {fav.nick} by {Math.abs(h.margin).toFixed(1)}.
							{h.meeting ? ` They meet in Week ${h.meeting.week} ${h.meeting.aHome ? `in ${a.nick} country` : `in ${b.nick} country`}: ${pct(h.meeting.chance)} for the ${a.nick}.` : " They don’t meet again in the regular season."}
						</p>
					</div>

					<table className="mx-auto mt-5 w-full max-w-2xl rounded-lg border border-border bg-background text-sm">
						<caption className="sr-only">{a.name} compared with {b.name}</caption>
						<thead>
							<tr className="border-b border-border text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
								<th scope="col" className="px-3 py-2 text-left"><TeamChip team={a.name} /></th>
								<th scope="col" className="px-2 py-2 text-center"><span className="sr-only">Stat</span></th>
								<th scope="col" className="px-3 py-2 text-right"><TeamChip team={b.name} /></th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{rowsFor(a, b, sims).map((r) => (
								<tr key={r.label}>
									<td className={cn("px-3 py-2 tabular-nums", r.lead === "a" ? "font-bold" : "text-muted-foreground")}>
										{r.a}
										{r.lead === "a" && <span className="sr-only"> (better)</span>}
									</td>
									<th scope="row" className="px-2 py-2 text-center text-xs font-normal text-muted-foreground">{r.label}</th>
									<td className={cn("px-3 py-2 text-right tabular-nums", r.lead === "b" ? "font-bold" : "text-muted-foreground")}>
										{r.b}
										{r.lead === "b" && <span className="sr-only"> (better)</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className="mt-2 text-[11px] text-muted-foreground">Bold is the better number. Margins are points per game; the yards-per-play margin is net yards per play converted to the scoring scale.</p>
				</>
			)}
		</div>
	)
}
