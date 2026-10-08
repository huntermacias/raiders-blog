'use client'

import dynamic from "next/dynamic"

// The Studio is a large single-page app that only ever runs in the browser. Loading it with ssr: false means the
// server never has to evaluate it to answer a request for /studio, which on a cold start was slow enough to hit
// Vercel's 10 second function limit (a 504). The server now sends a small shell and the browser loads the Studio.
const StudioClient = dynamic(() => import("./StudioClient"), {
	ssr: false,
	loading: () => <div style={{display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#8b9096"}}>Loading the Studio...</div>,
})

export default function Studio() {
	return <StudioClient />
}
