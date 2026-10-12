// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import SectionHead from "@/components/lab/players/SectionHead"
import { keyOf } from "@/components/lab/players/SectionIcon"

describe("<SectionHead />", () => {
	it("is the heading its section is labelled by, with its place in the page and a blurb", () => {
		render(<SectionHead id="stack-h" icon="stack" step={{ n: 3, of: 12 }} title="How he stacks up" blurb={<>Every stat at a glance.</>} />)
		const h = screen.getByRole("heading", { level: 2, name: "How he stacks up" })
		expect(h.getAttribute("id")).toBe("stack-h")
		const head = screen.getByTestId("section-head")
		expect(head.textContent).toMatch(/03\s*\/\s*12/)
		expect(head.textContent).toMatch(/Every stat at a glance/)
		expect(head.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThan(0)
	})

	it("works without a step or blurb", () => {
		render(<SectionHead id="x" icon="read" title="The read" />)
		expect(screen.getByRole("heading", { name: "The read" })).toBeTruthy()
	})

	it("picks an icon from a nav id, falling back to a safe one", () => {
		expect(keyOf("money-qb")).toBe("money")
		expect(keyOf("situations-edge")).toBe("situations")
		expect(keyOf("nonsense-x")).toBe("read")
	})
})
