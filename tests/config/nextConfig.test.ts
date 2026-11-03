// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const load = (): any => {
	const path = require.resolve("../../next.config.js")
	delete require.cache[path]
	return require(path)
}

const saved = { env: process.env.VERCEL_ENV, allow: process.env.ALLOW_VERCEL_HOST }
afterEach(() => {
	if (saved.env === undefined) delete process.env.VERCEL_ENV
	else process.env.VERCEL_ENV = saved.env
	if (saved.allow === undefined) delete process.env.ALLOW_VERCEL_HOST
	else process.env.ALLOW_VERCEL_HOST = saved.allow
})

describe("next.config.js: images", () => {
	const images = load().images

	it("only optimizes this project's own Sanity images, never SVG", () => {
		expect(images.domains).toBeUndefined()
		expect(images.remotePatterns).toEqual([{ protocol: "https", hostname: "cdn.sanity.io", pathname: "/images/27bpkxp4/production/**" }])
		expect(images.dangerouslyAllowSVG).toBe(false)
	})

	it("keeps the number of billed variants small and caches them for a year", () => {
		expect(images.formats).toEqual(["image/webp"])
		expect(images.qualities).toEqual([75])
		expect(images.deviceSizes.length + images.imageSizes.length).toBeLessThanOrEqual(10)
		expect(images.minimumCacheTTL).toBeGreaterThanOrEqual(31536000)
	})
})

describe("next.config.js: headers and redirects", () => {
	it("sends the plain hardening headers on every path", async () => {
		const h = await load().headers()
		const all = h.find((x: any) => x.source === "/:path*" && !x.has)
		const keys = all.headers.map((x: any) => x.key)
		expect(keys).toEqual(expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]))
	})

	it("marks every *.vercel.app address noindex", async () => {
		const h = await load().headers()
		const v = h.find((x: any) => x.has?.[0]?.type === "host")
		expect(new RegExp(`^${v.has[0].value}$`).test("raiderrundown-h0zddfd2a-hunter.vercel.app")).toBe(true)
		expect(new RegExp(`^${v.has[0].value}$`).test("www.raidersrundown.com")).toBe(false)
		expect(v.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }])
	})

	it("sends production *.vercel.app addresses to the real domain, and leaves previews and local builds alone", async () => {
		delete process.env.ALLOW_VERCEL_HOST
		process.env.VERCEL_ENV = "production"
		const prod = (await load().redirects()).find((r: any) => r.has?.[0]?.type === "host")
		expect(prod.destination).toBe("https://www.raidersrundown.com/:path*")
		expect(prod.permanent).toBe(false)

		process.env.VERCEL_ENV = "preview"
		expect((await load().redirects()).some((r: any) => r.has?.[0]?.type === "host")).toBe(false)
		delete process.env.VERCEL_ENV
		expect((await load().redirects()).some((r: any) => r.has?.[0]?.type === "host")).toBe(false)
	})

	it("has an escape hatch for looking at a production deployment's own address", async () => {
		process.env.VERCEL_ENV = "production"
		process.env.ALLOW_VERCEL_HOST = "1"
		expect((await load().redirects()).some((r: any) => r.has?.[0]?.type === "host")).toBe(false)
	})

	it("keeps the old power-rankings redirect", async () => {
		const r = await load().redirects()
		expect(r.some((x: any) => x.destination === "/post/week-3-power-rankings")).toBe(true)
	})
})
