"use client"

import * as React from "react"

import { type Pulse, type Since, sinceLast } from "@/lib/lab/hubKit"
import { trackPlayers } from "@/lib/lab/track"

const KEY = "lab-hub-pulse-v1"

type Stored = { baseline: Pulse | null; current: Pulse; seenAt: number }

const read = (): Stored | null => {
	try {
		const raw = window.localStorage.getItem(KEY)
		if (!raw) return null
		const v = JSON.parse(raw) as Stored
		return v && v.current && typeof v.current.stamp === "number" ? v : null
	} catch {
		return null
	}
}

const write = (v: Stored) => {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(v))
	} catch {
		// Private windows and blocked storage: the strip just starts fresh next time.
	}
}

/**
 * "Since you were last here": the few numbers that move (the week, the Raiders' record, their playoff odds, how many findings are new),
 * set against what this browser saw the last time the Lab's numbers were different. The browser keeps only that last pulse, nothing
 * about the reader leaves it. Before it has run (and with no storage) the strip says what the Lab is, so the server's HTML is never empty.
 */
export default function HubPulse({ pulse }: { pulse: Pulse }) {
	const [since, setSince] = React.useState<Since | null>(null)
	const [seenAt, setSeenAt] = React.useState<number | null>(null)

	React.useEffect(() => {
		const stored = read()
		// The baseline moves on only when the Lab's numbers have changed since the last visit, so a reload shows the same news.
		const baseline = stored ? (stored.current.stamp !== pulse.stamp ? stored.current : stored.baseline) : null
		const next = sinceLast(baseline, pulse)
		setSince(next)
		setSeenAt(stored ? (stored.current.stamp !== pulse.stamp ? stored.seenAt : (stored.seenAt ?? null)) : null)
		write({ baseline, current: pulse, seenAt: stored && stored.current.stamp === pulse.stamp ? stored.seenAt : Date.now() })
		trackPlayers("lab_hub_view", { returning: Boolean(stored), changed: next.lines.length > 0 })
	}, [pulse])

	const when = seenAt ? new Date(seenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null

	return (
		<aside aria-label="Since you were last here" className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" data-testid="hub-pulse">
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">{since && !since.first ? "Since you were last here" : "Come back after Sunday"}</p>
			{since && !since.first ? (
				since.lines.length ? (
					<ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-sm text-lab-ink">
						{since.lines.map((l) => (
							<li key={l} className="flex gap-2">
								<span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-lab-ink" />
								<span>{l}</span>
							</li>
						))}
					</ul>
				) : (
					<p className="m-0 mt-2 text-sm text-lab-soft">Nothing has moved{when ? ` since ${when}` : ""}. The Lab rebuilds after every game, so check back after Sunday.</p>
				)
			) : (
				<p className="m-0 mt-2 text-sm text-lab-soft">The Lab rebuilds after every game. Visit again and this box tells you what changed: the playoff odds, the record, and which findings are new.</p>
			)}
		</aside>
	)
}
