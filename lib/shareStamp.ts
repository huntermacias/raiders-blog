// A shared link carries a version, so a link posted after the numbers changed is a new address. X, Facebook, Slack and the rest keep the
// preview card of an address they have already seen for days; the card's own image address changes with the data, but they never look at
// it again unless the link they were given is different. Pure helpers here; the hook is for links that are rendered as plain anchors.

import { useEffect, useState } from "react"

/** A number that changes once an hour, the same cadence the cards are cached on. */
export const hourStamp = (now: number = Date.now()): number => Math.floor(now / 3_600_000)

/** The address with `v=<stamp>` set (replacing any `v`), ahead of a #fragment. A missing or zero stamp leaves the address as it is. */
export function stampedUrl(url: string, stamp: number | string | null | undefined): string {
	if (stamp === null || stamp === undefined || stamp === "" || stamp === 0) return url
	const hash = url.indexOf("#")
	const base = hash === -1 ? url : url.slice(0, hash)
	const frag = hash === -1 ? "" : url.slice(hash)
	const q = base.indexOf("?")
	const path = q === -1 ? base : base.slice(0, q)
	const params = (q === -1 ? "" : base.slice(q + 1)).split("&").filter((p) => p && !/^v=/.test(p))
	params.push(`v=${stamp}`)
	return `${path}?${params.join("&")}${frag}`
}

/**
 * The hour's stamp once the page is on screen, null before (so the server's HTML and the first client render agree). For a share link that
 * is an anchor: `stampedUrl(link, useHourStamp())`.
 */
export function useHourStamp(): number | null {
	const [v, setV] = useState<number | null>(null)
	useEffect(() => setV(hourStamp()), [])
	return v
}
