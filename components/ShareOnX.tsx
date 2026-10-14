"use client"

import type { ReactNode } from "react"

import { stampedUrl, useHourStamp } from "@/lib/shareStamp"

/**
 * A "Share on X" link. The address that goes into the post carries the hour's stamp (set once the page is on screen), so a link posted
 * after a result is in is a new address and X fetches its card again instead of showing the one it kept from the last time.
 */
export default function ShareOnX({ text, url, className, children }: { text: string; url: string; className?: string; children: ReactNode }) {
	const v = useHourStamp()
	const href = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: stampedUrl(url, v) }).toString()}`
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className={className}>
			{children}
		</a>
	)
}
