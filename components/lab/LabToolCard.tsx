import Link from "@/components/SiteLink"
import type { LabTool } from "@/lib/lab/tools"

/** The little tags on a card: "New" is filled, the week it is showing is outlined. */
export function Badges({ badges }: { badges: string[] }) {
	if (!badges.length) return null
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
			{badges.map((b) => (
				<span
					key={b}
					className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${b === "New" ? "bg-lab-ink text-lab-page" : "border border-lab-line-strong text-lab-soft"}`}
				>
					{b}
				</span>
			))}
		</span>
	)
}

/** A tool on the hub. `featured` makes it the big version for "Start here". */
export default function LabToolCard({ tool, badges, featured = false }: { tool: LabTool; badges: string[]; featured?: boolean }) {
	return (
		<Link
			href={tool.href}
			className={`group block h-full rounded-2xl border bg-lab-surface transition hover:border-lab-line-strong hover:bg-lab-tint ${featured ? "border-lab-line-strong p-6 sm:p-7" : "border-lab-line p-5"}`}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className={`m-0 font-serif font-bold ${featured ? "text-2xl sm:text-3xl" : "text-xl"}`}>{tool.title}</h3>
				<Badges badges={badges} />
			</div>
			<p className={`m-0 mt-2 leading-relaxed text-lab-soft ${featured ? "max-w-xl text-base" : "text-sm"}`}>{tool.text}</p>
			<p className="m-0 mt-3 text-sm font-semibold text-lab-soft transition group-hover:text-lab-ink">Open &rarr;</p>
		</Link>
	)
}
