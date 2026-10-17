"use client"

import { useMemo } from "react"

import { teamByAbbr } from "@/lib/nfl"
import { divisionShort } from "@/lib/playoffs/format"
import { recordText } from "@/lib/playoffs/season"
import { describeTie } from "@/lib/playoffs/summary"
import { type SeasonEvent, type Timeline, raceSummary } from "@/lib/playoffs/timeline"
import type { Conference } from "@/lib/playoffs/types"
import TeamTag from "./TeamTag"

type Props = {
	timeline: Timeline
	events: readonly SeasonEvent[]
	/** The frame for today, to compare the finished scenario against. */
	nowIndex: number
	onTeam: (team: string) => void
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="rounded-xl border border-lab-line bg-lab-surface p-4">
			<h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">{title}</h3>
			<div className="mt-2 text-sm leading-relaxed text-lab-soft">{children}</div>
		</section>
	)
}

/** What happened in this scenario, from the frames alone. Nothing here is a guess: every line is a fact about the table. */
export default function SeasonStory({ timeline, events, nowIndex, onTeam }: Props) {
	const { final, frames } = timeline
	const race = useMemo(() => raceSummary(timeline), [timeline])
	const lastFrame = frames[frames.length - 1]
	const nowFrame = frames[Math.min(nowIndex, frames.length - 1)]

	const movers = useMemo(() => {
		const all = Object.values(race.teams)
		return {
			jumps: [...all].filter((t) => t.biggestJump.places >= 3).sort((a, b) => b.biggestJump.places - a.biggestJump.places || a.team.localeCompare(b.team)).slice(0, 3),
			drops: [...all].filter((t) => t.biggestDrop.places >= 3).sort((a, b) => b.biggestDrop.places - a.biggestDrop.places || a.team.localeCompare(b.team)).slice(0, 3),
		}
	}, [race])

	const changes = useMemo(() => {
		const rise: string[] = []
		const fall: string[] = []
		for (const c of ["AFC", "NFC"] as Conference[]) {
			for (const id of lastFrame.seeds[c]) if (nowFrame.teams[id].seed === null) rise.push(id)
			for (const id of nowFrame.seeds[c]) if (lastFrame.teams[id].seed === null) fall.push(id)
		}
		return { rise, fall }
	}, [lastFrame, nowFrame])

	const hottest = Object.entries(race.leadChanges).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
	const lateOut = events.filter((e) => e.kind === "eliminated" && e.week >= lastFrame.week - 2)
	const closeTies = final.ties.filter((d) => final.conferences.AFC.seeds.includes(d.placed) || final.conferences.NFC.seeds.includes(d.placed)).slice(0, 3)

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<Block title="The playoff field">
				<ul className="m-0 list-none space-y-2 p-0">
					{(["AFC", "NFC"] as const).map((c) => (
						<li key={c}>
							<span className="mr-2 font-bold text-lab-ink">{c}</span>
							{final.conferences[c].seeds.map((id, i) => (
								<button key={id} type="button" onClick={() => onTeam(id)} className="mr-2 inline-flex items-center gap-1 rounded px-0.5 text-lab-ink underline-offset-4 hover:underline">
									<span className="font-mono text-[11px] text-lab-muted">{i + 1}</span>
									<TeamTag id={id} />
									<span className="font-mono text-[11px] text-lab-muted">{recordText(final.teams[id].overall)}</span>
								</button>
							))}
						</li>
					))}
				</ul>
			</Block>

			<Block title="Compared with today">
				{changes.rise.length || changes.fall.length ? (
					<>
						{changes.rise.length ? (
							<p className="m-0">
								In the field now who are not today: <span className="font-semibold text-lab-ink">{changes.rise.join(", ")}</span>.
							</p>
						) : null}
						{changes.fall.length ? (
							<p className="m-0 mt-1.5">
								In the field today and out at the end: <span className="font-semibold text-lab-ink">{changes.fall.join(", ")}</span>.
							</p>
						) : null}
					</>
				) : (
					<p className="m-0">The same fourteen teams are in the field as today.</p>
				)}
			</Block>

			<Block title="Biggest moves">
				{movers.jumps.length || movers.drops.length ? (
					<ul className="m-0 list-none space-y-1 p-0">
						{movers.jumps.map((t) => (
							<li key={`j${t.team}`}>
								<TeamTag id={t.team} /> climbed {t.biggestJump.places} places in Week {t.biggestJump.week}
							</li>
						))}
						{movers.drops.map((t) => (
							<li key={`d${t.team}`}>
								<TeamTag id={t.team} /> fell {t.biggestDrop.places} places in Week {t.biggestDrop.week}
							</li>
						))}
					</ul>
				) : (
					<p className="m-0">No team moved more than two places in a week.</p>
				)}
			</Block>

			<Block title="Races">
				{hottest ? (
					<p className="m-0">
						The {divisionShort(hottest[0])} ({hottest[0].slice(0, 3)}) lead changed hands {hottest[1]} {hottest[1] === 1 ? "time" : "times"}, the most of any division.
					</p>
				) : (
					<p className="m-0">No division lead changed hands after the first week.</p>
				)}
				{lateOut.length ? (
					<p className="m-0 mt-1.5">
						Eliminated in the last weeks: <span className="font-semibold text-lab-ink">{lateOut.map((e) => `${e.team} (Wk ${e.week})`).join(", ")}</span>.
					</p>
				) : null}
				{race.tightWeeks.length ? <p className="m-0 mt-1.5">The last playoff spot and the first team out were level on record in Week{race.tightWeeks.length === 1 ? "" : "s"} {race.tightWeeks.join(", ")}.</p> : null}
			</Block>

			{closeTies.length ? (
				<Block title="Tiebreakers that decided it">
					<ul className="m-0 list-none space-y-1 p-0">
						{closeTies.map((d, i) => (
							<li key={i}>{describeTie(d)}</li>
						))}
					</ul>
				</Block>
			) : null}

			<Block title="Best and worst seasons">
				{(() => {
					const best = Object.values(race.teams).sort((a, b) => b.weeksIn - a.weeksIn || a.bestRank - b.bestRank)[0]
					const worst = Object.values(final.teams).filter((t) => t.seed === null).sort((a, b) => b.pct - a.pct)[0]
					return (
						<>
							{best ? <p className="m-0"><TeamTag id={best.team} nick /> spent {best.weeksIn} of {race.weeks} weeks inside the playoff field.</p> : null}
							{worst ? <p className="m-0 mt-1.5">Best team to miss: <TeamTag id={worst.team} nick /> at {recordText(worst.overall)} ({teamByAbbr(worst.team).division}).</p> : null}
						</>
					)
				})()}
			</Block>
		</div>
	)
}
