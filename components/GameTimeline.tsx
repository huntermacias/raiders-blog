function GameTimeline({ moments }: { moments?: KeyMoment[] }) {
	if (!moments?.length) return null

	return (
		<div>
			<p className="mb-4 font-serif text-xl font-bold">Key Moments</p>
			<ol className="relative space-y-6 border-l border-border pl-6">
				{moments.map((m) => (
					<li key={m._key} className="relative">
						<span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
						<div className="flex flex-wrap items-baseline gap-2">
							<span className="text-xs font-bold uppercase tracking-wide text-primary">{m.quarter}</span>
							{m.time && <span className="text-xs text-muted-foreground">{m.time}</span>}
						</div>
						<p className="mt-0.5 text-sm text-foreground">{m.description}</p>
					</li>
				))}
			</ol>
		</div>
	)
}

export default GameTimeline
