/** A share card shown as an image with links to open or save it. The card itself is drawn by /api/og. */
export default function CardFigure({ src, alt, filename, caption }: { src: string; alt: string; filename: string; caption?: string }) {
	return (
		<figure className="m-0">
			<a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-lab-line bg-lab-tint">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={src} alt={alt} width={1200} height={630} loading="lazy" decoding="async" className="block h-auto w-full" />
			</a>
			<figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-lab-muted">
				<span>{caption ?? "Share card"}</span>
				<span className="flex gap-4 font-semibold">
					<a href={src} target="_blank" rel="noopener noreferrer" className="text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						Open image
					</a>
					<a href={src} download={filename} className="text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						Save
					</a>
				</span>
			</figcaption>
		</figure>
	)
}
