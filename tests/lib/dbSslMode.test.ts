import { describe, expect, it } from "vitest"

import { normalizeSslMode } from "../../lib/league2/db"

describe("normalizeSslMode", () => {
	it.each(["prefer", "require", "verify-ca", "REQUIRE"])("spells %s out as verify-full (what pg 8 already does)", (mode) => {
		expect(normalizeSslMode(`postgres://u:p@host/db?sslmode=${mode}`)).toBe("postgres://u:p@host/db?sslmode=verify-full")
	})

	it("keeps other parameters, before and after", () => {
		expect(normalizeSslMode("postgres://u:p@host/db?connect_timeout=5&sslmode=require&channel_binding=require")).toBe(
			"postgres://u:p@host/db?connect_timeout=5&sslmode=verify-full&channel_binding=require"
		)
	})

	it("leaves verify-full, disable and urls with no sslmode alone", () => {
		for (const u of ["postgres://h/db?sslmode=verify-full", "postgres://h/db?sslmode=disable", "postgres://localhost/db", "postgres://h/db?sslmode=allow"]) {
			expect(normalizeSslMode(u)).toBe(u)
		}
	})
})
