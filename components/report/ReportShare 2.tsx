"use client"

import ShareCard from "@/components/lab/ShareCard"

export type ShareKind = "final" | "stats" | "players" | "wp" | "drive"

/** The Share button for one part of a game report. The card is drawn for that part; the link opens the report at the same part. */
export default function ReportShare({ slug, kind, stamp, text, alt, label = "Share", className = "", week, tone = "lab" }: { slug: string; kind: ShareKind; stamp: number; text: string; alt: string; label?: string; className?: string; week?: number | null; tone?: "lab" | "dark" }) {
	const anchor: Record<ShareKind, string> = { final: "", stats: "numbers", players: "players", wp: "win-probability", drive: "drives" }
	// The win probability and drive cards are the Lab's own, drawn for the same game; the rest are this report's.
	const lab = kind === "wp" || kind === "drive"
	const query = lab ? `slug=week-${week ?? 0}${kind === "drive" ? "&view=drive" : ""}` : `slug=${slug}&kind=${kind}`
	const style =
		tone === "dark"
			? "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
			: "min-h-[44px] rounded-lg border border-lab-line-strong px-3.5 py-2 font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink"
	return (
		<ShareCard
			sizes={lab ? ["wide"] : ["wide", "tall"]}
			stamp={stamp}
			text={text}
			alt={alt}
			label={label}
			className={className || style}
			target={{ type: lab ? "lab" : "report", query, linkQuery: "", sharePath: `/games/${slug}${anchor[kind] ? `#${anchor[kind]}` : ""}`, name: alt, file: `raiders-rundown-${slug}-${kind}`, campaign: "report_share" }}
		/>
	)
}
