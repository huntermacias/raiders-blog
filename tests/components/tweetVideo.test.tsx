// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import TweetVideo from "../../components/embeds/TweetVideo"

afterEach(cleanup)

const props = {
	sources: ["https://video.twimg.com/mid.mp4", "https://video.twimg.com/hi.mp4"],
	poster: "https://pbs.twimg.com/p.jpg",
	tweetId: "1234567890123456789",
	href: "https://x.com/a/status/1234567890123456789",
	width: 1280,
	height: 720,
}

// The sandboxed frame tells the page when its video can't load.
const frameFails = (container: HTMLElement) => {
	const frame = container.querySelector("iframe")!
	act(() => {
		window.dispatchEvent(new MessageEvent("message", { data: { xv: "error" }, source: frame.contentWindow }))
	})
}

describe("<TweetVideo />", () => {
	it("loads no video until play is pressed, then plays it in a frame that sends no page address", () => {
		const { container } = render(<TweetVideo {...props} />)
		expect(container.querySelector("iframe")).toBeNull()
		fireEvent.click(screen.getByLabelText("Play video"))
		const frame = container.querySelector("iframe")!
		expect(frame.getAttribute("srcdoc")).toContain("https://video.twimg.com/mid.mp4")
		expect(frame.getAttribute("srcdoc")).toContain('name="referrer" content="no-referrer"')
		expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
	})

	it("tries the next quality when one is refused", () => {
		const { container } = render(<TweetVideo {...props} />)
		fireEvent.click(screen.getByLabelText("Play video"))
		frameFails(container)
		expect(container.querySelector("iframe")!.getAttribute("srcdoc")).toContain("hi.mp4")
	})

	it("opens X's own player over the page when every quality is refused, and closes it again", () => {
		const { container } = render(<TweetVideo {...props} />)
		fireEvent.click(screen.getByLabelText("Play video"))
		frameFails(container)
		frameFails(container)
		const dialog = screen.getByRole("dialog")
		expect(dialog.querySelector("iframe")!.getAttribute("src")).toContain("platform.twitter.com/embed/Tweet.html?id=1234567890123456789")
		fireEvent.keyDown(window, { key: "Escape" })
		expect(screen.queryByRole("dialog")).toBeNull()
		// still on the page, with a way to play it again that does not leave the site
		fireEvent.click(screen.getByText("Play video"))
		expect(screen.getByRole("dialog")).toBeTruthy()
		expect(screen.getByText(/open the post on X/).closest("a")!.getAttribute("href")).toBe(props.href)
	})

	it("ignores messages that do not come from its own frame", () => {
		const { container } = render(<TweetVideo {...props} />)
		fireEvent.click(screen.getByLabelText("Play video"))
		act(() => {
			window.dispatchEvent(new MessageEvent("message", { data: { xv: "error" }, source: window }))
		})
		expect(container.querySelector("iframe")!.getAttribute("srcdoc")).toContain("mid.mp4")
	})

	it("goes straight to X's player when the post offers no playable file", () => {
		render(<TweetVideo {...props} sources={[]} />)
		fireEvent.click(screen.getByLabelText("Play video"))
		expect(screen.getByRole("dialog")).toBeTruthy()
	})

	it("plays a gif straight away, silent and looping", () => {
		const { container } = render(<TweetVideo {...props} gif />)
		expect(container.querySelector("iframe")!.getAttribute("srcdoc")).toMatch(/autoplay loop muted/)
	})
})
