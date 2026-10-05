"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Download, Link2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { type ShareView, absolute, cardFileName, cardPath, pagePath, xIntent } from "@/lib/math/share"

/**
 * Share buttons for one view of the page: post it on X, copy the link, or save the card as a picture. The
 * card is the same image link previews show, so what people save is what a pasted link looks like.
 */
export default function ShareMenu({ view, text, stamp, tone = "light", className }: { view: ShareView; text: string; stamp?: number | string; tone?: "light" | "dark"; className?: string }) {
	const [copied, setCopied] = useState(false)
	const timer = useRef<number | undefined>(undefined)
	useEffect(() => () => window.clearTimeout(timer.current), [])

	const url = absolute(pagePath(view))
	const card = cardPath(view, stamp)
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
			// No clipboard permission (or an insecure page): fall back to a prompt-free selection of the address.
			window.open(url, "_blank", "noopener,noreferrer")
		}
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label="Share">
			<a href={xIntent(text, url)} target="_blank" rel="noopener noreferrer" className={btn}>
				<span aria-hidden className="text-[13px] leading-none">𝕏</span>
				Post
			</a>
			<button type="button" onClick={copy} className={btn}>
				{copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Link2 aria-hidden className="h-3.5 w-3.5" />}
				{copied ? "Link copied" : "Copy link"}
			</button>
			<a href={card} download={cardFileName(view)} className={btn}>
				<Download aria-hidden className="h-3.5 w-3.5" />
				Save card
			</a>
			<span role="status" className="sr-only">{copied ? "Link copied" : ""}</span>
		</div>
	)
}
