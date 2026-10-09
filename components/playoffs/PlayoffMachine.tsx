"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Link2, RotateCcw, Share2, Shuffle, Undo2 } from "lucide-react"

import { trackPlayoff } from "@/lib/analytics"
import { rivalsOf } from "@/lib/playoffs/format"
import { firstOpenWeek, weekProgress } from "@/lib/playoffs/picks"
import { scenarioLink } from "@/lib/playoffs/share"
import type { Conference, Game } from "@/lib/playoffs/types"
import BracketView from "./BracketView"
import GameCard from "./GameCard"
import RaidersOutlook from "./RaidersOutlook"
import StandingsTable from "./StandingsTable"
import { usePlayoffScenario } from "./usePlayoffScenario"

type Tab = "games" | "standings" | "bracket"
type Fill = "week" | "all"

const PATH = "/lab/playoff-machine"
const SITE_URL = "https://www.raidersrundown.com"

const btn =
	"inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line bg-lab-surface px-4 text-sm font-semibold text-lab-ink transition hover:border-lab-line-strong hover:bg-lab-tint disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

export default function PlayoffMachine({ games, season, throughWeek }: { games: Game[]; season: number; throughWeek: number }) {
	const s = usePlayoffScenario(games, season)
	const { sim, picks } = s
	const [tab, setTab] = useState<Tab>("games")
	const [week, setWeek] = useState(() => firstOpenWeek(games))
	const [conference, setConference] = useState<Conference>("AFC")
	const [fill, setFill] = useState<Fill>("all")
	const [keep, setKeep] = useState(true)
	const [copied, setCopied] = useState<"" | "copied" | "manual">("")
	const [canShare, setCanShare] = useState(false)
	const chips = useRef<HTMLDivElement>(null)

	useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])

	const progress = useMemo(() => weekProgress(games, picks), [games, picks])
	const weeks = progress.map((w) => w.week)
	const current = progress.find((w) => w.week === week)
	const pickedCount = Object.keys(picks).length
	const rivals = useMemo(() => rivalsOf(sim, "LV"), [sim])

	const weekGames = useMemo(() => {
		const list = games.filter((g) => g.week === week)
		const rank = (g: Game) => (s.raiders && (g.homeTeam === "LV" || g.awayTeam === "LV") ? 0 : s.raiders && (rivals.has(g.homeTeam) || rivals.has(g.awayTeam)) && g.status !== "final" ? 1 : 2)
		return [...list].sort((a, b) => rank(a) - rank(b) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.id.localeCompare(b.id))
	}, [games, week, s.raiders, rivals])

	// Keep the chosen week's chip in view on a narrow screen.
	useEffect(() => {
		const el = chips.current?.querySelector<HTMLElement>('[aria-current="true"]')
		el?.scrollIntoView({ block: "nearest", inline: "center" })
	}, [week, tab])

	const scope = fill === "week" ? { weeks: [week], keepPicks: keep } : { keepPicks: keep }
	const url = scenarioLink(typeof window === "undefined" ? SITE_URL : window.location.origin, PATH, s.code)

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url)
			setCopied("copied")
			trackPlayoff("playoff_scenario_shared", { picks: pickedCount, method: "copy" })
		} catch {
			setCopied("manual")
		}
		window.setTimeout(() => setCopied((c) => (c === "copied" ? "" : c)), 2500)
	}

	async function nativeShare() {
		try {
			await navigator.share({ title: "My NFL playoff scenario | Raiders Rundown", url })
			trackPlayoff("playoff_scenario_shared", { picks: pickedCount, method: "share" })
		} catch {
			// cancelled
		}
	}

	const tabs: { id: Tab; label: string }[] = [
		{ id: "games", label: "Games" },
		{ id: "standings", label: "Standings" },
		{ id: "bracket", label: "Bracket" },
	]

	const confSwitch = (
		<div role="group" aria-label="Conference" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
			{(["AFC", "NFC"] as const).map((c) => (
				<button
					key={c}
					type="button"
					aria-pressed={conference === c}
					onClick={() => setConference(c)}
					className={`min-h-[40px] min-w-[64px] rounded-md px-4 text-sm font-bold transition ${conference === c ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}
				>
					{c}
				</button>
			))}
		</div>
	)

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" role="switch" aria-checked={s.raiders} onClick={() => s.setRaiders(!s.raiders)} className={`${btn} pr-3`}>
					<span>Raiders mode</span>
					<span aria-hidden="true" className={`relative block h-5 w-9 rounded-full transition ${s.raiders ? "bg-lab-ink" : "bg-lab-line-strong"}`}>
						<span className={`absolute top-0.5 block h-4 w-4 rounded-full bg-lab-page transition-all ${s.raiders ? "left-[18px]" : "left-0.5"}`} />
					</span>
				</button>
				<button type="button" onClick={copyLink} disabled={pickedCount === 0} className={btn} title={pickedCount === 0 ? "Pick some games first" : undefined}>
					{copied === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
					{copied === "copied" ? "Link copied" : "Copy scenario link"}
				</button>
				{canShare && pickedCount > 0 ? (
					<button type="button" onClick={nativeShare} className={btn}>
						<Share2 className="h-4 w-4" aria-hidden="true" />
						Share
					</button>
				) : null}
				<button type="button" onClick={s.reset} disabled={pickedCount === 0} className={btn}>
					<RotateCcw className="h-4 w-4" aria-hidden="true" />
					Reset
				</button>
				{s.undo ? (
					<button type="button" onClick={s.undoLast} className={btn}>
						<Undo2 className="h-4 w-4" aria-hidden="true" />
						Undo {s.undo.label}
					</button>
				) : null}
				<p className="sr-only" role="status" aria-live="polite">
					{copied === "copied" ? "Scenario link copied" : ""}
				</p>
			</div>

			{copied === "manual" ? (
				<label className="block text-xs font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Copy this link
					<input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-1 block min-h-[44px] w-full rounded-lg border border-lab-line bg-lab-surface px-3 font-mono text-xs normal-case tracking-normal text-lab-ink" />
				</label>
			) : null}

			<details className="rounded-xl border border-lab-line bg-lab-surface">
				<summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-sm font-semibold">
					<Shuffle className="h-4 w-4" aria-hidden="true" />
					Quick fill
					<span className="ml-auto text-xs font-normal text-lab-muted">{pickedCount} of {sim.openGames + sim.pickedGames} picked</span>
				</summary>
				<div className="space-y-3 border-t border-lab-line p-4">
					<div className="flex flex-wrap items-center gap-3">
						<div role="group" aria-label="Which games" className="inline-flex rounded-lg border border-lab-line p-0.5">
							{([["all", "All remaining weeks"], ["week", `Week ${week} only`]] as const).map(([id, label]) => (
								<button key={id} type="button" aria-pressed={fill === id} onClick={() => setFill(id)} className={`min-h-[40px] rounded-md px-3 text-sm font-semibold ${fill === id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
									{label}
								</button>
							))}
						</div>
						<label className="inline-flex min-h-[40px] items-center gap-2 text-sm text-lab-soft">
							<input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4" />
							Keep the picks I made
						</label>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" className={btn} onClick={() => s.fillHome(scope)}>
							Pick home teams
						</button>
						<button type="button" className={btn} onClick={() => s.fillRandom(scope)}>
							<Shuffle className="h-4 w-4" aria-hidden="true" />
							Randomize
						</button>
					</div>
					<p className="m-0 text-xs text-lab-muted">Fills in games nobody has played. Undo is one tap away. Each pick updates the standings at once.</p>
				</div>
			</details>

			{s.notice?.kind === "shared" ? (
				<div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm">
					<span>You&rsquo;re viewing a shared scenario with {s.notice.picks} {s.notice.picks === 1 ? "pick" : "picks"}. Change anything and it becomes yours.</span>
					{s.notice.canRestore ? (
						<button type="button" onClick={s.restoreMine} className="font-semibold underline underline-offset-4">
							Back to my picks
						</button>
					) : null}
				</div>
			) : null}
			{s.notice?.kind === "stale-link" ? (
				<div role="status" className="rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm">
					That scenario link was made for a different version of the schedule, so it can&rsquo;t be opened. Showing your own picks instead.
				</div>
			) : null}

			{s.raiders ? <RaidersOutlook sim={sim} picked={pickedCount} /> : null}

			<div role="tablist" aria-label="Playoff machine sections" className="grid grid-cols-3 gap-1 rounded-xl border border-lab-line bg-lab-surface p-1 lg:hidden">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						id={`tab-${t.id}`}
						aria-selected={tab === t.id}
						aria-controls={`panel-${t.id}`}
						onClick={() => setTab(t.id)}
						className={`min-h-[44px] rounded-lg text-sm font-bold transition ${tab === t.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}
					>
						{t.label}
					</button>
				))}
			</div>

			<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
				<section id="panel-games" role="tabpanel" aria-labelledby="tab-games" className={`${tab === "games" ? "block" : "hidden"} lg:col-span-5 lg:block`}>
					<h2 className="sr-only">Games</h2>
					<div ref={chips} role="group" aria-label="Week" className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
						{weeks.map((w) => {
							const p = progress.find((x) => x.week === w)!
							const done = p.open === 0
							return (
								<button
									key={w}
									type="button"
									aria-current={w === week ? "true" : undefined}
									aria-label={`Week ${w}${p.played === p.total ? ", played" : done ? ", all picked" : `, ${p.open} left to pick`}`}
									onClick={() => setWeek(w)}
									className={`relative min-h-[44px] min-w-[52px] shrink-0 snap-center rounded-lg border px-2.5 text-sm font-bold tabular-nums transition ${
										w === week ? "border-lab-ink bg-lab-ink text-lab-page" : p.played === p.total ? "border-lab-line text-lab-muted hover:text-lab-ink" : "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong"
									}`}
								>
									<span className="block text-[9px] font-semibold uppercase leading-none tracking-[0.12em] opacity-70">Wk</span>
									{w}
									{p.played < p.total && done ? <Check className="absolute right-1 top-1 h-3 w-3" aria-hidden="true" /> : null}
								</button>
							)
						})}
					</div>

					<div className="mt-3 flex items-center justify-between gap-3">
						<h3 className="m-0 font-serif text-xl font-bold">Week {week}</h3>
						<p className="m-0 text-xs text-lab-muted">
							{current ? (current.played === current.total ? "All played" : `${current.played} played · ${current.picked} picked · ${current.open} open`) : ""}
						</p>
					</div>
					{week <= throughWeek && current && current.played > 0 ? <p className="m-0 mt-1 text-xs text-lab-muted">Games that have been played are locked to their real result.</p> : null}

					<ul className="m-0 mt-3 list-none space-y-3 p-0">
						{weekGames.map((g) => (
							<li key={g.id}>
								<GameCard game={g} pick={picks[g.id]} sim={sim} onPick={s.pick} rivals={s.raiders ? rivals : undefined} focus={s.raiders ? (g.homeTeam === "LV" || g.awayTeam === "LV" ? "raiders" : rivals.has(g.homeTeam) || rivals.has(g.awayTeam) ? "rival" : null) : null} />
							</li>
						))}
					</ul>
				</section>

				<div className="lg:col-span-7">
					<div className="hidden items-center justify-between gap-3 lg:flex">{confSwitch}</div>

					<section id="panel-standings" role="tabpanel" aria-labelledby="tab-standings" className={`${tab === "standings" ? "block" : "hidden"} lg:mt-4 lg:block`}>
						<div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
							<h2 className="m-0 font-serif text-xl font-bold">Standings</h2>
							{confSwitch}
						</div>
						<h2 className="sr-only lg:not-sr-only lg:mb-3 lg:font-serif lg:text-xl lg:font-bold">{conference} standings</h2>
						<StandingsTable sim={sim} conference={conference} raiders={s.raiders} rivals={rivals} />
					</section>

					<section id="panel-bracket" role="tabpanel" aria-labelledby="tab-bracket" className={`${tab === "bracket" ? "block" : "hidden"} mt-0 lg:mt-8 lg:block`}>
						<div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
							<h2 className="m-0 font-serif text-xl font-bold">Bracket</h2>
							{confSwitch}
						</div>
						<h2 className="sr-only lg:not-sr-only lg:mb-3 lg:font-serif lg:text-xl lg:font-bold">{conference} playoff bracket</h2>
						<BracketView sim={sim} conference={conference} raiders={s.raiders} />
					</section>
				</div>
			</div>
		</div>
	)
}
