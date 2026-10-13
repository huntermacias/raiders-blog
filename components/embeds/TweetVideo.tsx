"use client"

import { useEffect, useRef, useState } from "react"

import { videoFrameDoc, xPlayerUrl } from "@/lib/xTweet"

// Plays the video from an X post without sending the reader off the site.
//
// It starts as the poster with a play button (so a page with several videos
// loads none of them). X's video host turns away requests that arrive from other
// websites with a 403, so the video is played inside a small sandboxed frame that
// sends no page address with its request. Each quality X offers is tried in turn.
// If every one is refused, X's own player opens in a window on top of the page, so
// the video still plays here and the reader never has to leave.
export default function TweetVideo({
	sources,
	poster,
	tweetId,
	href,
	width,
	height,
	gif = false,
}: {
	sources: string[]
	poster: string
	tweetId: string
	href: string
	width: number
	height: number
	gif?: boolean
}) {
	const [started, setStarted] = useState(gif)
	const [idx, setIdx] = useState(0)
	const [failed, setFailed] = useState(false)
	const [xPlayer, setXPlayer] = useState(false)
	const frame = useRef<HTMLIFrameElement>(null)

	const live = started && !failed && !!sources[idx]

	// The frame reports back when its video can't load.
	useEffect(() => {
		if (!live) return
		const onMessage = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow || e.data?.xv !== "error") return
			if (idx + 1 < sources.length) setIdx(idx + 1)
			else {
				setFailed(true)
				setXPlayer(true)
			}
		}
		window.addEventListener("message", onMessage)
		return () => window.removeEventListener("message", onMessage)
	}, [live, idx, sources.length])

	// No qualities to try at all: go straight to X's player once the reader presses play.
	useEffect(() => {
		if (started && !sources.length) {
			setFailed(true)
			setXPlayer(true)
		}
	}, [started, sources.length])

	return (
		<div
			className="relative mt-3 overflow-hidden rounded-xl border border-border bg-black"
			style={{ aspectRatio: `${width} / ${height}`, maxHeight: 520 }}
		>
			{live ? (
				<iframe
					ref={frame}
					key={sources[idx]}
					title="Video from the post"
					className="h-full w-full border-0"
					sandbox="allow-scripts"
					allow="autoplay; fullscreen; picture-in-picture"
					allowFullScreen
					referrerPolicy="no-referrer"
					srcDoc={videoFrameDoc(sources[idx], poster, gif)}
				/>
			) : (
				<>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={poster} alt="Video preview" loading="lazy" decoding="async" className="h-full w-full object-cover" />
					{failed ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-4 text-center text-white">
							<button
								type="button"
								onClick={() => setXPlayer(true)}
								className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
							>
								Play video
							</button>
							<a href={href} target="_blank" rel="noreferrer noopener" className="text-xs text-white/80 underline">
								or open the post on X
							</a>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setStarted(true)}
							aria-label="Play video"
							className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
						>
							<span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lg">
								<svg viewBox="0 0 24 24" aria-hidden="true" className="ml-1 h-7 w-7" fill="currentColor">
									<path d="M8 5v14l11-7z" />
								</svg>
							</span>
						</button>
					)}
				</>
			)}
			{xPlayer && <XPlayerWindow tweetId={tweetId} onClose={() => setXPlayer(false)} />}
		</div>
	)
}

// X's own player in a window over the page. Used only when the video file itself can't be played here.
function XPlayerWindow({ tweetId, onClose }: { tweetId: string; onClose: () => void }) {
	const close = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		close.current?.focus()
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
		window.addEventListener("keydown", onKey)
		const prev = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			window.removeEventListener("keydown", onKey)
			document.body.style.overflow = prev
		}
	}, [onClose])

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Video"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
			onClick={onClose}
		>
			<div className="relative w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
				<button
					ref={close}
					type="button"
					onClick={onClose}
					aria-label="Close video"
					className="absolute -top-11 right-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
				>
					Close ✕
				</button>
				<iframe
					title="Video player"
					src={xPlayerUrl(tweetId)}
					className="h-[80vh] max-h-[700px] w-full rounded-2xl border-0 bg-white"
					sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					allow="autoplay; fullscreen; picture-in-picture"
					allowFullScreen
				/>
			</div>
		</div>
	)
}
