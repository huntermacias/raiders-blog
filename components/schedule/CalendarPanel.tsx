"use client"

import * as React from "react"
import { CalendarPlus, Check, Copy, Download } from "lucide-react"

import { cn } from "@/lib/utils"
import { ALARM_CHOICES, SITE_URL, feedPath } from "@/lib/calendar"

const LABELS: Record<number, string> = { 0: "At kickoff", 15: "15 min", 30: "30 min", 60: "1 hour", 1440: "1 day" }

/**
 * Put the whole schedule on a phone or laptop calendar. Subscribing (webcal) keeps it current as
 * kickoff times, picks and scores change; downloading is a one-time copy. The reminder choice is
 * baked into the feed link, so each device gets the alert the reader picked.
 */
export default function CalendarPanel({ games }: { games: number }) {
	const [alarm, setAlarm] = React.useState<number | null>(30)
	const [host, setHost] = React.useState(SITE_URL.replace(/^https?:\/\//, ""))
	const [secure, setSecure] = React.useState(true)
	const [copied, setCopied] = React.useState(false)
	const groupId = React.useId()
	const input = React.useRef<HTMLInputElement>(null)

	React.useEffect(() => {
		setHost(window.location.host)
		setSecure(window.location.protocol === "https:")
	}, [])

	const path = feedPath({ alarm })
	const https = `${secure ? "https" : "http"}://${host}${path}`
	const webcal = `webcal://${host}${path}`
	const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
	const download = feedPath({ alarm, download: true })

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(https)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			input.current?.focus()
			input.current?.select()
		}
	}

	const btn =
		"inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

	return (
		<section aria-labelledby="calendar-heading" className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
				<div className="max-w-xl">
					<h2 id="calendar-heading" className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight">
						<CalendarPlus aria-hidden className="h-5 w-5 text-muted-foreground" /> Add the Raiders to your calendar
					</h2>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						All {games} kickoffs in your time zone. Subscribe and it stays current: if a game gets flexed, the time updates on its own, and my pick, the final score and the recap link fill in as they happen.
					</p>
				</div>
			</div>

			<fieldset className="mt-5">
				<legend className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Remind me</legend>
				<div className="mt-2 flex flex-wrap gap-2">
					{[null, ...ALARM_CHOICES].map((m) => {
						const on = alarm === m
						const label = m == null ? "No reminder" : LABELS[m]
						return (
							<label
								key={String(m)}
								className={cn(
									"inline-flex min-h-[40px] cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
									on ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:text-foreground"
								)}
							>
								<input type="radio" name={groupId} className="sr-only" checked={on} onChange={() => setAlarm(m)} />
								{label}
							</label>
						)
					})}
				</div>
			</fieldset>

			<div className="mt-5 grid gap-2 sm:grid-cols-3">
				<a href={webcal} className={cn(btn, "bg-foreground text-background hover:opacity-90")}>
					<CalendarPlus aria-hidden className="h-4 w-4" /> Subscribe
					<span className="hidden text-xs font-normal opacity-70 sm:inline">Apple &amp; Outlook</span>
				</a>
				<a href={google} target="_blank" rel="noopener noreferrer" className={cn(btn, "border border-border bg-background hover:bg-muted")}>
					Google Calendar
				</a>
				<a href={download} download className={cn(btn, "border border-border bg-background hover:bg-muted")}>
					<Download aria-hidden className="h-4 w-4" /> Download .ics
				</a>
			</div>

			<div className="mt-3 flex items-stretch gap-2">
				<label htmlFor={`${groupId}-url`} className="sr-only">
					Calendar feed link
				</label>
				<input
					id={`${groupId}-url`}
					ref={input}
					readOnly
					value={https}
					onFocus={(e) => e.currentTarget.select()}
					className="min-h-[40px] min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 font-mono text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<button type="button" onClick={copy} className={cn(btn, "min-h-[40px] shrink-0 border border-border bg-background hover:bg-muted")}>
					{copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
					<span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
				</button>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">Paste the link into any calendar app&rsquo;s &ldquo;subscribe from URL.&rdquo; Games without a kickoff time yet are added once it&rsquo;s set.</p>
		</section>
	)
}
