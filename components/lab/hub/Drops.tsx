import Link from "@/components/SiteLink"
import { Headshot } from "@/components/lab/players/Media"
import { DOWN, UP } from "@/components/lab/players/Bits"
import DropShare from "@/components/lab/hub/DropShare"
import { cardStyle } from "@/lib/lab/playerView"
import type { Drop } from "@/lib/lab/hubKit"

const toneMark = (t: Drop["tone"]) => (t === "up" ? { mark: "▲", cls: UP, word: "Up" } : t === "down" ? { mark: "▼", cls: DOWN, word: "Down" } : null)

/** One finding: where it comes from, the sentence, its number, the line that backs it, a way in and a way to share it. */
export function DropCard({ drop, stamp, featured = false }: { drop: Drop; stamp: number; featured?: boolean }) {
	const tone = toneMark(drop.tone)
	return (
		<article className={`flex h-full flex-col rounded-2xl border bg-lab-surface p-5 ${featured ? "border-lab-line-strong sm:p-6" : "border-lab-line"}`} data-testid={`drop-${drop.id}`} style={drop.face ? cardStyle(drop.face.team) : undefined}>
			<header className="flex items-center justify-between gap-3">
				<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">{drop.kicker}</p>
				{tone ? (
					<span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] ${tone.cls}`}>
						<span aria-hidden="true">{tone.mark}</span>
						{tone.word}
					</span>
				) : null}
			</header>
			<div className="mt-3 flex items-start gap-4">
				{drop.face ? <Headshot espn={drop.face.espn} shot={drop.face.shot} name={drop.face.name} size={featured ? 72 : 60} /> : null}
				<div className="min-w-0 flex-1">
					<h3 className={`m-0 font-serif font-bold leading-snug tracking-tight ${featured ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>{drop.headline}</h3>
				</div>
			</div>
			{drop.stat ? (
				<p className="m-0 mt-4 flex items-baseline gap-3">
					<span className={`font-bold leading-none text-lab-ink ${/^[+\u2212-]?[\d.,%]+$/.test(drop.stat.value) ? `font-mono tabular-nums ${featured ? "text-5xl" : "text-3xl"}` : "font-serif text-2xl"}`}>{drop.stat.value}</span>
					<span className="text-xs text-lab-muted">{drop.stat.label}</span>
				</p>
			) : null}
			<p className="m-0 mt-3 text-sm leading-relaxed text-lab-soft">{drop.detail}</p>
			<footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
				<Link href={drop.href} className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
					{drop.cta} &rarr;
				</Link>
				<DropShare drop={drop} stamp={stamp} />
			</footer>
		</article>
	)
}

/** The week's findings in a grid; the first (the playoff race) is wider. */
export default function Drops({ drops, stamp }: { drops: Drop[]; stamp: number }) {
	return (
		<ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3" data-testid="drops">
			{drops.map((d, i) => (
				<li key={d.id} className={i === 0 && d.kind === "odds" ? "md:col-span-2" : ""}>
					<DropCard drop={d} stamp={stamp} featured={i === 0 && d.kind === "odds"} />
				</li>
			))}
		</ul>
	)
}
