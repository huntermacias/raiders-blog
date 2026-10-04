import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const layout = readFileSync(resolve(root, "app/(user)/layout.tsx"), "utf8")

// Google builds the search-result favicon from the <link rel="icon"> in the
// page head. If that points at someone else's host (it once pointed at imgur),
// updating public/favicon.ico changes nothing in search.
describe("site icons", () => {
	it("the layout's icons are self-hosted, not third-party URLs", () => {
		const block = layout.slice(layout.indexOf("icons: {"), layout.indexOf("robots:"))
		expect(block).toContain("/favicon.ico")
		expect(block).not.toMatch(/https?:\/\//)
	})

	it.each(["favicon.ico", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "og-default-v2.png"])("public/%s exists", (file) => {
		expect(existsSync(resolve(root, "public", file))).toBe(true)
	})

	it("every icon path the layout names exists in public/", () => {
		const block = layout.slice(layout.indexOf("icons: {"), layout.indexOf("robots:"))
		const paths = Array.from(block.matchAll(/'(\/[^']+\.(?:ico|png))'/g)).map((m) => m[1])
		expect(paths.length).toBeGreaterThanOrEqual(3)
		for (const p of paths) expect(existsSync(resolve(root, "public", p.slice(1)))).toBe(true)
	})

	it("favicon.ico is a real small .ico (Google wants a square icon in multiples of 48px)", () => {
		const f = resolve(root, "public/favicon.ico")
		const head = readFileSync(f).subarray(0, 4)
		expect(Array.from(head)).toEqual([0, 0, 1, 0]) // ICO header, not a renamed PNG
		expect(statSync(f).size).toBeLessThan(100_000)
	})

	it("PNG icons are square at their stated size", () => {
		const dims = (file: string) => {
			const b = readFileSync(resolve(root, "public", file))
			return [b.readUInt32BE(16), b.readUInt32BE(20)]
		}
		expect(dims("icon-192.png")).toEqual([192, 192])
		expect(dims("icon-512.png")).toEqual([512, 512])
		expect(dims("apple-touch-icon.png")).toEqual([180, 180])
	})

	it("the default share image is 1.91:1-ish and under 8MB (X/Facebook limits)", () => {
		const f = resolve(root, "public/og-default-v2.png")
		const b = readFileSync(f)
		const ratio = b.readUInt32BE(16) / b.readUInt32BE(20)
		expect(ratio).toBeGreaterThan(1.8)
		expect(ratio).toBeLessThan(2)
		expect(statSync(f).size).toBeLessThan(8 * 1024 * 1024)
	})

	it("lets Google show large image previews", () => {
		expect(layout).toContain("'max-image-preview': 'large'")
	})
})
