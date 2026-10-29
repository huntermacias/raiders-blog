import Tip from "@/components/lab/Tip"
import { TeamLogo } from "@/components/lab/players/Media"
import { ordinal } from "@/lib/lab/scouting"
import type { ReportView } from "@/lib/report/build"
import type { Cell, Finding, HeadRow, Place } from "@/lib/report/stats"
import Panel from "./Panel"
import ReportShare from "./ReportShare"

export function placeText(p: Place | null): string | null {
	if (!p) return null
	if (p.place === 1) return `best of ${p.of}`
	if (p.place === p.of) return `worst of ${p.of}`
	return `${ordinal(p.place)}-best of ${p.of}`
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function Dot({ code, left, mine, dim }: { code: string; left: number; mine: boolean; dim: boolean }) {
	return (
		<span
			className={`absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-lab-page shadow-sm sm:h-9 sm:w-9 ${dim ? "opacity-70" : ""}`}
			style={{ left: `${left}%`, borderColor: mine ? "var(--lab-team)" : "var(--lab-opp)" }}
		>
			<TeamLogo team={code} size={22} />
		</span>
	)
}

/** A measure that can be below zero: a dot for each team on one line, zero marked, better to the right. */
function Signed({ row, mineCode, oppCode }: { row: HeadRow; mineCode: string; oppCode: string }) {
	const pos = (v: number) => clamp(((v - row.min) / (row.max - row.min)) * 100, 6, 94)
	const zero = pos(0)
	const a = row.me.value == null ? null : pos(row.me.value)
	const b = row.opp.value == null ? null : pos(row.opp.value)
	return (
		<div className="relative h-11" role="img" aria-label={`${row.label}: Raiders ${row.me.text}, opponent ${row.opp.text}`}>
			<div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-lab-line-strong" />
			<div className="absolute bottom-1 top-1 w-px bg-lab-ink/40" style={{ left: `${zero}%` }} />
			{a != null && b != null && (
				<div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-lab-line-strong" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} />
			)}
			{b != null && <Dot code={oppCode} left={b} mine={false} dim={row.edge === "me"} />}
			{a != null && <Dot code={mineCode} left={a} mine dim={row.edge === "opp"} />}
		</div>
	)
}

/** A measure that only counts up: a bar for each team from the same starting line. */
function Bars({ row, mineCode, oppCode }: { row: HeadRow; mineCode: string; oppCode: string }) {
	const width = (v: number | null) => (v == null ? 0 : clamp((v / row.max) * 100, v > 0 ? 3 : 0, 100))
	const line = (cell: Cell, code: string, mine: boolean, win: boolean) => (
		<div className="flex items-center gap-2">
			<TeamLogo team={code} size={20} />
			<div className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-lab-line/60">
				<div className="h-full rounded-full transition-[width]" style={{ width: `${width(cell.value)}%`, background: mine ? "var(--lab-team)" : "var(--lab-opp)", opacity: win || row.edge === null ? 1 : 0.55 }} />
			</div>
			<span className="w-16 shrink-0 text-right font-sans text-sm font-bold tabular-nums sm:w-20">{cell.text}</span>
		</div>
	)
	return (
		<div className="space-y-1.5" role="img" aria-label={`${row.label}: Raiders ${row.me.text}, opponent ${row.opp.text}`}>
			{line(row.me, mineCode, true, row.edge === "me")}
			{line(row.opp, oppCode, false, row.edge === "opp")}
		</div>
	)
}

function context(cell: Cell, who: string, versus: "season" | "faced"): string | null {
	const parts: string[] = []
	const p = placeText(cell.place)
	if (p) parts.push(versus === "season" ? `${p} ${who} games` : `${p} games against the Raiders`)
	if (cell.league) parts.push(`offense ${ordinal(cell.league.rank)} in the NFL this season`)
	return parts.length ? `${who}: ${parts.join(" · ")}` : null
}

function Row({ row, mineCode, oppCode, oppNick }: { row: HeadRow; mineCode: string; oppCode: string; oppNick: string }) {
	const winnerNote = row.edge === "me" ? "Raiders" : row.edge === "opp" ? oppNick : null
	const mineCtx = context(row.me, "Raiders", "season")
	const oppCtx = context(row.opp, oppNick, "faced")
	return (
		<li className="grid gap-x-8 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(160px,230px)_1fr] sm:items-center sm:px-5">
			<div>
				<p className="text-sm font-semibold">
					<Tip text={row.help} align="start" side="bottom">
						<span className="border-b border-dotted border-lab-line-strong">{row.label}</span>
					</Tip>
				</p>
				<p className="mt-0.5 text-[11px] text-lab-muted">{row.higherBetter === null ? "Shows how the game went" : row.higherBetter ? "Higher is better" : "Lower is better"}</p>
				{winnerNote && <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-soft">Edge: {winnerNote}</p>}
			</div>
			<div>
				{row.kind === "signed" ? <Signed row={row} mineCode={mineCode} oppCode={oppCode} /> : <Bars row={row} mineCode={mineCode} oppCode={oppCode} />}
				{(mineCtx || oppCtx) && (
					<div className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-lab-muted">
						{mineCtx && <p>{mineCtx}</p>}
						{oppCtx && <p>{oppCtx}</p>}
					</div>
				)}
			</div>
		</li>
	)
}

function FindingCard({ f }: { f: Finding }) {
	return (
		<li className={`rounded-2xl border p-4 ${f.tone === "bad" ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
			<p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${f.tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{f.tone === "bad" ? "Hurt the Raiders" : "Helped the Raiders"}</p>
			<p className="mt-1.5 font-serif text-lg font-bold leading-snug">{f.headline}</p>
			<p className="mt-1.5 text-sm leading-snug text-lab-soft">{f.detail}</p>
		</li>
	)
}

/**
 * The numbers behind the game: the few things that were most out of line with the season, then every measure that decides games for both
 * teams side by side, each set against the Raiders' other games and the league. Rates come from the play-by-play, so every row means the same thing in
 * every report.
 */
export default function NumbersSection({ view, stamp }: { view: ReportView; stamp: number }) {
	if (!view.head.length) return null
	const lab = view.lab!
	const mineCode = "LV"
	const oppCode = view.opp.abbr ?? "NFL"
	return (
		<Panel
			id="numbers"
			eyebrow="The numbers"
			title={view.findings.length ? "What the box score does not say" : "How the two offenses compared"}
			intro={`Each measure for the Raiders and the ${view.opp.nick}, set against the Raiders' other games and the rest of the league.`}
			opp={lab.opp}
			actions={<ReportShare slug={view.slug} kind="stats" stamp={stamp} text={`${view.title}: the numbers behind the game`} alt={`Week ${lab.week} team numbers card`} label="Share these numbers" />}
			footer={
				<p>
					Play-by-play from{" "}
					<a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">
						nflverse
					</a>
					. Yardage counts plays from scrimmage, so it can sit a few yards off the official box score below. Ranks come from the Lab&apos;s scouting numbers (rank 1 is best).
				</p>
			}
		>
			{view.findings.length > 0 && (
				<ul className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="What stands out">
					{view.findings.map((f) => (
						<FindingCard key={`${f.side}-${f.key}`} f={f} />
					))}
				</ul>
			)}
			<div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
				<span className="inline-flex items-center gap-2">
					<TeamLogo team={mineCode} size={22} /> Raiders
				</span>
				<span className="inline-flex items-center gap-2">
					<TeamLogo team={oppCode} size={22} /> {view.opp.nick}
				</span>
			</div>
			<ul className="divide-y divide-lab-line rounded-2xl border border-lab-line bg-lab-tint">
				{view.head.map((row) => (
					<Row key={row.key} row={row} mineCode={mineCode} oppCode={oppCode} oppNick={view.opp.nick} />
				))}
			</ul>
		</Panel>
	)
}
