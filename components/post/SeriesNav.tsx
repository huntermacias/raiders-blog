import Link from "@/components/SiteLink"
import { ArrowLeft, ArrowRight } from "lucide-react"

export type SeriesLink = { title: string; slug: string; week?: number | null } | null

/** "Previous preview / Next preview": the story before and after this one of the same kind, so a series reads straight through. */
export default function SeriesNav({ kind, prev, next }: { kind: string; prev: SeriesLink; next: SeriesLink }) {
	if (!prev && !next) return null
	const cell = (link: NonNullable<SeriesLink>, dir: "prev" | "next") => (
		<Link
			href={`/post/${link.slug}`}
			className={`group flex min-w-0 flex-col gap-1 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-foreground/40 ${dir === "next" ? "text-right sm:items-end" : ""}`}
		>
			<span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground ${dir === "next" ? "sm:flex-row-reverse" : ""}`}>
				{dir === "prev" ? <ArrowLeft aria-hidden className="h-3.5 w-3.5" /> : <ArrowRight aria-hidden className="h-3.5 w-3.5" />}
				{dir === "prev" ? "Previous" : "Next"} {kind}
				{link.week ? ` · Week ${link.week}` : ""}
			</span>
			<span className="line-clamp-2 font-serif text-base font-bold leading-snug group-hover:underline">{link.title}</span>
		</Link>
	)
	return (
		<nav aria-label={`More ${kind}s`} className="grid gap-3 sm:grid-cols-2" data-testid="series-nav">
			{prev ? cell(prev, "prev") : <span className="hidden sm:block" />}
			{next ? cell(next, "next") : <span className="hidden sm:block" />}
		</nav>
	)
}
