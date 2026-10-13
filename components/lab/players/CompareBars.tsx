import Yardstick from "@/components/lab/players/Yardstick"
import { type Comparison, type Metric, lastName, pctWord } from "@/lib/lab/compareKit"
import { GROUP_META, SIGNAL_HELP, formatStat, ordinal, yardOf, type PlayersData } from "@/lib/lab/playersKit"

/**
 * Stat by stat: his number on the left, hers on the right, and between them two bars growing out from the middle for each one's
 * percentile among players at the same job. The leader's number and bar are lit; a stat still mostly luck is drawn faint and never
 * called a win. Each row opens onto the league's spread for that stat.
 */
function sentence(c: Comparison, m: Metric): string {
	const pa = lastName(c.a)
	const pb = lastName(c.b)
	if (m.signal === "luck") return "Mostly luck so far"
	if (m.lead === "even") return m.strength === "toss-up" ? "Too close to call" : "No clear lead"
	const who = m.lead === "a" ? pa : pb
	return m.strength === "clear" ? `${who}: clear lead` : `${who}: slight edge`
}

function Num({ side, m, color, lit }: { side: "a" | "b"; m: Metric; color: string; lit: boolean }) {
	const s = side === "a" ? m.a : m.b
	return (
		<p className={`m-0 font-mono tabular-nums ${side === "a" ? "text-left sm:text-right" : "text-right sm:text-left"}`}>
			<span className={`block whitespace-nowrap text-sm font-bold sm:text-lg ${lit ? "" : "text-lab-soft"}`} style={lit ? { color } : undefined}>
				{s.text}
			</span>
			<span className="block text-[10px] font-normal leading-tight text-lab-muted">{s.rank !== null && s.of !== null ? `${ordinal(s.rank)} of ${s.of}` : pctWord(s.pct)}</span>
		</p>
	)
}

function Half({ pct, color, lit, mirror }: { pct: number | null; color: string; lit: boolean; mirror: boolean }) {
	const w = pct === null ? 0 : Math.max(3, Math.min(100, pct))
	return (
		<div className={`flex h-2.5 w-full overflow-hidden rounded-full bg-lab-tint sm:h-3 ${mirror ? "justify-end" : ""}`}>
			<div className={mirror ? "rr-grow-r" : "rr-grow"} style={{ width: `${w}%`, background: color, opacity: lit ? 1 : 0.45, borderRadius: 9999 }} />
		</div>
	)
}

export default function CompareBars({ data, c, colorA, colorB }: { data: PlayersData; c: Comparison; colorA: string; colorB: string }) {
	const rows = c.metrics.filter((m) => m.a.pct !== null || m.b.pct !== null)
	if (!rows.length) return null
	return (
		<div className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface" data-testid="compare-bars">
			<div className="hidden grid-cols-[7rem_1fr_7rem] gap-x-4 border-b border-lab-line px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted sm:grid" aria-hidden="true">
				<span className="truncate text-right" style={{ color: colorA }}>
					{c.a.name}
				</span>
				<span className="text-center">Percentile among {GROUP_META[c.group].peers} &middot; farther out is better</span>
				<span className="truncate" style={{ color: colorB }}>
					{c.b.name}
				</span>
			</div>
			<ul className="m-0 list-none p-0">
				{rows.map((m) => {
					const litA = m.signal !== "luck" && m.lead === "a"
					const litB = m.signal !== "luck" && m.lead === "b"
					const y = yardOf(data, c.group, m.key)
					return (
						<li key={m.key} className="border-t border-lab-line first:border-t-0" data-testid="compare-row" data-lead={m.signal === "luck" ? "luck" : m.lead}>
							<details className="group">
								<summary className="cursor-pointer list-none px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-lab-ink sm:px-5 [&::-webkit-details-marker]:hidden">
									<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
										<h3 className="m-0 text-sm font-semibold text-lab-ink">
											{m.label}
											{m.info.higher === false ? <span className="ml-1.5 font-normal text-lab-muted">(lower is better)</span> : null}
										</h3>
										<span className={`text-xs ${m.signal === "luck" ? "text-lab-muted" : litA || litB ? "font-semibold text-lab-ink" : "text-lab-muted"}`}>{sentence(c, m)}</span>
									</div>
									<div className="mt-2 grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-x-2 sm:grid-cols-[7rem_1fr_7rem] sm:gap-x-4">
										<Num side="a" m={m} color={colorA} lit={litA} />
										<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
											<Half pct={m.a.pct} color={colorA} lit={litA || (m.signal !== "luck" && m.lead === "even")} mirror />
											<span aria-hidden="true" className="h-4 w-px bg-lab-line-strong" />
											<Half pct={m.b.pct} color={colorB} lit={litB || (m.signal !== "luck" && m.lead === "even")} mirror={false} />
										</div>
										<Num side="b" m={m} color={colorB} lit={litB} />
									</div>
									<span className="mt-1 block text-center text-[11px] text-lab-muted group-open:hidden">Tap for the league spread</span>
								</summary>
								<div className="border-t border-dashed border-lab-line bg-lab-tint px-3 py-4 sm:px-5">
									{y ? (
										<Yardstick
											marks={[
												{ v: m.a.value, se: m.a.se, name: c.a.name, color: colorA },
												{ v: m.b.value, se: m.b.se, name: c.b.name, color: colorB },
											]}
											yard={y}
											higher={m.info.higher}
											fmt={(v) => formatStat(c.group, m.key, v)}
											peers={GROUP_META[c.group].peers}
										/>
									) : null}
									{m.signal !== "real" ? <p className="m-0 mt-3 max-w-2xl text-xs leading-relaxed text-lab-muted">{SIGNAL_HELP[m.signal]}</p> : null}
								</div>
							</details>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
