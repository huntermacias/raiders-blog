// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import UtmCapture from "../../components/UtmCapture"
import { humanCookieOk } from "../../lib/og/guard"

afterEach(() => {
	cleanup()
	document.cookie = "rr_h=; max-age=0; path=/"
})

describe("the cookie that lets a reader's comparison links skip the check", () => {
	it("is left by any page of the site, once a browser has run it, and is one the middleware accepts", () => {
		expect(document.cookie).not.toContain("rr_h=")
		render(<UtmCapture />)
		const m = document.cookie.match(/rr_h=(\d+)/)
		expect(m).toBeTruthy()
		expect(humanCookieOk(m![1])).toBe(true)
	})
})
