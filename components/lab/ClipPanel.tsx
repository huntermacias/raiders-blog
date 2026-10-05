import { CLIP_LABELS, type ClipKind, type GameClip, sizeText } from "@/lib/lab/clips"

const ORDER: (ClipKind | "gif")[] = ["landscape", "vertical", "square", "gif"]

/** The week's win-probability clip, with the other sizes to save. Everything is a plain file link. */
export default function ClipPanel({ clip, title }: { clip: GameClip; title: string }) {
	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
			<video className="block h-auto w-full rounded-xl border border-lab-line bg-lab-surface" controls playsInline preload="none" poster={clip.files.poster} aria-label={`${title}: the win probability story, ${Math.round(clip.seconds)} seconds`}>
				<source src={clip.files.landscape} type="video/mp4" />
				Your browser can&rsquo;t play this video. Use one of the download links.
			</video>
			<div>
				<h3 className="m-0 font-serif text-lg font-bold">Save it for your post</h3>
				<ul className="m-0 mt-3 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
					{ORDER.map((k) => {
						const l = CLIP_LABELS[k]
						const href = clip.files[k]
						if (!href) return null
						return (
							<li key={k}>
								<a href={href} download className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm hover:bg-lab-hover">
									<span>
										<span className="font-semibold">
											{l.name} <span className="font-normal text-lab-muted">{l.ratio}</span>
										</span>
										<span className="block text-xs text-lab-muted">{l.use}</span>
									</span>
									<span className="shrink-0 font-mono text-xs tabular-nums text-lab-muted">{sizeText(clip.bytes[k])}</span>
								</a>
							</li>
						)
					})}
				</ul>
				<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">Free to share. Please keep the credit line in the video.</p>
			</div>
		</div>
	)
}
