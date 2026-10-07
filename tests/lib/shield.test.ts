import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { RAIDERS_LOGO, hasRaidersLogo, raidersLogo } from "../../lib/lab/shield"

describe("the Raiders shield", () => {
	it("is only used when the file is in /public", () => {
		const root = mkdtempSync(join(tmpdir(), "shield-"))
		expect(hasRaidersLogo(root)).toBe(false)
		mkdirSync(join(root, "public"))
		writeFileSync(join(root, "public", "raiders-shield.png"), "x")
		expect(hasRaidersLogo(root)).toBe(true)
	})

	it("matches what is in this repo's /public", () => {
		expect(raidersLogo).toBe(existsSync(join(process.cwd(), "public", "raiders-shield.png")) ? RAIDERS_LOGO : null)
	})
})
