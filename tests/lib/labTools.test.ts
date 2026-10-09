import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { LAB_GROUPS, LAB_TOOLS, otherTools, toolBadges, toolsIn } from "@/lib/lab/tools"
import { labWeeks } from "@/lib/lab/toolsData"

const root = join(__dirname, "..", "..")
const labDir = join(root, "app", "(user)", "lab")

describe("the list of Lab tools", () => {
	it("has one entry per tool, each with its own id and address, a group that exists and words for every place it shows", () => {
		expect(new Set(LAB_TOOLS.map((t) => t.id)).size).toBe(LAB_TOOLS.length)
		expect(new Set(LAB_TOOLS.map((t) => t.href)).size).toBe(LAB_TOOLS.length)
		const groups = new Set(LAB_GROUPS.map((g) => g.id))
		for (const t of LAB_TOOLS) {
			expect(t.href, t.id).toMatch(/^\/lab\/[a-z-]+$/)
			expect(groups.has(t.group), t.id).toBe(true)
			expect(t.title.length, t.id).toBeGreaterThan(2)
			expect(t.short.length, t.id).toBeGreaterThan(10)
			expect(t.short.length, `${t.id}: short is one line`).toBeLessThan(90)
			expect(t.text.length, t.id).toBeGreaterThan(t.short.length)
		}
		for (const g of LAB_GROUPS) expect(toolsIn(g.id).length, g.id).toBeGreaterThan(0)
	})

	it("points at pages that exist, and covers every tool page the Lab has (so a new one cannot be forgotten)", () => {
		for (const t of LAB_TOOLS) expect(existsSync(join(labDir, t.href.replace("/lab/", ""), "page.tsx")), t.href).toBe(true)
		// Folders under /lab that are pages of their own but not tools: the game pages ([slug]) and a single matchup, which sits under /lab/matchups.
		const notTools = new Set(["[slug]", "matchup"])
		const folders = readdirSync(labDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !notTools.has(d.name)).map((d) => `/lab/${d.name}`)
		expect(folders.sort()).toEqual(LAB_TOOLS.map((t) => t.href).sort())
	})

	it("is in the sitemap", () => {
		const sitemap = readFileSync(join(root, "pages", "sitemap.xml.tsx"), "utf8")
		for (const t of LAB_TOOLS) expect(sitemap, t.href).toContain(t.href)
	})

	it("leaves out the page the reader is on, including a page under a tool", () => {
		expect(otherTools("/lab/matchups").map((t) => t.id)).not.toContain("matchups")
		expect(otherTools("/lab/matchups/KC-LV").map((t) => t.id)).not.toContain("matchups")
		expect(otherTools("/lab/matchups").length).toBe(LAB_TOOLS.length - 1)
		expect(otherTools("/lab/week-3").length).toBe(LAB_TOOLS.length)
		expect(otherTools(undefined).length).toBe(LAB_TOOLS.length)
		// A lookalike address is not the tool.
		expect(otherTools("/lab/matchups-old").length).toBe(LAB_TOOLS.length)
	})

	it("tags a tool with New and with the week it is showing, and leaves out a week it does not have", () => {
		const machine = LAB_TOOLS.find((t) => t.id === "playoff-machine")!
		const matchups = LAB_TOOLS.find((t) => t.id === "matchups")!
		const teams = LAB_TOOLS.find((t) => t.id === "teams")!
		const weeks = { slate: 6, results: 5 }
		expect(toolBadges(machine, weeks)).toEqual(["New", "Through week 5"])
		expect(toolBadges(matchups, weeks)).toEqual(["Week 6"])
		expect(toolBadges(teams, weeks)).toEqual([])
		expect(toolBadges(machine, { slate: null, results: null })).toEqual(["New"])
		expect(toolBadges(matchups, { slate: null, results: 5 })).toEqual([])
	})

	it("reads the weeks from the data in the repo", () => {
		const w = labWeeks()
		expect(Number.isInteger(w.results)).toBe(true)
		expect(w.results as number).toBeGreaterThan(0)
		if (w.slate !== null) expect(w.slate).toBeGreaterThan(0)
	})
})
