"use client"

import * as React from "react"
import NextLink from "next/link"
import { useRouter } from "next/navigation"

/**
 * next/link with prefetching OFF unless a caller asks for it.
 *
 * Next prefetches every <Link> that scrolls into view. Almost every route on
 * this site renders on demand (force-dynamic), so each prefetch is a real
 * serverless run plus Sanity queries: the header's eight links alone cost
 * eight function calls on every page view, and a long story list or the
 * league board (up to 100 profile links) cost dozens more. Pages render in a
 * second or so on click, so the saving is worth far more than the speed-up.
 *
 * Use this instead of importing next/link directly (a test enforces it). Pass
 * `prefetch` explicitly for a link that deserves it.
 *
 * Why the click handler: on Next 13.2.1, <Link prefetch={false}> navigates with
 * "optimistic navigation", which silently does nothing on routes without a
 * loading.js (the address never changes and the page never switches). So for
 * ordinary internal clicks this calls router.push itself, which fetches the page
 * on demand and works. Modified clicks (new tab, etc.), external links and
 * target="_blank" are left to the browser.
 */
const SiteLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(function SiteLink(
	{ prefetch = false, onClick, href, replace, target, ...props },
	ref
) {
	const router = useRouter()

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		onClick?.(e)
		if (e.defaultPrevented || prefetch !== false) return
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
		if (target && target !== "_self") return
		if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return
		e.preventDefault()
		if (replace) router.replace(href)
		else router.push(href)
	}

	return <NextLink ref={ref} href={href} replace={replace} target={target} prefetch={prefetch} onClick={handleClick} {...props} />
})

export default SiteLink
