import Tip from "@/components/lab/Tip"
import { CAVEAT, type Choice, type Decision, type FourthGame, VERDICTS, choiceText, explain, gameLine, ptsText, spotText } from "@/lib/lab/fourthDown"
import { clockAt } from "@/lib/lab/wp"
import CardFigure from "./CardFigure"

const NAMES: Record<Choice, string> = { go: "Go for it", punt: "Punt", fg: "Field goal" }
const ORDER: Choice[] = ["go", "fg", "punt"]

// The verdict is always a word; the mark beside it only helps a glance.
const MARK: Record<string, string> = { good: "✓", even: "≈", warn: "!", bad: "✕" }

function Row({ d }: { d: Decision }) {
	const v = d.verdict ? VERDICTS[d.verdict] : null
	const when = clockAt(d.el)
	return (
		<li className="p-4 sm:p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 className="font-serif text-lg font-bold leading-snug">
					{spotText(d)}
					<span className="ml-2 text-sm font-normal text-lab-muted">
						{when.q} {d.clk}
					</span>
				</h3>
				<p className={`m-0 text-xs font-semibold uppercase tracking-[0.14em] ${v && (v.tone === "bad" || v.tone === "warn") ? "text-[color:var(--lab-bad)]" : "text-lab-soft"}`}>
					{v ? (
						<>
							<span aria-hidden="true">{MARK[v.tone]} </span>
							{v.label}
						</>
					) : (
						"Not graded"
					)}
				</p>
			</div>
			<p className="m-0 mt-1 text-sm text-lab-soft">{choiceText(d.chosen, d.result)}</p>
			<p className="m-0 mt-2 text-sm leading-relaxed text-lab-muted">{explain(d)}</p>
			{v ? (
				<dl className="m-0 mt-3 flex flex-wrap gap-2">
					{ORDER.filter((c) => d.options[c]).map((c) => {
						const o = d.options[c]!
						return (
							<div key={c} className={`rounded-lg border px-3 py-1.5 ${c === d.best ? "border-lab-line-strong bg-lab-hover" : "border-lab-line bg-lab-tint"}`}>
								<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
									{NAMES[c]}
									{c === d.chosen ? " (chosen)" : ""}
								</dt>
								<dd className="m-0 font-mono text-sm font-bold tabular-nums">
									{Math.round(o.wp * 100)}%
									<span className="ml-1.5 font-sans text-[11px] font-normal text-lab-muted">after, {o.n.toLocaleString("en-US")} similar</span>
								</dd>
							</div>
						)
					})}
				</dl>
			) : null}
		</li>
	)
}

export default function FourthDownReport({ game, scope, stamp }: { game: FourthGame; scope: string; stamp: number }) {
	const s = game.summary
	const src = `/api/og?type=lab&slug=${scope}&view=fourth&v=${stamp}`
	return (
		<div>
			<p className="m-0 mb-5 max-w-2xl text-sm leading-relaxed text-lab-muted">
				Each fourth down is compared with what happened after similar ones from 2019 to last season. <strong className="font-semibold text-lab-soft">{gameLine(game)}.</strong>
			</p>
			<dl className="m-0 mb-6 grid grid-cols-3 gap-3">
				{[
					{ label: "Fourth downs", value: String(s.decisions), note: `${s.graded} graded` },
					{ label: "Best call or toss-up", value: s.graded ? `${s.bestOrClose} of ${s.graded}` : "None", note: "graded fourth downs" },
					{ label: "Left on the table", value: s.leftOnTable > 0 ? ptsText(s.leftOnTable) : "0 pts", note: "of win probability" },
				].map((t) => (
					<div key={t.label} className="rounded-xl border border-lab-line bg-lab-tint p-3 sm:p-4">
						<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{t.label}</dt>
						<dd className="m-0 mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl">{t.value}</dd>
						<dd className="m-0 text-[11px] text-lab-muted">{t.note}</dd>
					</div>
				))}
			</dl>
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
				<ol className="m-0 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
					{game.decisions.map((d, i) => (
						<Row key={i} d={d} />
					))}
				</ol>
				<CardFigure src={src} alt={`Fourth-down report: ${gameLine(game)}.`} filename={`raiders-fourth-downs-${scope}.png`} caption="Fourth-down share card" />
			</div>
			<p className="m-0 mt-4 max-w-3xl text-xs leading-relaxed text-lab-muted">
				<Tip text="Teams usually go for it when the situation already looks good, so going for it can look a little better here than it really is." side="top" align="start">
					<span className="border-b border-dotted border-lab-line-strong">How to read this</span>
				</Tip>
				. {CAVEAT}
			</p>
		</div>
	)
}
