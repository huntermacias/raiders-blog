import type { ReactNode } from "react"
import SectionIcon, { type SectionKey } from "@/components/lab/players/SectionIcon"

/**
 * The title block every profile section opens with: an accent tile with the section's icon, its place in the page ("03 of 12"), the
 * title, and a line on what it shows. The big outlined number on the right is decoration only.
 */
export default function SectionHead({
	id,
	icon,
	title,
	blurb,
	step,
	className = "",
}: {
	id: string
	icon: SectionKey
	title: ReactNode
	blurb?: ReactNode
	step?: { n: number; of: number }
	className?: string
}) {
	return (
		<header className={`relative ${className}`} data-testid="section-head">
			{step ? (
				<span aria-hidden="true" className="pointer-events-none absolute -top-3 right-0 hidden select-none font-serif text-7xl font-black leading-none sm:block" style={{ color: "transparent", WebkitTextStroke: "1.5px var(--pc-accent)", opacity: 0.16 }}>
					{String(step.n).padStart(2, "0")}
				</span>
			) : null}
			<div className="flex items-start gap-3.5">
				<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm" style={{ background: "var(--pc-accent)", color: "var(--pc-on)" }} aria-hidden="true">
					<SectionIcon name={icon} className="h-[22px] w-[22px]" />
				</span>
				<div className="min-w-0">
					{step ? (
						<p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">
							<span className="text-lab-ink">{String(step.n).padStart(2, "0")}</span> / {String(step.of).padStart(2, "0")}
						</p>
					) : null}
					<h2 id={id} className="m-0 font-serif text-[1.7rem] font-bold leading-tight tracking-tight sm:text-3xl">
						{title}
					</h2>
				</div>
			</div>
			{blurb ? <div className="m-0 mt-2.5 max-w-3xl text-sm leading-relaxed text-lab-soft">{blurb}</div> : null}
		</header>
	)
}
