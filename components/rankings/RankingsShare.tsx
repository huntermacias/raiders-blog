"use client"

import { useEffect, useState } from "react"
import { Check, Link2 } from "lucide-react"

import ShareOnX from "@/components/ShareOnX"
import { stampedUrl } from "@/lib/shareStamp"

/**
 * Share row for the rankings. X, Facebook and the rest keep the preview card they scraped for an address, so the same /rankings link shows
 * last week's card for days. The shared and copied address therefore carries `v=<stamp>` (the time the rankings were last saved), and the
 * address bar gets the same stamp, so a link copied straight from the browser is a new address each time the rankings change.
 */
export default function RankingsShare({ url, stamp, text }: { url: string; stamp: number; text: string }) {
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		try {
			const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
			const next = stampedUrl(here, stamp)
			if (next !== here) window.history.replaceState(window.history.state, "", next)
		} catch {
			/* an address bar we can't touch is fine; the buttons still carry the stamp */
		}
	}, [stamp])

	async function copy() {
		try {
			await navigator.clipboard.writeText(stampedUrl(url, stamp))
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			/* clipboard blocked: nothing to do */
		}
	}

	const button = "inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
	return (
		<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2" data-testid="rankings-share">
			<ShareOnX text={text} url={url} className={button}>
				Post on X
			</ShareOnX>
			<button type="button" onClick={copy} className={button}>
				{copied ? <Check aria-hidden className="h-4 w-4" /> : <Link2 aria-hidden className="h-4 w-4" />}
				{copied ? "Link copied" : "Copy link"}
			</button>
		</div>
	)
}
