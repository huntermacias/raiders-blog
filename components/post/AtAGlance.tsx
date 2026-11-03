export type Fact = { _key?: string; label?: string | null; value?: string | null }

/** The small box of key facts an editor can add to the top of a story (player, contract, status...). Nothing shows when there are none. */
export default function AtAGlance({ facts }: { facts?: Fact[] | null }) {
	const rows = (facts ?? []).filter((f) => f?.label?.trim() && f?.value?.trim())
	if (rows.length === 0) return null
	return (
		<section aria-label="At a glance" className="mb-10 overflow-hidden rounded-2xl border border-border/70 bg-card" data-testid="at-a-glance">
			<h2 className="border-b border-border/70 bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">At a glance</h2>
			<dl className="grid grid-cols-1 gap-x-8 gap-y-0 px-5 py-1 sm:grid-cols-2">
				{rows.map((f, i) => (
					<div key={f._key ?? i} className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2.5 last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0">
						<dt className="text-sm text-muted-foreground">{f.label}</dt>
						<dd className="text-right text-sm font-semibold">{f.value}</dd>
					</div>
				))}
			</dl>
		</section>
	)
}
