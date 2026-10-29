import Link from "@/components/SiteLink"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import type { ReportView } from "@/lib/report/build"
import type { Performer } from "@/lib/report/players"
import Panel from "./Panel"
import ReportShare from "./ReportShare"

const KIND: Record<Performer["kind"], string> = { pass: "Passing", rush: "Rushing", rec: "Receiving", def: "Defense" }

function Chips({ p }: { p: Performer }) {
	return (
		<dl className="mt-3 grid grid-cols-2 gap-1.5">
			{p.chips.map((c) => (
				<div key={c.label} className="rounded-lg bg-lab-page/70 px-2.5 py-1.5 ring-1 ring-lab-line">
					<dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted">{c.label}</dt>
					<dd className={`font-sans text-sm font-bold tabular-nums ${c.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : c.tone === "bad" ? "text-rose-600 dark:text-rose-400" : ""}`}>{c.value}</dd>
				</div>
			))}
		</dl>
	)
}

function Name({ p, className = "" }: { p: Performer; className?: string }) {
	return p.slug ? (
		<Link href={`/lab/players/${p.slug}?ref=report`} className={`underline-offset-4 hover:underline ${className}`}>
			{p.name}
		</Link>
	) : (
		<span className={className}>{p.name}</span>
	)
}

function Card({ p, color, code }: { p: Performer; color: string; code: string }) {
	return (
		<li className="rounded-2xl border border-lab-line bg-lab-tint p-4" style={{ "--pc-accent": color, "--pc-on": "#ffffff" } as React.CSSProperties}>
			<div className="flex items-center gap-3">
				<Headshot espn={p.espn} shot={p.shot} name={p.name} size={56} />
				<div className="min-w-0">
					<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
						{KIND[p.kind]} · {p.pos}
					</p>
					<p className="truncate font-serif text-lg font-bold leading-tight">
						<Name p={p} />
					</p>
					<p className="mt-0.5 flex items-center gap-1.5 text-xs text-lab-soft">
						<TeamLogo team={code} size={14} /> {p.line}
					</p>
				</div>
			</div>
			<Chips p={p} />
		</li>
	)
}

/**
 * The players who mattered, a card each, for both teams: the headshot, the line a box score would print, and four numbers it would not (points
 * added per play, success, how deep the throws were, how many tackles were missed...). The one who added the most, whichever team, is pulled out on top.
 */
export default function PlayersSection({ view, stamp }: { view: ReportView; stamp: number }) {
	const { me, opp, standout } = view.performers
	if (!me.length && !opp.length) return null
	const oppCode = view.opp.abbr ?? "NFL"
	const s = standout?.performer
	return (
		<Panel
			id="players"
			eyebrow="The players"
			title={s ? `${s.name} made the biggest difference` : "Who played, and how"}
			intro={s ? `${standout!.why} Every card links to the player's page in the Lab.` : "Every card links to the player's page in the Lab."}
			opp={view.lab?.opp ?? null}
			actions={<ReportShare slug={view.slug} kind="players" stamp={stamp} text={`${view.title}: who played best`} alt={`Week ${view.week ?? ""} player performances card`} label="Share the players" />}
			footer={<p>Lines and rates are counted from the play-by-play. EPA is expected points added; success rate is the share of plays that gained what the down needed; CPOE is completion percentage over expected.</p>}
		>
			{s && (
				<div className="mb-6 flex flex-col items-center gap-5 rounded-3xl border border-lab-line bg-lab-tint p-5 sm:flex-row sm:p-7" style={{ "--pc-accent": s.side === "me" ? "var(--lab-team)" : view.opp.color, "--pc-on": s.side === "me" ? "var(--lab-page)" : "#ffffff" } as React.CSSProperties}>
					<Headshot espn={s.espn} shot={s.shot} name={s.name} size={120} />
					<div className="min-w-0 text-center sm:text-left">
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lab-muted">Biggest impact</p>
						<p className="mt-1 font-serif text-3xl font-bold leading-tight sm:text-4xl">
							<Name p={s} />
						</p>
						<p className="mt-1 flex items-center justify-center gap-2 text-sm text-lab-soft sm:justify-start">
							<TeamLogo team={s.side === "me" ? "LV" : oppCode} size={18} /> {s.pos} &middot; {s.line}
						</p>
						<div className="mx-auto mt-3 max-w-md sm:mx-0">
							<Chips p={s} />
						</div>
					</div>
				</div>
			)}
			<div className="grid gap-6 lg:grid-cols-2">
				{[
					{ code: "LV", name: "Raiders", list: me, color: "#8b929a" },
					{ code: oppCode, name: view.opp.nick, list: opp, color: view.opp.color },
				].map((col) => (
					<div key={col.name}>
						<h3 className="mb-3 flex items-center gap-2 font-serif text-xl font-bold">
							<TeamLogo team={col.code} size={28} /> {col.name}
						</h3>
						<ul className="space-y-3">
							{col.list.map((p) => (
								<Card key={`${p.kind}-${p.id}`} p={p} color={col.color} code={col.code} />
							))}
						</ul>
					</div>
				))}
			</div>
		</Panel>
	)
}
