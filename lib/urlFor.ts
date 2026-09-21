import { client } from "./sanity.client"
import imageUrlBuilder from "@sanity/image-url"

// get a pre-config url-builder from sanity client
const builder = imageUrlBuilder(client)

function urlFor(source: any) {
	return builder.image(source)
}

export default urlFor

/**
 * Returns a CSS `object-position` string derived from an image's Sanity
 * hotspot (the focal point set in Studio, 0-1 fractional coordinates).
 *
 * This matters because `next/image`'s `fill` + `object-cover` pattern used
 * throughout this project renders the image into a fixed-size container
 * and lets the *browser* do the final crop -- completely ignoring the
 * server-side hotspot-aware crop from `cropped()` below whenever the
 * container's aspect ratio doesn't exactly match the requested crop size
 * (which, across responsive breakpoints, it basically never does). Without
 * this, the browser defaults to `object-position: 50% 50%` and re-crops
 * dead-center, undoing the hotspot and slicing through faces. Pass this as
 * the `style.objectPosition` on every `fill` image alongside `cropped()`.
 */
export function hotspotPosition(source: any): string {
	const hotspot = source?.hotspot
	if (!hotspot || typeof hotspot.x !== "number" || typeof hotspot.y !== "number") {
		return "50% 50%"
	}
	const x = Math.min(100, Math.max(0, hotspot.x * 100))
	const y = Math.min(100, Math.max(0, hotspot.y * 100))
	return `${x}% ${y}%`
}

/**
 * Preset crops for cards/hero spots.
 *
 * Source images here are copy-pasted from all over the web at wildly
 * inconsistent aspect ratios. Without these, next/image's `fill` +
 * object-cover blindly center-crops in the browser, which chops off
 * whatever isn't dead-center in the original photo.
 *
 * Requesting a fixed width/height with fit('crop') makes Sanity do the
 * cropping server-side instead - and critically, it uses each image's
 * "hotspot" (the focal point you can drag in Sanity Studio, on any image
 * field with `options: { hotspot: true }`, which this project's schemas
 * already have) to pick which part of the image to keep. Existing images
 * default to a centered hotspot until you go adjust them in Studio; new
 * uploads are worth setting a hotspot on right away.
 */
function cropped(source: any, width: number, height: number) {
	// A post or game report can exist in Studio before its image is set
	// (mid-draft, or a field left blank) -- fall back to a placeholder
	// instead of crashing the page.
	if (!source) return "/placeholder-card.jpg"
	try {
		return urlFor(source).width(width).height(height).fit("crop").auto("format").url()
	} catch {
		return "/placeholder-card.jpg"
	}
}

// Featured/hero card on the homepage - roughly 9:7, close to its rendered
// aspect at the desktop breakpoint where it's most visible.
export function featuredImageUrl(source: any) {
	return cropped(source, 900, 700)
}

// Standard grid card thumbnail. Less aggressively wide than before -- the
// object-position fix above (hotspotPosition) does the real work of
// keeping faces in frame, so this ratio just needs to be a reasonable
// starting point rather than an exact match for every container.
export function cardImageUrl(source: any) {
	return cropped(source, 800, 500)
}

// Small related-post thumbnail.
export function thumbImageUrl(source: any) {
	return cropped(source, 700, 420)
}

// Full-width article hero image.
export function heroImageUrl(source: any) {
	return cropped(source, 1600, 800)
}

// Inline body image, used inside article rich text (RichTextComponents).
//
// This used to force every author-dropped image into the same 16:9 crop,
// which was fixing pillarboxing (dark bars from object-contain inside a
// mismatched fixed-ratio box) by cropping instead -- trading "the whole
// image doesn't show" for "the frame is always the same shape". That's the
// wrong trade: readers noticed photos getting cut off far more than they'd
// ever notice one inline image being taller than the next. Now this just
// requests the image at a sensible max width with no forced height/crop,
// and RichTextComponents sizes each image's container to that specific
// image's real aspect ratio (see imageAspectRatio below) -- so the
// container always matches the photo exactly and nothing is cropped *or*
// letterboxed.
export function bodyImageUrl(source: any) {
	if (!source) return "/placeholder-card.jpg"
	try {
		return urlFor(source).width(1400).auto("format").url()
	} catch {
		return "/placeholder-card.jpg"
	}
}

/**
 * Reads an image's real width/height straight out of its Sanity asset
 * reference (e.g. "image-abc123-1600x900-jpg") so a caller can size a
 * container to the image's actual aspect ratio without a network round
 * trip. Falls back to a 16:9 guess if the ref is missing or unparseable
 * (e.g. a still-uploading asset, or a non-Sanity source).
 */
export function imageAspectRatio(source: any, fallback = 16 / 9): number {
	const ref: string | undefined = source?.asset?._ref
	if (!ref) return fallback
	const match = ref.match(/-(\d+)x(\d+)-/)
	if (!match) return fallback
	const width = parseInt(match[1], 10)
	const height = parseInt(match[2], 10)
	if (!width || !height) return fallback
	return width / height
}

// Open Graph / Twitter card image - the fixed 1200x630 ratio social
// platforms expect, so shared links preview correctly instead of getting
// auto-cropped by whatever the platform guesses.
export function ogImageUrl(source: any) {
	return cropped(source, 1200, 630)
}
