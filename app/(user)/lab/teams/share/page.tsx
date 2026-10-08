import type { Metadata } from "next"

import ShareLanding from "@/components/lab/ShareLanding"
import { BOARD_SHOWS } from "@/lib/lab/boardShow"
import { getUnits } from "@/lib/lab/data"
import { BOARD_PATH, boardQuery, readBoardQuery } from "@/lib/lab/matchupShare"


// Where a shared link to the league board lands: the card for the sort, the group of teams and the team that was
// shared, in the link preview, then on to the interactive board with the same view. It reads the query, so it is
// built per request; it is kept out of search results because the real page is /lab/teams.

const SITE_URL = "https://www.raidersrundown.com"
const DESCRIPTION = "Quarterback, offensive line, receivers, run game, pass rush, run defense and coverage: where every NFL team ranks right now."

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const data = getUnits()
	const view = readBoardQuery({ sort: one(sp.sort), show: one(sp.show), team: one(sp.team) }, { shows: BOARD_SHOWS, teams: new Set(Object.keys(data.teams)) })
	const q = boardQuery(view)
	return { q, stamp: Date.parse(data.generatedAt) || 0, show: view.show }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const { q, stamp } = await resolve(props)
	const card = `${SITE_URL}/api/og?type=board${q ? `&${q}` : ""}&size=wide&v=${stamp}`
	const title = "How every team stacks up, position group by position group | Raiders Rundown"
	return {
		title,
		description: DESCRIPTION,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${BOARD_PATH}` },
		openGraph: { type: "website", title, description: DESCRIPTION, url: `${SITE_URL}${BOARD_PATH}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [card] },
	}
}

export default async function BoardShareLanding(props: Props) {
	const { q, stamp, show } = await resolve(props)
	const href = `${BOARD_PATH}${q ? `?${q}` : ""}`
	const image = `/api/og?type=board${q ? `&${q}` : ""}&size=wide&v=${stamp}`
	return <ShareLanding crumb="Teams" title={show ? `How the ${show} stacks up` : "How every team stacks up"} image={image} alt="Every team ranked at each position group, as a heat map" href={href} button="Open the board" />
}
