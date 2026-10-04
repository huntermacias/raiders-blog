import * as React from "react"
import NextLink from "next/link"

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
 */
const SiteLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(function SiteLink({ prefetch = false, ...props }, ref) {
	return <NextLink ref={ref} prefetch={prefetch} {...props} />
})

export default SiteLink
