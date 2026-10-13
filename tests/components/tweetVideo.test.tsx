// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import TweetVideo from "../../components/embeds/TweetVideo"

afterEach(cleanup)

const props = {
	sources: ["https://video.twimg.com/mid.mp4", "https://video.twimg.com/hi.mp4"],
	poster: "https://pbs.twimg.com/p.jpg",
	href: "https://x.com/a/status/1",
	width: 1280,
	height: 720,
}

describe("<TweetVideo />", () => {
	it("loads no video until the play button is pressed, then plays the first quality", () => {
		const { container } = render(<TweetVideo {...props} />)
		expect(container.querySelector("video")).toBeNull()
		fireEvent.click(screen.getByLabelText("Play video"))
		const v = container.querySelector("video")!
		expect(v.getAttribute("src")).toBe("https://video.twimg.com/mid.mp4")
	})

	it("tries the next quality when one is refused, then points to the post when none play", () => {
		const { container } = render(<TweetVideo {...props} />)
		fireEvent.click(screen.getByLabelText("Play video"))
		fireEvent.error(container.querySelector("video")!)
		expect(container.querySelector("video")!.getAttribute("src")).toBe("https://video.twimg.com/hi.mp4")
		fireEvent.error(container.querySelector("video")!)
		expect(container.querySelector("video")).toBeNull()
		expect(screen.getByText(/can.t play here/i)).toBeTruthy()
		expect(screen.getByText(/Watch on X/).closest("a")!.getAttribute("href")).toBe("https://x.com/a/status/1")
	})

	it("plays a gif straight away, silent and looping", () => {
		const { container } = render(<TweetVideo {...props} gif />)
		const v = container.querySelector("video")!
		expect(v.loop).toBe(true)
		expect(v.muted).toBe(true)
	})
})
