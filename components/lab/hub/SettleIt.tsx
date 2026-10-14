"use client"

import { isV2Site } from "@/lib/lab/labMethod"
import * as React from "react"

import Link from "@/components/SiteLink"
import ShareCard from "@/components/lab/ShareCard"
import { DOWN, UP } from "@/components/lab/players/Bits"
import { Headshot } from "@/components/lab/players/Media"
import { type Contender, type Take, pickLine } from "@/lib/lab/hubKit"
import { cardStyle } from "@/lib/lab/playerView"
import { trackPlayers } from "@/lib/lab/track"

const KEY = "lab-hub-picks-v1"
type Picks = Record<string, "a" | "b">

const keyOf = (t: Take) => `${t.a.slug}|${t.b.slug}`

const load = (): Picks => {
	try {
		const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Picks
		return raw && typeof raw === "object" ? raw : {}
	} catch {
		return {}
	}
}

function Side({ c, side, picked, locked, win, onPick }: { c: Contender; side: "a" | "b"; picked: boolean; locked: boolean; win: boolean | null; onPick: () => void }) {
	return (
		<button
			type="button"
			onClick={onPick}
			aria-pressed={picked}
			disabled={locked && !picked}
			data-testid={`pick-${side}`}
			style={cardStyle(c.team)}
			className={`flex min-h-[132px] flex-1 flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition ${picked ? "border-lab-ink bg-lab-hover" : "border-lab-line-strong bg-lab-surface hover:bg-lab-hover"} ${locked && !picked ? "opacity-70" : ""}`}
		>
			<Headshot espn={c.espn} shot={c.shot} name={c.name} size={64} />
			<span className="font-serif text-lg font-bold leading-tight text-lab-ink">{c.name}</span>
			<span className="text-xs text-lab-muted">
				{c.pos} &middot; {c.nick}
			</span>
			{c.line ? <span className="font-mono text-xs font-semibold tabular-nums text-lab-soft">{c.line}</span> : null}
			{locked && c.grade !== null ? (
				<span className={`font-mono text-sm font-bold tabular-nums ${win === true ? UP : win === false ? DOWN : "text-lab-soft"}`}>
					{isV2Site() ? "This season" : "Lab grade"} {c.grade}
				</span>
			) : null}
		</button>
	)
}

function TakeCard({ take, pick, stamp, onPick }: { take: Take; pick: "a" | "b" | undefined; stamp: number; onPick: (p: "a" | "b") => void }) {
	const locked = Boolean(pick)
	const line = pick ? pickLine(take, pick) : null
	const win = (side: "a" | "b") => (take.verdict.lead === "even" ? null : take.verdict.lead === side)
	const mine = pick ? (pick === "a" ? take.a : take.b) : null
	return (
		<article className="flex h-full flex-col rounded-2xl border border-lab-line bg-lab-surface p-5" data-testid={`take-${take.id}`}>
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">{take.tag}</p>
			<h3 className="m-0 mt-2 font-serif text-xl font-bold leading-snug tracking-tight">{take.question}</h3>
			<div className="mt-4 flex items-stretch gap-3" role="group" aria-label={take.question}>
				<Side c={take.a} side="a" picked={pick === "a"} locked={locked} win={locked ? win("a") : null} onPick={() => onPick("a")} />
				<span aria-hidden="true" className="self-center text-xs font-bold uppercase tracking-[0.14em] text-lab-muted">
					or
				</span>
				<Side c={take.b} side="b" picked={pick === "b"} locked={locked} win={locked ? win("b") : null} onPick={() => onPick("b")} />
			</div>
			<div aria-live="polite" className="mt-4 min-h-[3.5rem] text-sm" data-testid="verdict">
				{!pick ? (
					<p className="m-0 text-lab-muted">Pick one first. The Lab&rsquo;s answer shows after.</p>
				) : (
					<>
						<p className={`m-0 font-bold ${line?.agree ? UP : DOWN}`}>{line?.text}</p>
						<p className="m-0 mt-1 leading-relaxed text-lab-soft">{take.verdict.text}</p>
						<p className="m-0 mt-1 text-xs leading-relaxed text-lab-muted">{take.because}</p>
					</>
				)}
			</div>
			<div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
				<Link href={take.href} className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline" onClick={() => trackPlayers("lab_hub_take_compare", { take: take.id })}>
					Full comparison &rarr;
				</Link>
				{pick && mine ? (
					<ShareCard
						target={{ type: "compare", query: take.query, linkQuery: take.query, sharePath: "/lab/players/compare", name: `${take.a.name} vs ${take.b.name}`, file: `raiders-rundown-${take.a.slug}-vs-${take.b.slug}`, campaign: "lab_hub_take" }}
						stamp={stamp}
						text={`${line?.text} Who would you take: ${take.a.name} or ${take.b.name}?`}
						alt={`${take.a.name} against ${take.b.name}, side by side`}
						label="Share my pick"
						footnote="The link opens the full comparison."
						onOpen={() => trackPlayers("lab_hub_share_opened", { drop: `take-${take.id}` })}
						onAction={(method) => trackPlayers("lab_hub_share_action", { drop: `take-${take.id}`, method })}
					/>
				) : null}
			</div>
		</article>
	)
}

/**
 * "Settle it": arguments the numbers can answer. The reader picks a side first; only then does the Lab say which way its grades lean.
 * Picks stay in this browser, and the heading keeps score ("You and the Lab agree on 2 of 3"), a reason to come back for new ones.
 */
export default function SettleIt({ takes, stamp }: { takes: Take[]; stamp: number }) {
	const [picks, setPicks] = React.useState<Picks>({})
	React.useEffect(() => setPicks(load()), [])

	const choose = (t: Take, side: "a" | "b") => {
		const k = keyOf(t)
		if (picks[k]) return
		const next = { ...picks, [k]: side }
		setPicks(next)
		try {
			window.localStorage.setItem(KEY, JSON.stringify(next))
		} catch {
			// Storage blocked: the pick still counts on this page.
		}
		trackPlayers("lab_hub_pick", { take: t.id, agree: pickLine(t, side).agree })
	}

	const answered = takes.filter((t) => picks[keyOf(t)])
	const agreed = answered.filter((t) => pickLine(t, picks[keyOf(t)]).agree).length

	if (!takes.length) return null
	return (
		<div>
			<p className="m-0 mb-4 text-sm text-lab-muted" role="status" data-testid="score">
				{answered.length ? `You and the Lab agree on ${agreed} of ${answered.length}.` : "Pick a side on each. Then see where the Lab's numbers land."}
			</p>
			<ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
				{takes.map((t) => (
					<li key={t.id}>
						<TakeCard take={t} pick={picks[keyOf(t)]} stamp={stamp} onPick={(s) => choose(t, s)} />
					</li>
				))}
			</ul>
		</div>
	)
}
