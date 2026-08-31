import { client } from "./sanity.client"
import imageUrlBuilder from "@sanity/image-url"

// get a pre-config url-builder from sanity client
const builder = imageUrlBuilder(client)

function urlFor(source: any) {
	return builder.image(source)
}

export default urlFor

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

// Standard grid card thumbnail - wide, ~16:9-ish.
export function cardImageUrl(source: any) {
	return cropped(source, 800, 440)
}

// Small related-post thumbnail - wider still.
export function thumbImageUrl(source: any) {
	return cropped(source, 800, 360)
}

// Full-width article hero image.
export function heroImageUrl(source: any) {
	return cropped(source, 1600, 700)
}

// Open Graph / Twitter card image - the fixed 1200x630 ratio social
// platforms expect, so shared links preview correctly instead of getting
// auto-cropped by whatever the platform guesses.
export function ogImageUrl(source: any) {
	return cropped(source, 1200, 630)
}
