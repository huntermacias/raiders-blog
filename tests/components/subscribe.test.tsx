// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import SubscribeBox from "../../components/SubscribeBox"
import SubscribeForm from "../../components/SubscribeForm"

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

function fill(email: string) {
	fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } })
}

describe("<SubscribeForm />", () => {
	it("keeps the button disabled until there is an email", () => {
		render(<SubscribeForm source="home" />)
		const btn = screen.getByRole("button", { name: "Get the Sunday picks" }) as HTMLButtonElement
		expect(btn.disabled).toBe(true)
		fill("a@b.co")
		expect(btn.disabled).toBe(false)
	})

	it("posts the email, the honeypot and the source", async () => {
		const f = reply(200, { ok: true })
		vi.stubGlobal("fetch", f)
		render(<SubscribeForm source="post-footer" />)
		fill("fan@example.com")
		fireEvent.click(screen.getByRole("button", { name: "Get the Sunday picks" }))
		await screen.findByRole("status")
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe("/api/subscribe")
		expect(JSON.parse(init.body as string)).toEqual({ email: "fan@example.com", website: "", source: "post-footer" })
		expect(screen.getByRole("status").textContent).toMatch(/You're in/)
		expect(screen.queryByRole("button")).toBeNull()
	})

	it("shows the server's message on a rejection", async () => {
		vi.stubGlobal("fetch", reply(400, { message: "That email doesn't look right." }))
		render(<SubscribeForm source="home" />)
		fill("nope")
		fireEvent.click(screen.getByRole("button", { name: "Get the Sunday picks" }))
		await waitFor(() => expect(screen.getByText("That email doesn't look right.")).toBeTruthy())
	})

	it("falls back to a generic message when the error has none", async () => {
		vi.stubGlobal("fetch", reply(500, {}))
		render(<SubscribeForm source="home" />)
		fill("a@b.co")
		fireEvent.click(screen.getByRole("button", { name: "Get the Sunday picks" }))
		await screen.findByText(/Couldn't sign you up/)
	})

	it("explains a network failure and lets people retry", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
		render(<SubscribeForm source="home" />)
		fill("a@b.co")
		fireEvent.click(screen.getByRole("button", { name: "Get the Sunday picks" }))
		await screen.findByText(/Check your connection/)
		expect((screen.getByRole("button", { name: "Get the Sunday picks" }) as HTMLButtonElement).disabled).toBe(false)
	})

	it("hides the honeypot from assistive tech and keyboard users", () => {
		const { container } = render(<SubscribeForm source="home" />)
		const trap = container.querySelector('input[name="website"]') as HTMLInputElement
		expect(trap.tabIndex).toBe(-1)
		expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
	})

	it("gives each placement its own input id", () => {
		const { container } = render(<SubscribeForm source="band" />)
		expect(container.querySelector("#sub-band")).not.toBeNull()
	})
})

describe("<SubscribeBox />", () => {
	it("renders nothing when email isn't configured, so no page shows a dead form", () => {
		vi.stubEnv("BUTTONDOWN_API_KEY", "")
		const { container } = render(<SubscribeBox source="home" />)
		expect(container.innerHTML).toBe("")
	})

	it("renders the card with a form when configured", () => {
		vi.stubEnv("BUTTONDOWN_API_KEY", "k")
		render(<SubscribeBox source="post" />)
		expect(screen.getByRole("complementary", { name: "Email signup" })).toBeTruthy()
		expect(screen.getByLabelText("Email address")).toBeTruthy()
	})

	it("renders the dark band variant on the homepage", () => {
		vi.stubEnv("BUTTONDOWN_API_KEY", "k")
		const { container } = render(<SubscribeBox source="home" variant="band" />)
		expect(screen.getByRole("region", { name: "Email signup" })).toBeTruthy()
		expect(container.querySelector(".dark")).not.toBeNull()
		expect(screen.getByLabelText("Email address")).toBeTruthy()
	})
})
