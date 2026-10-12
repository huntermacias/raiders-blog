"use client"

import { useEffect, useRef, useState } from "react"

import { headshotUrl, initialsOf, logoUrl, shotUrl } from "@/lib/lab/playersKit"

/**
 * An image the server rendered can fail before React is listening for its error event, so on mount look at whether it has already
 * failed (finished loading with no pixels) and fall back then.
 */
function useFailed(setBroken: (b: boolean) => void) {
	const ref = useRef<HTMLImageElement>(null)
	useEffect(() => {
		const img = ref.current
		if (img && img.complete && img.naturalWidth === 0) setBroken(true)
	}, [setBroken])
	return ref
}

/**
 * A team's logo, with the team's code in its color if the image does not load. The images are loaded straight from ESPN's image host,
 * so a broken link must never leave a hole on the page.
 */
export function TeamLogo({ team, size = 20, className = "" }: { team: string; size?: number; className?: string }) {
	const [broken, setBroken] = useState(false)
	const ref = useFailed(setBroken)
	if (broken) {
		return (
			<span
				className={`inline-flex shrink-0 items-center justify-center rounded-md text-[9px] font-bold uppercase ${className}`}
				style={{ width: size, height: size, background: "var(--pc-accent)", color: "var(--pc-on)" }}
				aria-hidden="true"
			>
				{team}
			</span>
		)
	}
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img ref={ref} src={logoUrl(team)} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />
	)
}

/** A player's headshot in his team's color, or his initials when there is no photo or it fails to load. */
export function Headshot({ espn, shot, name, size = 56, className = "" }: { espn?: number; shot?: string; name: string; size?: number; className?: string }) {
	const [broken, setBroken] = useState(false)
	const ref = useFailed(setBroken)
	const box = { width: size, height: size }
	return (
		<span className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full ${className}`} style={{ ...box, background: "var(--pc-accent)" }} data-testid="headshot">
			{(espn || shot) && !broken ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img ref={ref} src={espn ? headshotUrl(espn) : shotUrl(shot!)} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover object-top" />
			) : (
				<span className="flex h-full w-full items-center justify-center font-serif font-bold" style={{ color: "var(--pc-on)", fontSize: Math.max(11, size * 0.36) }} aria-label={name}>
					{initialsOf(name)}
				</span>
			)}
		</span>
	)
}
