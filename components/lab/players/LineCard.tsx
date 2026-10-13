import { type LineRecord } from "@/lib/lab/playersKit"

/**
 * The hero card for a player with no overall grade (an offensive lineman): what he did himself, then what his whole line did while he
 * started, with the line's numbers labelled as shared. Public data has no block won or lost for one man, so there is no number to rank.
 */
export default function LineCard({ record, peers }: { record: LineRecord; peers: string }) {
	return (
		<div className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface/90 backdrop-blur" data-testid="line-card">
			<div className="p-5 pb-4">
				<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">His record</p>
				<dl className="m-0 mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${record.mine.length}, minmax(0, 1fr))` }} data-testid="line-record">
					{record.mine.map((m) => (
						<div key={m.label} className="min-w-0">
							<dd className="m-0 font-mono text-3xl font-bold leading-none tabular-nums text-lab-ink">{m.value}</dd>
							<dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted">{m.label}</dt>
							{m.note ? <p className="m-0 mt-0.5 text-[11px] leading-snug text-lab-soft">{m.note}</p> : null}
						</div>
					))}
				</dl>
			</div>
			{record.line.length ? (
				<div className="border-t border-lab-line px-5 py-4">
					<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">His line while he started</p>
					<dl className="m-0 mt-3 grid grid-cols-2 gap-3" data-testid="line-numbers">
						{record.line.map((l) => (
							<div key={l.k} className="min-w-0">
								<dd className="m-0 font-mono text-xl font-bold tabular-nums text-lab-ink">{l.value}</dd>
								<dt className="mt-0.5 text-[11px] leading-snug text-lab-soft">{l.label}</dt>
								{l.typical ? <p className="m-0 text-[11px] text-lab-muted">typical {l.typical}</p> : null}
							</div>
						))}
					</dl>
				</div>
			) : null}
			<p className="m-0 border-t border-lab-line bg-lab-tint px-5 py-3 text-xs leading-relaxed text-lab-muted" data-testid="overall-note">
				There is no overall grade for {peers}: no public data credits one lineman with a block won or lost. His line&apos;s numbers are shared by everyone who starts beside him.
			</p>
		</div>
	)
}
