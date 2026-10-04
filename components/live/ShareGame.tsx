"use client"

import * as React from "react"
import { Check, Share2 } from "lucide-react"

import type { LiveGameInfo } from "@/lib/live/types"

/** The link to share a game: the page with the game picked, plus a minute stamp so a platform that already scraped /live fetches the card again. */
export function shareUrl(origin: string, gameId: string, now: number = Date.now()): string {
	return `${origin}/live?game=${encodeURIComponent(gameId)}&v=${Math.floor(now / 60_000)}`
}

/** What the share sheet or a post says: "Raiders 35, Saints 27 (Final)" or "Saints at Raiders, live". */
export function shareText(info: LiveGameInfo): string {
	const a = info.away
	const h = info.home
	if (info.state === "pre") return `${a.name} at ${h.name}: win probability and every play, live.`
	const lead = a.score >= h.score ? [a, h] : [h, a]
	const score = `${lead[0].name.split(" ").pop()} ${lead[0].score}, ${lead[1].name.split(" ").pop()} ${lead[1].score}`
	return info.state === "post" ? `${score} (Final). Win probability, drive by drive.` : `${score}, ${info.shortDetail || "live"}. Follow it play by play.`
}

/**
 * Shares or copies the link to the game being watched. On a phone it opens the share sheet; anywhere
 * else it copies the link and says so. Whatever happens, the person is told in words.
 */
export default function ShareGame({ info }: { info: LiveGameInfo }) {
	const [note, setNote] = React.useState("")
	const timer = React.useRef<number | undefined>(undefined)

	React.useEffect(() => () => window.clearTimeout(timer.current), [])

	const tell = (msg: string) => {
		setNote(msg)
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => setNote(""), 2500)
	}

	const share = async () => {
		const url = shareUrl(window.location.origin, info.id)
		const text = shareText(info)
		try {
			if (typeof navigator.share === "function" && /android|iphone|ipad|mobile/i.test(navigator.userAgent)) {
				await navigator.share({ title: "Raiders Rundown Game Day", text, url })
				return
			}
			await navigator.clipboard.writeText(url)
			tell("Link copied")
		} catch (e) {
			// Closing the share sheet is not a failure.
			if ((e as Error)?.name === "AbortError") return
			try {
				await navigator.clipboard.writeText(url)
				tell("Link copied")
			} catch {
				tell(url)
			}
		}
	}

	return (
		<div className="flex items-center justify-end gap-3">
			<span role="status" aria-live="polite" className="text-xs font-medium text-lab-soft">
				{note}
			</span>
			<button
				type="button"
				onClick={share}
				className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-lab-line-strong bg-lab-surface px-4 text-sm font-semibold text-lab-ink transition-colors hover:bg-lab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lab-line-strong"
			>
				{note === "Link copied" ? <Check aria-hidden className="h-4 w-4" /> : <Share2 aria-hidden className="h-4 w-4" />}
				Share this game
			</button>
		</div>
	)
}
