import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		const { fill: _f, priority: _p, ...rest } = props
		// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
		return <img {...(rest as object)} />
	},
}))
vi.mock("@/lib/urlFor", () => ({
	fullImageUrl: (_s: unknown, w = 1600) => `https://cdn.test/full-${w}.png`,
	zoomImageUrl: () => "https://cdn.test/zoom.png",
	backdropImageUrl: () => "https://cdn.test/backdrop.png",
}))

import Figure from "@/components/post/Figure"

const ref = (w: number, h: number, extra: object = {}) => ({ asset: { _ref: `image-abc-${w}x${h}-png` }, ...extra })

describe("Figure", () => {
	it("renders a 4:5 graphic at 4:5 with a backdrop and a height cap, never cropped", () => {
		const html = renderToStaticMarkup(<Figure image={ref(1080, 1350)} alt="Graphic" variant="cover" />)
		expect(html).toContain('data-ratio="0.800"')
		expect(html).toContain("aspect-ratio:0.8")
		expect(html).toContain("min(100%, calc(80vh * 0.80000), 1080px)")
		expect(html).toContain("backdrop.png")
		expect(html).toContain("object-contain")
		expect(html).not.toContain("object-cover\"")
	})

	it("skips the backdrop for wide photos", () => {
		const html = renderToStaticMarkup(<Figure image={ref(1920, 1080)} alt="Photo" />)
		expect(html).toContain('data-ratio="1.778"')
		expect(html).not.toContain("backdrop.png")
	})

	it("uses the Studio crop", () => {
		const html = renderToStaticMarkup(<Figure image={ref(1000, 1000, { crop: { top: 0.25, bottom: 0.25, left: 0, right: 0 } })} />)
		expect(html).toContain('data-ratio="2.000"')
	})

	it("shows the caption and an enlarge control", () => {
		const html = renderToStaticMarkup(<Figure image={ref(800, 600)} alt="Alt" caption="A caption" />)
		expect(html).toContain("<figcaption")
		expect(html).toContain("A caption")
		expect(html).toContain('aria-label="Enlarge image: Alt"')
	})

	it("renders nothing without an image", () => {
		expect(renderToStaticMarkup(<Figure image={null} />)).toBe("")
		expect(renderToStaticMarkup(<Figure image={{}} />)).toBe("")
	})
})
