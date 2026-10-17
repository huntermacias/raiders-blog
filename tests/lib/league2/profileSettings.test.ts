import { describe, expect, it } from "vitest"

import { parseSettings } from "../../../lib/league2/services/profileSettings"

describe("profile settings", () => {
	it("accepts a real team or none, and two switches", () => {
		expect(parseSettings({ favoriteTeam: "LV", showProfile: true, showHistory: true })).toEqual({ ok: true, value: { favoriteTeam: "LV", showProfile: true, showHistory: true } })
		expect(parseSettings({ favoriteTeam: "", showProfile: true, showHistory: false })).toEqual({ ok: true, value: { favoriteTeam: null, showProfile: true, showHistory: false } })
		expect(parseSettings({ showProfile: true, showHistory: true })).toMatchObject({ ok: true, value: { favoriteTeam: null } })
	})
	it("hiding the profile hides the history too", () => {
		expect(parseSettings({ favoriteTeam: null, showProfile: false, showHistory: true })).toEqual({ ok: true, value: { favoriteTeam: null, showProfile: false, showHistory: false } })
	})
	it("refuses a made-up team, and anything that is not a real on/off value", () => {
		expect(parseSettings({ favoriteTeam: "XXX", showProfile: true, showHistory: true })).toMatchObject({ ok: false })
		expect(parseSettings({ favoriteTeam: { a: 1 }, showProfile: true, showHistory: true })).toMatchObject({ ok: false })
		expect(parseSettings({ favoriteTeam: "LV", showProfile: "yes", showHistory: true })).toMatchObject({ ok: false })
		expect(parseSettings({ favoriteTeam: "LV", showProfile: true })).toMatchObject({ ok: false })
	})
})
