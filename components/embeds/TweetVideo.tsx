"use client"

import { useState } from "react"

// Plays the video from an X post. Starts as the poster with a play button (so
// a page with several videos loads none of them), tries each quality X offers
// in turn, and if none will play on this site (X's video host refuses some
// requests) it says so and links to the post instead of leaving a dead player.
export default function TweetVideo({
	sources,
	poster,
	href,
	width,
	height,
	gif = false,
}: {
	sources: string[]
	poster: string
	href: string
	width: number
	height: number
	gif?: boolean
}) {
	const [started, setStarted] = useState(gif)
	const [idx, setIdx] = useState(0)
	const [failed, setFailed] = useState(false)

	const onError = () => (idx + 1 < sources.length ? setIdx(idx + 1) : setFailed(true))

	return (
		<div
			className="relative mt-3 overflow-hidden rounded-xl border border-border bg-muted"
			style={{ aspectRatio: `${width} / ${height}`, maxHeight: 520 }}
		>
			{started && !failed && sources[idx] ? (
				<video
					key={sources[idx]}
					className="h-full w-full object-contain"
					src={sources[idx]}
					poster={poster}
					controls={!gif}
					autoPlay
					loop={gif}
					muted={gif}
					playsInline
					onError={onError}
				/>
			) : (
				<>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={poster} alt="Video preview" loading="lazy" decoding="async" className="h-full w-full object-cover" />
					{failed ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-4 text-center text-white">
							<p className="text-sm">This video can&apos;t play here.</p>
							<a
								href={href}
								target="_blank"
								rel="noreferrer noopener"
								className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black no-underline hover:bg-white/90"
							>
								Watch on X →
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
		</div>
	)
}
