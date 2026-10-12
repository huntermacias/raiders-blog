import { DOWN, EarlyChip, UP } from "@/components/lab/players/Bits"
import {
	type ContractsData,
	type Deal,
	type PayRank,
	type Value,
	VERDICT_WORD,
	coverageWords,
	money,
	payPool,
	payRankPhrase,
	sharePct,
	dealSentence,
	valueSentence,
} from "@/lib/lab/contractsKit"
import { type PlayerRow, type PlayersData, GROUP_META } from "@/lib/lab/playersKit"

const MARK: Record<NonNullable<Value["verdict"]>, { mark: string; cls: string }> = {
	underpaid: { mark: "▲", cls: UP },
	fair: { mark: "●", cls: "text-lab-soft" },
	overpaid: { mark: "▼", cls: DOWN },
}

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
	return (
		<div className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3" data-testid="money-tile">
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{label}</p>
			<p className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums text-lab-ink">{value}</p>
			{sub ? <p className="m-0 mt-0.5 text-xs text-lab-muted">{sub}</p> : null}
		</div>
	)
}

/** Every tracked player at his job on one line by yearly pay, with him marked. The same facts are in the text beside it. */
function PayStrip({ data, contracts, row, deal }: { data: PlayersData; contracts: ContractsData; row: PlayerRow; deal: Deal }) {
	const pool = payPool(data, contracts, row.group)
	const max = Math.max(...pool.map((e) => e.deal.pay), deal.pay)
	const x = (v: number) => 12 + (v / max) * 576
	const peers = GROUP_META[row.group].peers
	return (
		<figure className="m-0">
			<svg viewBox="0 0 600 76" className="h-auto w-full" role="img" aria-label={`Yearly pay of the ${pool.length} ${peers} we track, from ${money(Math.min(...pool.map((e) => e.deal.pay)))} to ${money(max)}. ${row.name} is at ${money(deal.pay)}.`}>
				<line x1="12" x2="588" y1="36" y2="36" className="stroke-lab-line-strong" strokeWidth="2" strokeLinecap="round" />
				{pool
					.filter((e) => e.p.slug !== row.slug)
					.map((e) => (
						<circle key={e.p.slug} cx={x(e.deal.pay)} cy="36" r="5" className="fill-lab-muted" fillOpacity="0.55">
							<title>{`${e.p.name} (${e.deal.team}): ${money(e.deal.pay)} a year`}</title>
						</circle>
					))}
				<circle cx={x(deal.pay)} cy="36" r="9" style={{ fill: "var(--pc-accent)" }} className="stroke-lab-page" strokeWidth="2">
					<title>{`${row.name}: ${money(deal.pay)} a year`}</title>
				</circle>
				<text x={x(deal.pay)} y="70" textAnchor={x(deal.pay) > 420 ? "end" : x(deal.pay) < 180 ? "start" : "middle"} className="fill-lab-ink text-[16px] font-semibold">
					{row.name.split(" ").slice(-1)[0]} {money(deal.pay)}
				</text>
				<text x="12" y="14" className="fill-lab-muted text-[15px]">$0</text>
				<text x="588" y="14" textAnchor="end" className="fill-lab-muted text-[15px]">{money(max)}</text>
			</svg>
			<figcaption className="mt-1 text-xs text-lab-muted">Each dot is one of the {GROUP_META[row.group].peers} on the teams we track, placed by what he is paid a year.</figcaption>
		</figure>
	)
}

function CapByYear({ deal, season }: { deal: Deal; season: number }) {
	const t = deal.row.terms?.capByYear
	if (!t) return null
	const years = Object.keys(t).map(Number).sort((a, b) => a - b)
	if (years.length < 2) return null
	const max = Math.max(...years.map((y) => t[String(y)]))
	return (
		<div data-testid="cap-by-year">
			<h3 className="m-0 text-sm font-semibold text-lab-ink">Cap hit, year by year</h3>
			<ul className="m-0 mt-3 flex list-none items-end gap-3 p-0" aria-label="Cap hit by year">
				{years.map((y) => {
					const v = t[String(y)]
					const now = y === season
					return (
						<li key={y} className="flex min-w-0 flex-1 flex-col items-center gap-1">
							<span className="font-mono text-xs font-bold tabular-nums text-lab-ink">{money(v)}</span>
							<span className={`block w-full max-w-[3.5rem] rounded-t-md ${now ? "" : "bg-lab-line-strong"}`} style={{ height: `${Math.max(6, (v / max) * 88)}px`, ...(now ? { background: "var(--pc-accent)" } : {}) }} aria-hidden="true" />
							<span className={`text-[11px] ${now ? "font-semibold text-lab-ink" : "text-lab-muted"}`}>
								{y}
								{now ? " (now)" : ""}
							</span>
						</li>
					)
				})}
			</ul>
			{deal.row.terms?.note ? <p className="m-0 mt-2 text-xs text-lab-muted">{deal.row.terms.note}</p> : null}
		</div>
	)
}

function Rail({ label, rank, of, good }: { label: string; rank: number; of: number; good: boolean }) {
	const pos = of > 1 ? ((of - rank) / (of - 1)) * 100 : 50
	return (
		<div>
			<div className="flex items-baseline justify-between text-xs">
				<span className="font-semibold text-lab-ink">{label}</span>
				<span className="font-mono text-lab-soft">
					{rank} of {of}
				</span>
			</div>
			<div className="relative mt-1.5 h-2 rounded-full bg-lab-line" aria-hidden="true">
				<span className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-lab-page" style={{ left: `${pos}%`, background: good ? "var(--pc-accent)" : "var(--lab-ink)" }} />
			</div>
		</div>
	)
}

/** "Contract & cap": the deal, where it ranks at his job, and how his pay compares with how he has played. */
export default function ContractSection({
	data,
	contracts,
	row,
	deal,
	rank,
	value,
	id,
	headingId,
	className,
}: {
	data: PlayersData
	contracts: ContractsData
	row: PlayerRow
	deal: Deal
	rank: PayRank | null
	value: Value | null
	id: string
	headingId: string
	className: string
}) {
	const t = deal.row.terms
	return (
		<section className={className} aria-labelledby={headingId} id={id}>
			<div className="container py-8 sm:py-10">
				<h2 id={headingId} className="m-0 flex items-center gap-3 font-serif text-2xl font-bold">
					<span aria-hidden="true" className="h-6 w-1.5 shrink-0 rounded-sm" style={{ background: "var(--pc-accent)" }} />
					Contract &amp; cap
				</h2>
				<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft" data-testid="deal-sentence">
					{dealSentence(row.name, deal)}
				</p>

				<div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
					<Tile label="Per year" value={deal.apy !== null ? money(deal.apy) : "–"} sub={deal.apy !== null ? "average over the deal" : "no average given"} />
					<Tile label="Cap hit, 2026" value={money(deal.cap)} sub={`${sharePct(deal.capPct)} of the ${money(contracts.salaryCap)} cap`} />
					<Tile label="Guaranteed" value={deal.guaranteed !== null ? money(deal.guaranteed) : "–"} sub={deal.guaranteedPct !== null ? `${Math.round(deal.guaranteedPct * 100)}% of the total` : "not tracked"} />
					<Tile label="Runs through" value={deal.through ? String(deal.through) : "–"} sub={t?.years ? `${t.years}-year deal${t.signed ? `, signed ${t.signed.slice(0, 4)}` : ""}` : "term not tracked"} />
				</div>

				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<div>
						<h3 className="m-0 text-sm font-semibold text-lab-ink">{rank ? payRankPhrase(row.group, rank) : "Pay at his job"}</h3>
						{rank ? (
							<div className="mt-2">
								<PayStrip data={data} contracts={contracts} row={row} deal={deal} />
							</div>
						) : (
							<p className="m-0 mt-2 text-sm text-lab-soft">We track too few {GROUP_META[row.group].peers} so far to rank his pay.</p>
						)}
						{rank?.byCap ? <p className="m-0 mt-1 text-xs text-lab-muted">The source gives no yearly average for him, so this uses his cap hit.</p> : null}
					</div>
					<CapByYear deal={deal} season={contracts.season} />
				</div>

				{value ? (
					<div className="mt-8 rounded-2xl border border-lab-line bg-lab-surface p-5" data-testid="value-read">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
							<h3 className="m-0 font-serif text-xl font-bold">Pay against play</h3>
							{value.verdict ? (
								<span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${MARK[value.verdict].cls}`}>
									<span aria-hidden="true" className="text-[9px]">{MARK[value.verdict].mark}</span>
									{VERDICT_WORD[value.verdict]}
								</span>
							) : (
								<EarlyChip label={value.early ? "Early read" : "Too few to call"} />
							)}
						</div>
						<p className="m-0 mt-2 max-w-3xl text-sm leading-relaxed text-lab-soft">{valueSentence(row.name, row.group, value)}</p>
						<div className="mt-4 grid gap-4 sm:grid-cols-2">
							<Rail label="On the field (overall grade)" rank={value.gradeRank} of={value.of} good />
							<Rail label="In pay" rank={value.payRank} of={value.of} good={false} />
						</div>
						<p className="m-0 mt-3 text-xs text-lab-muted">Ranks are among the {value.of} {GROUP_META[row.group].peers} on the teams we track who have both a grade and a contract. A rank near the right of a bar is better play or higher pay.</p>
					</div>
				) : null}

				<p className="m-0 mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted" data-testid="money-source">
					Contract figures as of {contracts.asOf}, read from public cap sites ({contracts.sources.map((s) => s.name).join(" and ")}) into a file we keep by hand, for {coverageWords(contracts)}. A deal signed, cut or reworked since may differ, and cap hits are rounded to $0.1M.
					{t?.url ? (
						<>
							{" "}
							<a href={t.url} className="underline hover:text-lab-ink" rel="noopener noreferrer" target="_blank">
								Full terms on OverTheCap
							</a>
							.
						</>
					) : null}
				</p>
			</div>
		</section>
	)
}
