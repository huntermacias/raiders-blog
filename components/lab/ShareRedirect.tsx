"use client"

import * as React from "react"

/** Sends the reader on to `href` as soon as the page is up. Link previews are read from the HTML, so they never run this. */
export default function ShareRedirect({ href }: { href: string }) {
	React.useEffect(() => {
		window.location.replace(href)
	}, [href])
	return null
}
