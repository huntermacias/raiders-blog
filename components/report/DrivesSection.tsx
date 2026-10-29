import Link from "@/components/SiteLink"
import { TeamLogo } from "@/components/lab/players/Media"
import { gameSlug } from "@/lib/lab/data"
import { resultLabel, resultTone } from "@/lib/lab/drive"
import type { ReportView } from "@/lib/report/build"
import type { DriveBar, DriveSummary } from "@/lib/report/story"
import Panel from "./Panel"
import ReportShare from "./ReportShare"

const chip = (r: string) => {
	const tone = resultTone(r)
	return tone === "score" ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300" : tone === "neutral" ? "bg-lab-line text-lab-muted ring-lab-line-strong" : "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300"
}

function Totals({ code, name, t }: { code: string; name: string; t: DriveSummary }) {
	return (
		<div className="rounded-2xl border border-lab-line bg-lab-tint p-4">
			<p className="flex items-center gap-2 text-sm font-semibold">
				<TeamLogo team={code} size={26} /> {name}
			</p>
			<dl className="mt-3 grid grid-cols-4 gap-2 text-center">
				{[
					["Drives", t.drives],
					["Scored", t.scoringDrives],
					["Plays", t.plays],
					["Yards", t.yards],
				].map(([k, v]) => (
					<div key={k as string}>
						<dd className="font-sans text-xl font-bold tabular-nums sm:text-2xl">{v}</dd>
						<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{k}</dt>
					</div>
				))}
			</dl>
		</div>
	)
}

function Row({ d, oppCode }: { d: DriveBar; oppCode: string }) {
	const code = d.mine ? "LV" : oppCode
	const left = Math.min(100, Math.max(0, d.start))
	const width = Math.max(1.5, Math.min(100 - left, (d.yards / 100) * 100))
	const label = resultLabel(d.result)
	return (
		<li className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[84px_28px_1fr_236px] sm:px-4">
			<span className="font-mono text-xs tabular-nums text-lab-muted">
				<span className="text-lab-ink">Q{d.q}</span> {d.clock}
			</span>
			<span className="hidden sm:block"><TeamLogo team={code} size={22} /></span>
			<div className="relative col-span-3 order-last h-5 sm:order-none sm:col-span-1" role="img" aria-label={`${d.mine ? "Raiders" : oppCode} drive, ${d.plays} plays, ${d.yards} yards, ${label}`}>
				<div className="absolute inset-0 rounded-full bg-lab-line/50" />
				<div className="absolute bottom-0 top-0 w-px bg-lab-line-strong" style={{ left: "50%" }} aria-hidden />
				<div className={`absolute bottom-0.5 top-0.5 rounded-full ${d.scored ? "ring-2 ring-emerald-500 ring-offset-1 ring-offset-[var(--lab-page)]" : ""}`} style={{ left: `${left}%`, width: `${width}%`, background: d.mine ? "var(--lab-team)" : "var(--lab-opp)" }} />
			</div>
			<div className="flex items-center justify-end gap-2 text-right">
				<span className="hidden whitespace-nowrap text-[11px] tabular-nums text-lab-muted sm:inline">{d.plays} pl · {d.yards} yd{d.top ? ` · ${d.top}` : ""}</span>
				<span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${chip(d.result)}`}>{label}</span>
			</div>
		</li>
	)
}

/**
 * Every drive of the game on a 100-yard strip: where it started, how far it got, and how it ended. Raiders in silver, the opponent in its own color,
 * scoring drives ringed in green. The same drives the Lab can replay one snap at a time.
 */
export default function DrivesSection({ view, stamp }: { view: ReportView; stamp: number }) {
	const lab = view.lab
	if (!lab || !view.drives.length || !view.driveTotals) return null
	const oppCode = view.opp.abbr ?? "NFL"
	const slug = gameSlug(lab)
	const pointsMe = view.driveTotals.me.points
	const pointsOpp = view.driveTotals.opp.points
	return (
		<Panel
			id="drives"
			eyebrow="Drive by drive"
			title={`${view.driveTotals.opp.scoringDrives} of ${view.driveTotals.opp.drives} ${view.opp.nick} drives scored; the Raiders scored on ${view.driveTotals.me.scoringDrives} of ${view.driveTotals.me.drives}`}
			intro={`Each bar runs from where the drive started to how far it got, on a field that is 100 yards from the team's own goal line to the other. Offensive points on drives: Raiders ${pointsMe}, ${view.opp.nick} ${pointsOpp}.`}
			opp={lab.opp}
			actions={<ReportShare slug={view.slug} kind="drive" week={lab.week} stamp={stamp} text={`The Raiders' key drive in ${view.title}`} alt={`Week ${lab.week} key drive card`} label="Share the key drive" />}
			footer={
				<Link href={`/lab/${slug}#drive-heading`} className="font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
					Replay any drive one snap at a time &rarr;
				</Link>
			}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<Totals code="LV" name="Raiders" t={view.driveTotals.me} />
				<Totals code={oppCode} name={view.opp.nick} t={view.driveTotals.opp} />
			</div>
			<div className="mt-4 hidden items-center justify-between px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted sm:flex">
				<span className="w-[112px]" />
				<span className="flex-1 px-1">Own goal</span>
				<span className="flex-1 px-1 text-center">50</span>
				<span className="flex-1 px-1 text-right">Their goal</span>
				<span className="w-[236px]" />
			</div>
			<ol className="mt-1 divide-y divide-lab-line rounded-2xl border border-lab-line bg-lab-tint">
				{view.drives.map((d) => (
					<Row key={d.n} d={d} oppCode={oppCode} />
				))}
			</ol>
		</Panel>
	)
}
