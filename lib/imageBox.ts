/**
 * The real shape of a Sanity image, read straight from its asset reference
 * ("image-<id>-<width>x<height>-<ext>") -- no network round trip.
 *
 * If an editor set a crop in Studio, the CDN returns the cropped rectangle,
 * so the shape reported here is the cropped one. The page therefore draws
 * exactly what the editor chose; with no crop it draws the whole image.
 *
 * This file is deliberately free of the Sanity client so it can be tested
 * and imported anywhere.
 */

export type ImageBox = {
	/** Pixel width of what the CDN will return (crop applied). */
	width: number
	/** Pixel height of what the CDN will return (crop applied). */
	height: number
	/** width / height. */
	ratio: number
	/** False when the ref could not be read and `ratio` is only a guess. */
	known: boolean
}

const clamp = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.min(0.9, Math.max(0, n)) : 0)

export function imageBox(source: any, fallbackRatio = 16 / 9): ImageBox {
	const guess: ImageBox = {
		width: Math.round(fallbackRatio * 1000),
		height: 1000,
		ratio: fallbackRatio,
		known: false,
	}
	const ref: unknown = source?.asset?._ref
	if (typeof ref !== "string") return guess
	const match = ref.match(/-(\d+)x(\d+)-/)
	if (!match) return guess
	const fullW = parseInt(match[1], 10)
	const fullH = parseInt(match[2], 10)
	if (!fullW || !fullH) return guess

	const crop = source?.crop
	const left = clamp(crop?.left)
	const right = clamp(crop?.right)
	const top = clamp(crop?.top)
	const bottom = clamp(crop?.bottom)
	const width = Math.max(1, Math.round(fullW * (1 - left - right)))
	const height = Math.max(1, Math.round(fullH * (1 - top - bottom)))
	return { width, height, ratio: width / height, known: true }
}

/**
 * CSS width for an image that keeps its own shape, never grows taller than
 * `maxVh` of the screen, and never stretches past its natural pixel width.
 */
export function cappedWidth(box: ImageBox, maxVh = 80): string {
	const byHeight = `calc(${maxVh}vh * ${box.ratio.toFixed(5)})`
	return box.known ? `min(100%, ${byHeight}, ${box.width}px)` : `min(100%, ${byHeight})`
}
