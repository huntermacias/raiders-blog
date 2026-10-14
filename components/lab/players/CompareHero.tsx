import Link from "@/components/SiteLink"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import GradeRing from "@/components/lab/players/GradeRing"
import { type Comparison, lastName, nameOf } from "@/lib/lab/compareKit"
import { cardStyle, profileHref, sideColors, teamName } from "@/lib/lab/playerView"
import { type PlayerRow, type PlayersData, GROUP_META, countWord, lineRecord, logoUrl, overall, overallRank, rankPhrase } from "@/lib/lab/playersKit"

/**
 * The face-off: both players in their team's colors, each with his overall grade and where it ranks, and between them who leads. Pure
 * markup from the comparison model, so it reads the same with scripts off.
 */
function Side({ data, p, side, c, color, on }: { data: PlayersData; p: PlayerRow; side: "a" | "b"; c: Comparison; color: string; on: string }) {
	const o = overall(p, c.range)
	const score = c.overall[side]
	// Each man is measured against his own season's league.
	const view = c.views[side]
	const rank = c.range === "season" ? overallRank(view, p) : null
	const record = lineRecord(view, p)
	const seasonTag = view.season !== data.season ? `${view.season} season` : c.seasons.a !== c.seasons.b ? `${view.season} so far` : null
	const meta = GROUP_META[p.group]
	const leads = c.overall.lead === side
	// The card's own colors: the first player's are the page's, the second's are set here so the headshot's backing and the ring follow him.
	const vars = side === "a" ? cardStyle(p.team) : { ...cardStyle(p.team), ["--pc-accent" as string]: color, ["--pc-on" as string]: on }
	return (
		<article
			className="lab-opp relative isolate overflow-hidden rounded-2xl border border-lab-line p-3 sm:rounded-3xl sm:p-6"
			style={{ ...vars, backgroundImage: "linear-gradient(165deg, color-mix(in srgb, var(--pc-accent) 22%, var(--lab-surface)) 0%, var(--lab-surface) 62%)" }}
			data-testid={`hero-${side}`}
			aria-label={`${p.name}${seasonTag ? `, ${seasonTag}` : ""}, ${teamName(p.team)} ${p.pos}`}
		>
			<div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 -z-10 opacity-[0.07]">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={logoUrl(p.team)} alt="" width={190} height={190} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-[190px] w-[190px] object-contain" />
			</div>
			<div className="flex flex-col items-center text-center sm:items-start sm:text-left">
				<div className="rounded-full p-[3px]" style={{ background: "var(--pc-accent)" }}>
					<Headshot espn={p.espn} shot={p.shot} name={p.name} size={92} className="!h-[72px] !w-[72px] sm:!h-[92px] sm:!w-[92px] ring-2 ring-lab-surface" />
				</div>
				<p className="m-0 mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
					<TeamLogo team={p.team} size={16} />
					<span className="sm:hidden">
						{p.team} &middot; {p.pos}
					</span>
					<span className="hidden sm:inline">
						{teamName(p.team)} &middot; {p.pos}
					</span>
				</p>
				<h2 className="m-0 mt-1 font-serif text-xl font-bold leading-[1.05] sm:text-3xl">
					<Link href={profileHref(p.slug)} className="hover:underline">
						{p.name}
					</Link>
				</h2>
				{seasonTag ? (
					<p className="m-0 mt-1.5 inline-flex items-center rounded-full border border-lab-line-strong px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-lab-ink" data-testid={`season-tag-${side}`}>
						{seasonTag}
					</p>
				) : null}
				{record ? (
					<p className="m-0 mt-3 text-sm text-lab-soft" data-testid="line-record">
						{record.mine.map((m) => `${m.value} ${countWord(Number(m.value.replace(/,/g, "")), m.label.toLowerCase())}`).join(" · ")}
						<span className="mt-1 block text-xs text-lab-muted">No overall grade for linemen: no public data credits one man with a block.</span>
					</p>
				) : (
					<div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
						<GradeRing grade={o} pct={score} size={72}>
							<span className="font-mono text-2xl font-bold tabular-nums leading-none">{score === null ? "–" : score}</span>
						</GradeRing>
						<div className="text-center sm:text-left">
							<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Overall</p>
							{rank ? (
								<p className="m-0 text-xs font-semibold leading-snug text-lab-ink sm:text-sm">
									{rankPhrase(rank.rank, rank.of)} {meta.peers}
								</p>
							) : (
								<p className="m-0 text-sm font-semibold text-lab-ink">{score === null ? "No grade yet" : "Grade for these games"}</p>
							)}
							{o !== null ? <p className="m-0 hidden text-[11px] leading-tight text-lab-muted sm:block">Scouting grade {Math.round(o)} (50 is average)</p> : null}
						</div>
					</div>
				)}
				{leads ? (
					<p className="m-0 mt-3 inline-flex items-center rounded-full border border-lab-line-strong px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--pc-accent)" }}>
						Higher grade
					</p>
				) : null}
			</div>
			<span className="sr-only">{`${lastName(p)} overall ${score ?? "none"}`}</span>
		</article>
	)
}

/** The middle: "VS" and the score of stats led, or the plain verdict when nobody leads anything that counts. */
function Verdict({ c, colors }: { c: Comparison; colors: { a: string; b: string } }) {
	const { a, b, even, noise } = c.tally
	const decided = a + b > 0
	return (
		<div className="flex flex-col items-center text-center" data-testid="verdict">
			{decided ? (
				<>
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">Stats led</p>
					<p className="m-0 mt-1 flex items-baseline gap-2 font-mono text-5xl font-bold tabular-nums leading-none sm:text-6xl" aria-label={`${nameOf(c, "a")} leads ${a} stats, ${nameOf(c, "b")} leads ${b}`}>
						<span style={{ color: a >= b ? colors.a : "var(--lab-ink-muted)" }}>{a}</span>
						<span className="text-2xl text-lab-muted">&ndash;</span>
						<span style={{ color: b >= a ? colors.b : "var(--lab-ink-muted)" }}>{b}</span>
					</p>
					{even ? <p className="m-0 mt-1 text-xs text-lab-muted">{even} too close to call</p> : null}
				</>
			) : (
				<>
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">Verdict</p>
					<p className="m-0 mt-1 font-serif text-3xl font-bold uppercase leading-none sm:text-4xl">{even ? "Dead even" : "Too early"}</p>
					<p className="m-0 mt-1 text-xs text-lab-muted">{even ? "No gap beats the noise" : `${noise} ${noise === 1 ? "stat is" : "stats are"} still mostly luck`}</p>
				</>
			)}
		</div>
	)
}

export default function CompareHero({ data, c }: { data: PlayersData; c: Comparison }) {
	const colors = sideColors(c.a.team, c.b.team)
	return (
		<div data-testid="compare-hero">
			<div className="relative grid grid-cols-2 gap-2 sm:gap-4">
				<Side data={data} p={c.a} side="a" c={c} color={colors.a} on="var(--pc-on)" />
				<Side data={data} p={c.b} side="b" c={c} color={colors.b} on={colors.onB} />
				<span
					aria-hidden="true"
					className="absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-lab-line-strong bg-lab-page font-serif text-sm font-bold text-lab-soft sm:h-12 sm:w-12 sm:text-base"
				>
					VS
				</span>
			</div>
			<div className="mt-4 rounded-2xl border border-lab-line bg-lab-surface px-4 py-5 sm:px-6">
				<div className="grid items-center gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
					<Verdict c={c} colors={colors} />
					<p className="m-0 text-center font-serif text-lg font-semibold leading-snug text-lab-ink sm:text-left sm:text-2xl" data-testid="headline">
						{c.headline}
					</p>
				</div>
			</div>
		</div>
	)
}
