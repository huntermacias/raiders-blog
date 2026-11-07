import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints } from "@/lib/lab/wp"
import { scoreAtHalf } from "@/lib/report/story"
import type { ReportView } from "@/lib/report/build"

type Tile = { href: string; label: string; value: string; note: string; tone?: "good" | "bad" }

/** Four tiles that say what kind of game it was before a word of the recap: how it started, where the win probability went, the play that decided it, and the number that stands out. */
export function glanceTiles(view: ReportView): Tile[] {
	const lab = view.lab
	if (!lab) return []
	const s = gameStory(lab.wp, lab.keyPlays, lab.scores)
	const [me, opp] = scoreAtHalf(lab)
	const swing = s.swing
	const swingPts = swing ? swingPoints(swing) : null
	const high = clockAt(s.high.el)
	const low = clockAt(s.low.el)
	const tiles: Tile[] = [
		{
			href: "#drives",
			label: "At the half",
			value: `${me}–${opp}`,
			note: me === opp ? "Tied" : me > opp ? "Raiders ahead" : `${view.opp.nick} ahead`,
			tone: me >= opp ? "good" : "bad",
		},
		{
			href: "#win-probability",
			label: "Win probability",
			value: view.result === "W" ? `Low ${pct(s.low.p)}` : `Peak ${pct(s.high.p)}`,
			note: view.result === "W" ? `${low.q} ${low.clock}, then won` : `${high.q} ${high.clock}, then it fell`,
		},
		{
			href: "#win-probability",
			label: "Biggest swing",
			value: formatSwing(swingPts) || "—",
			note: swing ? `${kindLabel(swing.kind)}, ${clockAt(swing.el).q} ${swing.clock}` : "",
			tone: swingPts == null ? undefined : swingPts >= 0 ? "good" : "bad",
		},
	]
	const top = view.findings[0]
	tiles.push(
		top
			? { href: "#numbers", label: "What stands out", value: top.headline, note: top.detail, tone: top.tone }
			: { href: "#drives", label: "Lead changes", value: String(s.leadChanges), note: "on scoring plays" },
	)
	return tiles
}

export default function Glance({ view }: { view: ReportView }) {
	const tiles = glanceTiles(view)
	if (!tiles.length) return null
	return (
		<section aria-label="The game at a glance" className="container max-w-6xl py-6">
			<dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{tiles.map((t, i) => (
					<a
						key={t.label}
						href={t.href}
						className={`group rounded-2xl border border-border/70 bg-card p-4 transition hover:border-foreground/40 hover:shadow-sm ${i === 3 ? "col-span-2 lg:col-span-1" : ""}`}
					>
						<dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.label}</dt>
						<dd
							className={`mt-1 font-sans ${t.value.length > 12 ? "font-serif text-base font-bold leading-snug sm:text-lg" : "text-2xl font-bold tabular-nums sm:text-3xl"} ${t.tone === "bad" ? "text-rose-600 dark:text-rose-400" : t.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
						>
							{t.value}
						</dd>
						<dd className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.note}</dd>
					</a>
				))}
			</dl>
		</section>
	)
}
