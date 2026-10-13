import {
	bigAvatar,
	formatCount,
	formatTweetTime,
	mediaUrl,
	pickMp4,
	tweetSegments,
	tweetUrl,
	type Tweet,
	type TweetMedia,
} from "@/lib/xTweet"

// A post from X drawn in the site's own style: it follows the reader's light or
// dark theme with no script, keeps its shape while loading, and the text is real
// page text. Pure render of already-fetched data (see Embed.tsx).

function XMark({ className = "h-4 w-4" }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	)
}

function Verified() {
	return (
		<svg viewBox="0 0 22 22" aria-label="Verified account" role="img" className="h-[17px] w-[17px] shrink-0 text-sky-500">
			<path
				fill="currentColor"
				d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
			/>
		</svg>
	)
}

function Heart() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px] text-rose-500" fill="currentColor">
			<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
		</svg>
	)
}

function Bubble() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
			<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z" />
		</svg>
	)
}

function Segments({ tweet }: { tweet: Parameters<typeof tweetSegments>[0] }) {
	return (
		<>
			{tweetSegments(tweet).map((s, i) =>
				s.kind === "link" ? (
					<a
						key={i}
						href={s.href}
						target="_blank"
						rel="noreferrer noopener"
						className="text-sky-600 no-underline hover:underline dark:text-sky-400"
					>
						{s.text}
					</a>
				) : (
					<span key={i}>{s.text}</span>
				),
			)}
		</>
	)
}

function Avatar({ src, size }: { src: string; size: number }) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={bigAvatar(src)}
			alt=""
			width={size}
			height={size}
			loading="lazy"
			decoding="async"
			className="shrink-0 rounded-full bg-muted ring-1 ring-border"
			style={{ width: size, height: size }}
		/>
	)
}

function Media({ items, handle }: { items: TweetMedia[]; handle: string }) {
	if (!items.length) return null
	const first = items[0]
	const frame = "overflow-hidden rounded-xl border border-border bg-muted"

	if (first.type !== "photo") {
		const src = pickMp4(first)
		const w = first.original_info?.width ?? 16
		const h = first.original_info?.height ?? 9
		const poster = mediaUrl(first, "large")
		if (!src) {
			// eslint-disable-next-line @next/next/no-img-element
			return <img src={poster} alt={`Video from @${handle}`} className={`${frame} mt-3 w-full`} loading="lazy" />
		}
		const gif = first.type === "animated_gif"
		return (
			<div className={`${frame} mt-3`} style={{ aspectRatio: `${w} / ${h}`, maxHeight: 520 }}>
				<video
					className="h-full w-full object-contain"
					src={src}
					poster={poster}
					controls={!gif}
					autoPlay={gif}
					loop={gif}
					muted={gif}
					playsInline
					preload={gif ? "auto" : "none"}
				/>
			</div>
		)
	}

	const photos = items.filter((m) => m.type === "photo").slice(0, 4)
	if (photos.length === 1) {
		const w = photos[0].original_info?.width ?? 1200
		const h = photos[0].original_info?.height ?? 675
		return (
			<div className={`${frame} mt-3`}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={mediaUrl(photos[0])}
					alt={`Photo from @${handle}'s post`}
					width={w}
					height={h}
					loading="lazy"
					decoding="async"
					className="block h-auto max-h-[520px] w-full object-cover"
				/>
			</div>
		)
	}
	return (
		<div className={`${frame} mt-3 grid grid-cols-2 gap-0.5`}>
			{photos.map((p, i) => (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					key={i}
					src={mediaUrl(p, "medium")}
					alt={`Photo ${i + 1} from @${handle}'s post`}
					loading="lazy"
					decoding="async"
					className={`h-full w-full object-cover ${photos.length === 3 && i === 0 ? "row-span-2" : "aspect-[4/3]"}`}
				/>
			))}
		</div>
	)
}

export default function TweetCard({ tweet, caption }: { tweet: Tweet; caption?: string }) {
	const { time, date } = formatTweetTime(tweet.created_at)
	const href = tweetUrl(tweet)
	const q = tweet.quoted_tweet
	const user = tweet.user

	return (
		<figure className="not-prose mx-auto my-10 w-full max-w-[560px]" data-testid="tweet-card">
			<article className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_32px_-18px_rgba(0,0,0,0.35)] transition-colors hover:border-foreground/25">
				<div aria-hidden="true" className="h-[3px] bg-gradient-to-r from-foreground/70 via-foreground/20 to-transparent" />
				<div className="p-4 sm:p-5">
					<header className="flex items-center gap-3">
						<a href={`https://x.com/${user.screen_name}`} target="_blank" rel="noreferrer noopener" className="shrink-0">
							<Avatar src={user.profile_image_url_https} size={44} />
						</a>
						<div className="min-w-0 flex-1 leading-tight">
							<a
								href={`https://x.com/${user.screen_name}`}
								target="_blank"
								rel="noreferrer noopener"
								className="flex items-center gap-1 text-[15px] font-bold text-foreground no-underline hover:underline"
							>
								<span className="truncate">{user.name}</span>
								{(user.is_blue_verified || user.verified) && <Verified />}
							</a>
							<span className="block truncate text-[14px] text-muted-foreground">@{user.screen_name}</span>
						</div>
						<a
							href={href}
							target="_blank"
							rel="noreferrer noopener"
							aria-label="Open this post on X"
							className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<XMark className="h-[18px] w-[18px]" />
						</a>
					</header>

					<p className="mt-3 whitespace-pre-wrap break-words text-[16.5px] leading-[1.55] text-foreground">
						<Segments tweet={tweet} />
					</p>

					<Media items={tweet.mediaDetails ?? []} handle={user.screen_name} />

					{q && (
						<a
							href={tweetUrl(q)}
							target="_blank"
							rel="noreferrer noopener"
							className="mt-3 block rounded-xl border border-border bg-muted/40 p-3 no-underline transition-colors hover:bg-muted/70"
						>
							<span className="flex items-center gap-2">
								<Avatar src={q.user.profile_image_url_https} size={20} />
								<span className="truncate text-[14px] font-bold text-foreground">{q.user.name}</span>
								<span className="truncate text-[13px] text-muted-foreground">@{q.user.screen_name}</span>
							</span>
							<span className="mt-1.5 line-clamp-6 block whitespace-pre-wrap break-words text-[15px] leading-snug text-foreground/90">
								{tweetSegments(q)
									.map((s) => s.text)
									.join("")}
							</span>
							{!!q.mediaDetails?.length && (
								<span className="mt-2 block overflow-hidden rounded-lg border border-border">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={mediaUrl(q.mediaDetails[0], "medium")}
										alt=""
										loading="lazy"
										className="block max-h-56 w-full object-cover"
									/>
								</span>
							)}
						</a>
					)}

					<div className="mt-4 text-[13.5px] text-muted-foreground">
						<a href={href} target="_blank" rel="noreferrer noopener" className="text-muted-foreground no-underline hover:underline">
							{time}
							{time && date ? " · " : ""}
							{date}
						</a>
					</div>
				</div>

				<footer className="flex items-center gap-5 border-t border-border bg-muted/30 px-4 py-2.5 text-[13.5px] text-muted-foreground sm:px-5">
					<span className="inline-flex items-center gap-1.5" title="Likes">
						<Heart />
						<span className="font-semibold tabular-nums text-foreground">{formatCount(tweet.favorite_count)}</span>
					</span>
					{!!tweet.conversation_count && (
						<span className="inline-flex items-center gap-1.5" title="Replies">
							<Bubble />
							<span className="font-semibold tabular-nums text-foreground">{formatCount(tweet.conversation_count)}</span>
						</span>
					)}
					<a
						href={href}
						target="_blank"
						rel="noreferrer noopener"
						className="ml-auto inline-flex items-center gap-1.5 font-semibold text-foreground no-underline hover:underline"
					>
						View on <XMark className="h-3 w-3" /> <span aria-hidden="true">→</span>
					</a>
				</footer>
			</article>
			{caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
		</figure>
	)
}
