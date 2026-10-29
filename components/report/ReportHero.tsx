import Image from "next/image"
import Link from "@/components/SiteLink"

import { TeamLogo } from "@/components/lab/players/Media"
import type { ReportView } from "@/lib/report/build"

type Props = {
	view: ReportView
	imageUrl: string
	imagePosition: string
	author: string
	published: string
	minutes: number | null
	/** Share, comment and reaction controls, placed by the page. */
	actions: React.ReactNode
	homeAway: "home" | "away"
}

function Team({ code, name, sub, score, won, align }: { code: string; name: string; sub: string | null; score: number; won: boolean; align: "left" | "right" }) {
	const right = align === "right"
	return (
		<div className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-6 sm:text-left ${right ? "sm:flex-row-reverse sm:text-right" : ""}`}>
			<TeamLogo team={code} size={72} className="h-14 w-14 sm:h-[72px] sm:w-[72px] lg:h-24 lg:w-24" />
			<div className="min-w-0">
				<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 sm:text-sm">{name}</p>
				<p
					className={`font-sans text-6xl font-extrabold leading-none tabular-nums sm:text-8xl lg:text-9xl ${won ? "text-white" : "text-white/55"}`}
					aria-label={`${name} ${score}`}
				>
					{score}
				</p>
				{sub && <p className="mt-1 hidden text-xs text-white/55 sm:block">{sub}</p>}
			</div>
		</div>
	)
}

/**
 * The top of a game report: the real score on a scoreboard, the line score, then the headline. Always dark, so the photo and the team
 * colors read the same in either site theme. Away team on the left and home team on the right, as every scoreboard has them.
 */
export default function ReportHero({ view, imageUrl, imagePosition, author, published, minutes, actions, homeAway }: Props) {
	const oppCode = view.opp.abbr ?? "NFL"
	const lost = view.result === "L"
	const raidersWon = view.result === "W"
	const oppWon = lost
	const raiders = { code: "LV", name: "Raiders", score: view.score.raiders, won: raidersWon || view.result === "T", sub: view.record ? `${view.record} on the season` : null }
	const opp = { code: oppCode, name: view.opp.nick, score: view.score.opponent, won: oppWon || view.result === "T", sub: null as string | null }
	const away = homeAway === "home" ? opp : raiders
	const home = homeAway === "home" ? raiders : opp
	const verdict = view.result === "W" ? "Win" : view.result === "L" ? "Loss" : "Tie"

	return (
		<header
			className="dark relative isolate overflow-hidden bg-[#0b0d10] text-white"
			style={{ "--pc-accent": view.opp.color, "--pc-on": "#ffffff" } as React.CSSProperties}
		>
			<Image src={imageUrl} alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-40" style={{ objectPosition: imagePosition }} />
			<div
				className="absolute inset-0 -z-10"
				style={{
					backgroundImage: `linear-gradient(to bottom, rgba(11,13,16,0.55), rgba(11,13,16,0.82) 55%, #0b0d10), radial-gradient(circle at 88% 0%, ${view.opp.color}66, transparent 55%), radial-gradient(circle at 6% 0%, rgba(223,227,234,0.18), transparent 50%)`,
				}}
			/>
			<div className="container max-w-6xl pb-8 pt-8 sm:pb-12 sm:pt-12">
				<nav className="flex min-w-0 items-center gap-1.5 text-xs text-white/60">
					<Link href="/" className="shrink-0 hover:text-white hover:underline">Home</Link>
					<span aria-hidden>/</span>
					<Link href="/games" className="shrink-0 hover:text-white hover:underline">Game Reports</Link>
					<span aria-hidden>/</span>
					<span className="min-w-0 truncate text-white/80">{view.week ? `Week ${view.week}` : view.title}</span>
				</nav>

				<div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
					<span>Game report</span>
					{view.week && <span aria-hidden className="h-1 w-1 rounded-full bg-white/40" />}
					{view.week && <span>Week {view.week}</span>}
					<span aria-hidden className="h-1 w-1 rounded-full bg-white/40" />
					<span className="normal-case tracking-normal text-white/60">{view.dateLabel} &middot; {view.venue}</span>
					<span
						className={`ml-auto rounded-full px-3 py-1 text-[11px] tracking-[0.18em] ${view.result === "W" ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/40" : view.result === "L" ? "bg-rose-400/15 text-rose-300 ring-1 ring-rose-300/40" : "bg-white/10 text-white/80 ring-1 ring-white/25"}`}
					>
						{verdict}
					</span>
				</div>

				<div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-8" role="group" aria-label={`Final score: ${away.name} ${away.score}, ${home.name} ${home.score}`}>
					<Team {...away} align="left" />
					<div className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50 sm:text-xs">
						<p>Final</p>
						<p className="mt-1 text-white/35">{homeAway === "home" ? "at" : "vs"}</p>
					</div>
					<Team {...home} align="right" />
				</div>

				{view.quarters.length > 0 && (
					<table className="mx-auto mt-6 w-full max-w-xs border-separate border-spacing-y-1 text-center font-sans text-sm tabular-nums" aria-label="Score by quarter">
						<thead>
							<tr className="text-[10px] uppercase tracking-[0.2em] text-white/45">
								<th className="w-1/3 text-left font-semibold" scope="col"><span className="sr-only">Team</span></th>
								{view.quarters.map((q) => (
									<th key={q.label} scope="col" className="font-semibold">{q.label}</th>
								))}
								<th scope="col" className="font-semibold text-white/70">T</th>
							</tr>
						</thead>
						<tbody>
							{[{ t: away, side: homeAway === "home" ? ("opp" as const) : ("me" as const) }, { t: home, side: homeAway === "home" ? ("me" as const) : ("opp" as const) }].map(({ t, side }) => (
								<tr key={t.code} className="text-white/85">
									<th scope="row" className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{t.code}</th>
									{view.quarters.map((q) => (
										<td key={q.label}>{side === "me" ? q.me : q.opp}</td>
									))}
									<td className="font-bold text-white">{t.score}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{view.halftime && <p className="mt-2 text-center text-xs text-white/55">{view.halftime}</p>}

				<h1 className="mx-auto mt-8 max-w-4xl text-balance text-center font-serif text-3xl font-bold leading-[1.08] tracking-tight sm:mt-10 sm:text-5xl lg:text-6xl">{view.title}</h1>
				{view.description && <p className="mx-auto mt-4 max-w-3xl text-pretty text-center text-base text-white/75 sm:text-xl">{view.description}</p>}

				<div className="mx-auto mt-7 flex max-w-4xl flex-col gap-3 border-t border-white/15 pt-4 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
					<span>
						By <span className="font-semibold text-white">{author}</span> &middot; {published}
						{minutes ? <> &middot; {minutes} min read</> : null}
					</span>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>
				</div>
			</div>
		</header>
	)
}
