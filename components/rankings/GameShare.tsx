"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Download, Link2, Share2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { gameCardPath, gamePagePath, minuteStamp } from "@/lib/rankingsLive"
import { SITE_URL, xIntent } from "@/lib/math/share"

/**
 * Shares one game: a button that opens three actions (post on X, copy the link, save the score card as a picture). The card is the same
 * image link previews show (`/api/og?type=live`), and the link carries a minute stamp so a platform that already saw this game's address
 * fetches the card again after the score moves. The stamp is set when the actions open, not on first paint, so server and browser agree.
 */
export default function GameShare({
	gameId,
	text,
	label,
	tone = "light",
	className,
}: {
	gameId: string
	/** The words of the post, e.g. "Q3 4:12: No. 2 Bills 21, No. 5 Chiefs 17." */
	text: string
	/** Names the game for screen readers, e.g. "Bills at Chiefs". */
	label: string
	tone?: "light" | "dark"
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const [stamp, setStamp] = useState<number | undefined>(undefined)
	const [copied, setCopied] = useState(false)
	const timer = useRef<number | undefined>(undefined)
	useEffect(() => () => window.clearTimeout(timer.current), [])

	const url = `${SITE_URL}${gamePagePath(gameId, stamp)}`
	const card = gameCardPath(gameId, stamp)
	const btn = cn(
		"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
		tone === "dark" ? "border-white/20 bg-white/5 text-zinc-100 hover:bg-white/15 focus-visible:outline-white" : "border-border bg-card hover:bg-muted focus-visible:outline-foreground"
	)

	async function copy() {
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			window.clearTimeout(timer.current)
			timer.current = window.setTimeout(() => setCopied(false), 2000)
		} catch {
			// No clipboard permission: open the address so it can be copied by hand.
			window.open(url, "_blank", "noopener,noreferrer")
		}
	}

	if (!open) {
		return (
			<button
				type="button"
				className={cn(btn, className)}
				aria-label={`Share the ${label} score`}
				aria-expanded={false}
				onClick={() => {
					setStamp(minuteStamp())
					setOpen(true)
				}}
			>
				<Share2 aria-hidden className="h-3.5 w-3.5" />
				Share score
			</button>
		)
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group" aria-label={`Share the ${label} score`}>
			<a href={xIntent(text, url)} target="_blank" rel="noopener noreferrer" className={btn}>
				<span aria-hidden className="text-[13px] leading-none">𝕏</span>
				Post
			</a>
			<button type="button" onClick={copy} className={btn}>
				{copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Link2 aria-hidden className="h-3.5 w-3.5" />}
				{copied ? "Copied" : "Copy link"}
			</button>
			<a href={card} download={`raiders-rundown-score-${gameId}.png`} className={btn}>
				<Download aria-hidden className="h-3.5 w-3.5" />
				Save card
			</a>
			<button type="button" onClick={() => setOpen(false)} className={cn(btn, "w-8 justify-center px-0")} aria-label="Close share options">
				<X aria-hidden className="h-3.5 w-3.5" />
			</button>
			<span role="status" className="sr-only">{copied ? "Link copied" : ""}</span>
		</div>
	)
}
