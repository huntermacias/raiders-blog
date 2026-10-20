// Satori wraps every element that clips its contents (overflow: hidden, a bar that is cut to its width, a rounded photo) in an SVG mask, and it
// nests them: each mask carries the mask of the element above it. resvg draws a mask as a full-size offscreen layer, so a card with a hundred of
// them spends most of its render time compositing layers that change nothing. On the player card 97 masks took 470 ms of a 475 ms render.
//
// Two kinds are provably no-ops and are dropped here without changing a pixel:
//   - a mask whose rectangle, intersected with every mask above it, covers the whole canvas: it shows everything, so the reference goes;
//   - a mask whose intersected rectangle is empty (a bar at zero width): it shows nothing, so the element is switched off with display="none".
// Anything that does clip stays exactly as satori wrote it. If the SVG is not in the shape this expects, it is returned untouched.

const MASK = /<mask id="([^"]+)">\s*<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)" fill="#fff"(?: mask="url\(#([^)]+)\)")?\s*\/>\s*<\/mask>/g
const SIZE = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Def = { x: number; y: number; w: number; h: number; parent: string | null }

export function simplifyMasks(svg: string): string {
	if (!svg.includes("<mask")) return svg
	const size = SIZE.exec(svg)
	if (!size) return svg
	const width = Number(size[1])
	const height = Number(size[2])

	const defs = new Map<string, Def>()
	Array.from(svg.matchAll(MASK)).forEach((m) => defs.set(m[1], { x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]), parent: m[6] ?? null }))
	if (defs.size === 0) return svg

	// A mask that is not the plain "white rectangle" shape (a gradient mask, say) is not in `defs`, so it is never touched.
	const effective = (id: string): Rect | null => {
		let r: Rect | null = null
		const seen = new Set<string>()
		for (let cur: string | null = id; cur; ) {
			if (seen.has(cur)) return null
			seen.add(cur)
			const d = defs.get(cur)
			if (!d) return null
			const next: Rect = { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h }
			r = r ? { x0: Math.max(r.x0, next.x0), y0: Math.max(r.y0, next.y0), x1: Math.min(r.x1, next.x1), y1: Math.min(r.y1, next.y1) } : next
			cur = d.parent
		}
		return r
	}

	const dead: string[] = []
	const identity: string[] = []
	const ids = Array.from(defs.keys())
	for (const id of ids) {
		const r = effective(id)
		if (!r) continue
		if (r.x1 <= r.x0 || r.y1 <= r.y0) dead.push(id)
		else if (r.x0 <= 0 && r.y0 <= 0 && r.x1 >= width && r.y1 >= height) identity.push(id)
	}
	if (dead.length === 0 && identity.length === 0) return svg

	let out = svg
	// display="none" is only safe to add when the SVG does not already use the attribute.
	const canHide = !/\sdisplay="/.test(svg)
	for (const id of dead) {
		if (!canHide) continue
		out = out.split(` mask="url(#${id})"`).join(` display="none"`)
	}
	for (const id of identity) out = out.split(` mask="url(#${id})"`).join("")

	// Definitions nothing points at any more only cost parse time.
	for (const id of ids) {
		if (out.includes(`url(#${id})`)) continue
		out = out.replace(new RegExp(`<mask id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">[\\s\\S]*?</mask>`), "")
	}
	return out
}
