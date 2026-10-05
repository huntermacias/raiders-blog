"use client"

import * as React from "react"
import { Check, Link2 } from "lucide-react"

import { challengeUrl } from "@/lib/league"

/**
 * Copies a player's personal challenge link (or opens the share sheet on a phone). Whatever happens,
 * the person is told in words, and if copying is blocked the link itself is shown to copy by hand.
 */
export default function ChallengeLink({ handle, className }: { handle: string; className?: string }) {
	const [note, setNote] = React.useState("")
	const timer = React.useRef<number | undefined>(undefined)

	React.useEffect(() => () => window.clearTimeout(timer.current), [])

	const tell = (msg: string) => {
		setNote(msg)
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => setNote(""), 3000)
	}

	const go = async () => {
		const url = challengeUrl(window.location.origin, handle)
		try {
			if (typeof navigator.share === "function" && /android|iphone|ipad|mobile/i.test(navigator.userAgent)) {
				await navigator.share({ title: "Beat the Blogger", text: `Think you can out-pick ${handle}? Pick the scores and find out.`, url })
				return
			}
			await navigator.clipboard.writeText(url)
			tell("Challenge link copied")
		} catch (e) {
			if ((e as Error)?.name === "AbortError") return
			try {
				await navigator.clipboard.writeText(url)
				tell("Challenge link copied")
			} catch {
				tell(url)
			}
		}
	}

	return (
		<span className={className}>
			<button
				type="button"
				onClick={go}
				className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				{note.startsWith("Challenge") ? <Check aria-hidden className="h-4 w-4" /> : <Link2 aria-hidden className="h-4 w-4" />}
				Challenge a friend
			</button>
			<span role="status" aria-live="polite" className="ml-2 text-xs text-muted-foreground break-all">
				{note}
			</span>
		</span>
	)
}
