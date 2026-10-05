import Link from "@/components/SiteLink"
import { type Matchup, type Watch, formatValue, labelFor, matchups, ordinal, sampleNote, standouts, teamScout, watchList, type Key, KEYS } from "@/lib/lab/scouting"
import { teamByAbbr } from "@/lib/nfl"
import CardFigure from "./CardFigure"

/** Where a rank sits on a line from 32nd (left) to 1st (right). */
const at = (rank: number) => `${Math.round(((32 - rank) / 31) * 100)}%`

function Rail({ ours, theirs, oppNick }: { ours: number; theirs: number; oppNick: string }) {
	return (
		<div className="relative mt-2 h-1.5 rounded-full bg-lab-tint ring-1 ring-inset ring-lab-line" role="img" aria-label={`Raiders ${ordinal(ours)}, ${oppNick} ${ordinal(theirs)}, of 32.`}>
			<span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lab-team ring-2 ring-lab-page" style={{ left: at(ours) }} />
			<span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lab-opp ring-2 ring-lab-page" style={{ left: at(theirs) }} />
		</div>
	)
}

function WatchList({ items }: { items: Watch[] }) {
	if (!items.length) return <p className="m-0 text-sm text-lab-muted">No lopsided matchups yet. Both teams look close to average on paper.</p>
	return (
		<ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
			{items.map((w, i) => (
				<li key={i} className="rounded-xl border border-lab-line bg-lab-tint p-4">
					<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{w.kind === "edge" ? "Raiders edge" : "Watch out"}</p>
					<h3 className="m-0 mt-1 font-serif text-base font-bold leading-snug">{w.headline.replace(/^[^:]+:\s*/, "").replace(/^./, (c) => c.toUpperCase())}</h3>
					<p className="m-0 mt-1 text-sm leading-relaxed text-lab-soft">{w.detail}</p>
				</li>
			))}
		</ul>
	)
}

function Block({ title, rows, oppNick }: { title: string; rows: Matchup[]; oppNick: string }) {
	return (
		<div>
			<h3 className="m-0 mb-2 font-serif text-lg font-bold">{title}</h3>
			<ul className="m-0 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
				{rows.map((m) => (
					<li key={`${m.unit}-${m.key}`} className="p-3 sm:p-4">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
							<span className="font-semibold">{m.label}</span>
							<span className="font-mono text-xs tabular-nums text-lab-muted">
								Raiders {formatValue(m.key, m.ours.v)} ({ordinal(m.ours.rank)}) &middot; {oppNick} {formatValue(m.key, m.theirs.v)} ({ordinal(m.theirs.rank)})
							</span>
						</div>
						<Rail ours={m.ours.rank} theirs={m.theirs.rank} oppNick={oppNick} />
					</li>
				))}
			</ul>
		</div>
	)
}

function Standouts({ abbr, nick }: { abbr: string; nick: string }) {
	const off = standouts(abbr, "off")
	const def = standouts(abbr, "def")
	const line = (rows: ReturnType<typeof standouts>["strengths"], side: "off" | "def") =>
		rows.map((r) => `${labelFor(r.key as Key, side).toLowerCase()} (${ordinal(r.rank)})`).join(", ")
	return (
		<div className="rounded-xl border border-lab-line bg-lab-tint p-4 text-sm leading-relaxed">
			<h3 className="m-0 font-serif text-lg font-bold">{nick}</h3>
			<p className="m-0 mt-2">
				<span className="font-semibold">Offense is best at</span> <span className="text-lab-soft">{line(off.strengths, "off")}.</span>
			</p>
			<p className="m-0 mt-1">
				<span className="font-semibold">Offense struggles with</span> <span className="text-lab-soft">{line(off.weaknesses, "off")}.</span>
			</p>
			<p className="m-0 mt-1">
				<span className="font-semibold">Defense is best at</span> <span className="text-lab-soft">{line(def.strengths, "def")}.</span>
			</p>
			<p className="m-0 mt-1">
				<span className="font-semibold">Defense struggles with</span> <span className="text-lab-soft">{line(def.weaknesses, "def")}.</span>
			</p>
		</div>
	)
}

type Props = { abbr: string; stamp: number; week?: number | null; compact?: boolean }

export default function ScoutReport({ abbr, stamp, week = null, compact = false }: Props) {
	const opp = teamByAbbr(abbr)
	const them = teamScout(abbr)
	const lv = teamScout("LV")
	if (!them || !lv) return null
	const all = matchups(abbr, opp.nick)
	const ours = all.filter((m) => m.unit === "ours").sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key))
	const theirs = all.filter((m) => m.unit === "theirs").sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key))
	const src = `/api/og?type=scout&opp=${abbr}${week ? `&week=${week}` : ""}&v=${stamp}`
	const g = Math.min(them.g, lv.g)

	return (
		<div>
			<p className="m-0 mb-4 max-w-2xl text-sm leading-relaxed text-lab-muted">
				{sampleNote(g)} Ranks are out of 32 teams and 1st is always best, so a defense ranked 1st is the hardest to score on.
			</p>
			<div className={compact ? "" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start"}>
				<WatchList items={watchList(abbr, opp.nick)} />
				{compact ? null : <CardFigure src={src} alt={`Scouting report: Raiders vs ${opp.nick}.`} filename={`raiders-vs-${abbr.toLowerCase()}-scouting.png`} caption="Scouting share card" />}
			</div>
			{compact ? (
				<p className="mt-4 text-sm">
					<Link href={`/lab/scouting/${abbr.toLowerCase()}`} className="font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						Full {opp.nick} report &rarr;
					</Link>
				</p>
			) : (
				<>
					<div className="mt-10 grid gap-8 lg:grid-cols-2">
						<Block title={`Raiders offense vs ${opp.nick} defense`} rows={ours} oppNick={opp.nick} />
						<Block title={`${opp.nick} offense vs Raiders defense`} rows={theirs} oppNick={opp.nick} />
					</div>
					<p className="m-0 mt-3 text-xs text-lab-muted">
						Each line runs from 32nd (left) to 1st (right). The dark dot is the Raiders; the colored dot is the {opp.nick}.
					</p>
					<div className="mt-10 grid gap-4 sm:grid-cols-2">
						<Standouts abbr="LV" nick="Raiders" />
						<Standouts abbr={abbr} nick={opp.nick} />
					</div>
				</>
			)}
		</div>
	)
}
