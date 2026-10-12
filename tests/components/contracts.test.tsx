// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/image", () => ({ default: (p: Record<string, string>) => <img alt="" {...p} /> }))
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import ContractSection from "../../components/lab/players/ContractSection"
import MoneyCompare from "../../components/lab/players/MoneyCompare"
import ValuePage from "../../app/(user)/lab/players/value/page"
import { getContracts } from "../../lib/lab/contractData"
import { dealFor, mainRow, moneyRows, payRank, valueBoard, valueFor } from "../../lib/lab/contractsKit"
import { getPlayers } from "../../lib/lab/data"

afterEach(cleanup)
const data = getPlayers()
const contracts = getContracts()

describe("<ContractSection />", () => {
	it("shows the deal, the cap hit by year and where the source is from for a player with full terms", () => {
		const row = mainRow(data, "maxx-crosby")!
		const deal = dealFor(data, contracts, "maxx-crosby")!
		render(<ContractSection data={data} contracts={contracts} row={row} deal={deal} rank={payRank(data, contracts, row.slug)} value={valueFor(data, contracts, row.slug)} id="m" headingId="mh" className="" />)
		expect(screen.getByRole("heading", { name: /Contract & cap/ })).toBeTruthy()
		expect(screen.getByTestId("deal-sentence").textContent).toMatch(/\$35\.5M a year/)
		expect(screen.getByTestId("deal-sentence").textContent).toMatch(/\$62\.5M of it is guaranteed/)
		expect(within(screen.getByTestId("cap-by-year")).getByText("2026 (now)")).toBeTruthy()
		expect(screen.getByTestId("money-source").textContent).toMatch(new RegExp(`as of ${contracts.asOf}`))
		expect(screen.getAllByTestId("money-tile")).toHaveLength(4)
	})

	it("is honest for a player with only a pay line: no guaranteed money or term is invented", () => {
		const row = mainRow(data, "tre-tucker")!
		const deal = dealFor(data, contracts, "tre-tucker")!
		render(<ContractSection data={data} contracts={contracts} row={row} deal={deal} rank={null} value={null} id="m" headingId="mh" className="" />)
		const tiles = screen.getAllByTestId("money-tile").map((t) => t.textContent)
		expect(tiles.join(" ")).toMatch(/Guaranteed–/)
		expect(tiles.join(" ")).toMatch(/Runs through–/)
		expect(screen.queryByTestId("cap-by-year")).toBeNull()
	})
})

describe("<MoneyCompare />", () => {
	it("draws a bar only for dollar amounts and uses one scale for both players", () => {
		const a = dealFor(data, contracts, "maxx-crosby")!
		const b = dealFor(data, contracts, "kwity-paye")!
		const rows = moneyRows(a, b, payRank(data, contracts, "maxx-crosby"), payRank(data, contracts, "kwity-paye"))
		const { container } = render(<MoneyCompare rows={rows} aName="Maxx Crosby" bName="Kwity Paye" colorB="red" />)
		const apy = within(screen.getAllByTestId("money-row")[0])
		expect(apy.getByText("Average per year")).toBeTruthy()
		const bars = container.querySelectorAll("[data-testid=money-row]:first-child span[style*=width]")
		expect(bars).toHaveLength(2)
		expect((bars[0] as HTMLElement).style.width).toBe("100%")
		expect(parseFloat((bars[1] as HTMLElement).style.width)).toBeLessThan(100)
		const through = screen.getAllByTestId("money-row").find((r) => /through/.test(r.textContent ?? ""))
		expect(through?.querySelectorAll("span[style*=width]").length ?? 0).toBe(0)
	})
})

describe("the pay against play page", () => {
	it("lists only positions with enough players, with a read or an early/too-few chip on every row, and says it is a comparison among tracked teams", () => {
		render(<ValuePage />)
		expect(screen.getByTestId("value-caveat").textContent).toMatch(/not among the league/)
		const rows = screen.getAllByTestId("value-row")
		expect(rows.length).toBeGreaterThan(0)
		for (const r of rows) expect(r.textContent).toMatch(/Playing above his pay|About what he is paid|Paid above his play so far|Early read|Too few to call/)
		const total = ["qb", "rb", "wr", "te", "ol", "edge", "idl", "lb", "cb", "saf", "k", "p"].reduce((n, g) => n + (valueBoard(data, contracts, g as never).length >= 6 ? valueBoard(data, contracts, g as never).length : 0), 0)
		expect(rows).toHaveLength(total)
	})
})
