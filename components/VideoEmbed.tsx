"use client"

import { useEffect, useRef } from "react"
import Script from "next/script"

declare global {
	interface Window {
		twttr?: { widgets?: { load: (el?: HTMLElement) => void } }
	}
}

function getYouTubeId(url: string): string | null {
	try {
		const u = new URL(url)
		if (u.hostname.includes("youtu.be")) return u.pathname.slice(1)
		if (u.hostname.includes("youtube.com")) {
			if (u.pathname === "/watch") return u.searchParams.get("v")
			if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1]
			if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/shorts/")[1]
		}
	} catch {
		return null
	}
	return null
}

function isXUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname
		return host.endsWith("x.com") || host.endsWith("twitter.com")
	} catch {
		return false
	}
}

function YouTubeEmbed({ url, caption }: { url: string; caption?: string }) {
	const id = getYouTubeId(url)
	if (!id) return null

	return (
		<figure className="my-8 not-prose">
			<div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
				<iframe
					className="absolute inset-0 h-full w-full"
					src={`https://www.youtube.com/embed/${id}`}
					title={caption ?? "YouTube video"}
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
					allowFullScreen
				/>
			</div>
			{caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
		</figure>
	)
}

function XEmbed({ url, caption }: { url: string; caption?: string }) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		window.twttr?.widgets?.load(ref.current ?? undefined)
	}, [url])

	return (
		<figure className="my-8 flex flex-col items-center not-prose">
			<Script src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" id="twitter-widgets" />
			<div ref={ref} className="w-full max-w-lg">
				<blockquote className="twitter-tweet" data-theme="light">
					<a href={url}>{url}</a>
				</blockquote>
			</div>
			{caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
		</figure>
	)
}

function VideoEmbed({ url, caption }: { url: string; caption?: string }) {
	if (!url) return null
	if (isXUrl(url)) return <XEmbed url={url} caption={caption} />
	return <YouTubeEmbed url={url} caption={caption} />
}

export default VideoEmbed
