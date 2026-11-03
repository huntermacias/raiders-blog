import Image from "next/image"

import { cappedWidth, imageBox } from "@/lib/imageBox"
import { backdropImageUrl, fullImageUrl, zoomImageUrl } from "@/lib/urlFor"
import Zoomable from "./Zoomable"

type Props = {
	/** A Sanity image object: asset ref, plus crop and hotspot if the editor set them. */
	image: unknown
	alt?: string | null
	caption?: string | null
	/** "cover" is the picture at the top of a post; "body" is one inside the text. */
	variant?: "cover" | "body"
	priority?: boolean
	sizes?: string
	className?: string
}

/**
 * A picture shown at its own shape. Nothing is trimmed: a 4:5 graphic is 4:5, a 16:9 photo is 16:9, and the Studio crop is used when the
 * editor set one. It is never taller than 80% of the screen and is centered; where it is narrower than the column, a blurred, darkened copy
 * of the same picture fills the sides. Click or tap to see it large.
 *
 * Everything inside the zoom button is a span so the markup stays valid.
 */
export default function Figure({ image, alt, caption, variant = "body", priority = false, sizes, className = "" }: Props) {
	if (!image || !(image as { asset?: unknown }).asset) return null
	const box = imageBox(image)
	const text = (alt ?? "").trim()
	const note = (caption ?? "").trim()
	// Only pictures that are not very wide can leave empty space beside them.
	const backdrop = box.ratio < 1.6 ? backdropImageUrl(image) : ""
	const cover = variant === "cover"
	const imgSizes = sizes ?? (cover ? "(min-width: 1280px) 1152px, 100vw" : "(min-width: 1024px) 720px, 100vw")

	return (
		<figure className={`not-prose ${cover ? "" : "my-8 sm:my-10"} ${className}`} data-figure={variant} data-ratio={box.ratio.toFixed(3)}>
			<span className={`relative isolate block overflow-hidden bg-neutral-950 ring-1 ring-black/10 dark:ring-white/10 ${cover ? "rounded-2xl shadow-xl" : "rounded-xl"}`}>
				{backdrop && (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={backdrop}
						alt=""
						aria-hidden
						decoding="async"
						className="absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-90 blur-2xl brightness-[0.45] saturate-125"
					/>
				)}
				<Zoomable zoomSrc={zoomImageUrl(image)} alt={text} caption={note}>
					<span className="mx-auto block" style={{ width: cappedWidth(box) }}>
						<span className="relative block w-full" style={{ aspectRatio: box.ratio }}>
							<Image
								src={fullImageUrl(image, cover ? 1800 : 1400)}
								alt={text}
								fill
								priority={priority}
								sizes={imgSizes}
								className="object-contain"
							/>
						</span>
					</span>
				</Zoomable>
			</span>
			{note && <figcaption className="mx-auto mt-3 max-w-3xl px-1 text-center text-sm leading-snug text-muted-foreground">{note}</figcaption>}
		</figure>
	)
}
