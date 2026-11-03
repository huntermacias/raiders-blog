import { describe, expect, it } from "vitest"

import { cappedWidth, imageBox } from "@/lib/imageBox"

const ref = (w: number, h: number) => ({ asset: { _ref: `image-abc123-${w}x${h}-png` } })

describe("imageBox", () => {
	it("reads the real shape from the asset reference", () => {
		const b = imageBox(ref(1080, 1350))
		expect(b).toMatchObject({ width: 1080, height: 1350, known: true })
		expect(b.ratio).toBeCloseTo(0.8)
	})

	it("shows 16:9 as 16:9", () => {
		expect(imageBox(ref(1920, 1080)).ratio).toBeCloseTo(16 / 9)
	})

	it("uses the Studio crop when one is set", () => {
		const b = imageBox({ ...ref(1000, 1000), crop: { left: 0, right: 0, top: 0.25, bottom: 0.25 } })
		expect(b.width).toBe(1000)
		expect(b.height).toBe(500)
		expect(b.ratio).toBeCloseTo(2)
	})

	it("ignores nonsense crop values", () => {
		const b = imageBox({ ...ref(800, 600), crop: { left: -1, right: "x", top: 5, bottom: NaN } })
		expect(b.width).toBe(800)
		expect(b.height).toBeGreaterThan(0)
	})

	it("falls back to a guess when the ref is missing or unreadable", () => {
		expect(imageBox(null)).toMatchObject({ known: false })
		expect(imageBox({ asset: { _ref: "image-abc-svg" } }, 4 / 3).ratio).toBeCloseTo(4 / 3)
		expect(imageBox({ asset: { _ref: "image-abc-0x0-png" } }).known).toBe(false)
	})
})

describe("cappedWidth", () => {
	it("caps by screen height and natural width", () => {
		expect(cappedWidth(imageBox(ref(1080, 1350)))).toBe("min(100%, calc(80vh * 0.80000), 1080px)")
	})
	it("does not claim a pixel width it does not know", () => {
		expect(cappedWidth(imageBox(null))).not.toContain("px)")
	})
})
