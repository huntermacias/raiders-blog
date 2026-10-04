"use client"

import { useEffect, useState } from "react"

import { countdownParts } from "@/lib/home"

function pad(n: number) {
	return String(n).padStart(2, "0")
}

/**
 * Ticking countdown to kickoff. The server render (and the first client
 * render) shows nothing but the placeholder, so hydration always matches;
 * the clock starts in an effect.
 */
export default function Countdown({ kickoff, live = false }: { kickoff: string; live?: boolean }) {
	const [now, setNow] = useState<number | null>(null)

	useEffect(() => {
		setNow(Date.now())
		const id = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(id)
	}, [])

	const target = new Date(kickoff).getTime()

	if (live || (now !== null && now >= target)) {
		return (
			<p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-rose-300">
				<span aria-hidden className="relative flex h-2.5 w-2.5">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
					<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-400" />
				</span>
				Game on
			</p>
		)
	}

	const parts = now === null ? null : countdownParts(target - now)
	const cells: { label: string; value: string }[] = parts
		? [
				...(parts.days > 0 ? [{ label: "days", value: String(parts.days) }] : []),
				{ label: "hrs", value: pad(parts.hours) },
				{ label: "min", value: pad(parts.minutes) },
				{ label: "sec", value: pad(parts.seconds) },
		  ]
		: [
				{ label: "hrs", value: "--" },
				{ label: "min", value: "--" },
				{ label: "sec", value: "--" },
		  ]

	return (
		<div role="timer" aria-label="Time until kickoff" className="flex items-end gap-3">
			{cells.map((c) => (
				<div key={c.label} className="min-w-[2.75rem] text-center">
					<p className="font-serif text-3xl font-bold leading-none tabular-nums text-zinc-50 md:text-4xl">{c.value}</p>
					<p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{c.label}</p>
				</div>
			))}
		</div>
	)
}
