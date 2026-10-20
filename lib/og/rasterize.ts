import { Resvg } from "@resvg/resvg-js"

import { simplifyMasks } from "./simplifySvg"

/** satori's SVG as a PNG `width` pixels wide. Text arrives as paths, so no system fonts are loaded (resvg otherwise scans the machine's fonts on
 * every render), and the clipping masks that change nothing are dropped first (see simplifySvg.ts): the same pixels in about a quarter of the time. */
export function rasterize(svg: string, width: number): Buffer {
	return new Resvg(simplifyMasks(svg), { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng()
}
