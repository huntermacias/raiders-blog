import { labColorVars } from "@/lib/lab/colors"

/**
 * The frame each data part of a report sits in: the Lab's own panel (so the charts keep the colors they were designed for in either theme),
 * with the opponent's color wired in, an eyebrow, a headline, a line of explanation and a place for buttons.
 */
export default function Panel({ id, eyebrow, title, intro, actions, opp, children, footer }: { id: string; eyebrow: string; title: string; intro?: string; actions?: React.ReactNode; opp: string | null; children: React.ReactNode; footer?: React.ReactNode }) {
	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			className="lab lab-opp scroll-mt-32 overflow-hidden rounded-3xl border border-lab-line bg-lab-page text-lab-ink shadow-[var(--lab-shadow)]"
			style={opp ? labColorVars(opp) : undefined}
		>
			<div className="p-5 sm:p-8">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-lab-muted">{eyebrow}</p>
					{actions && <div className="flex flex-wrap items-center gap-2 text-sm">{actions}</div>}
				</div>
				<h2 id={`${id}-title`} className="mt-3 max-w-3xl text-balance font-serif text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
					{title}
				</h2>
				{intro && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-lab-soft sm:text-base">{intro}</p>}
				<div className="mt-6">{children}</div>
			</div>
			{footer && <div className="border-t border-lab-line px-5 py-4 text-xs text-lab-muted sm:px-8">{footer}</div>}
		</section>
	)
}
