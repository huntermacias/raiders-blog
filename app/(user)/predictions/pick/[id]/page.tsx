import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import Link from "@/components/SiteLink"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"

import { readClient as client } from "../../../../../lib/sanity.client"
import { teamInfo } from "../../../../../lib/nfl"
import { type GamePrediction, gradeGame } from "../../../../../lib/predictions"
import { withEspnFinals } from "../../../../../lib/live/service"
import GamePickCard from "../../../../../components/predictions/GamePickCard"

// Same reasoning as the main scoreboard: reader votes and results should show
// up immediately, so this renders on every request.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"

type Props = { params: Promise<{ id: string }> }

const pickQuery = groq`
	*[_type == 'gamePrediction' && _id == $id && !(_id in path('drafts.**'))][0] {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore, writeup,
		actualAwayScore, actualHomeScore,
		readerVotesAway, readerVotesHome, _updatedAt,
		"report": gameReport->{ "slug": slug.current, title },
		"preview": previewPost->{ "slug": slug.current, title },
		keys[]{ _key, text, result }
	}
`

function validId(id: string) {
	return /^[A-Za-z0-9._-]{1,80}$/.test(id) && !id.startsWith("drafts.");
}

async function getPick(id: string): Promise<(GamePrediction & { _updatedAt?: string }) | null> {
	if (!validId(id)) return null
	const pick: (GamePrediction & { _updatedAt?: string }) | null = await client.fetch(pickQuery, { id })
	if (!pick) return null
	const [filled] = await withEspnFinals([pick])
	return filled
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;

    const {
        id
    } = params;

    const pick = await getPick(id)
    if (!pick) return {}

    const away = teamInfo(pick.awayTeam)
    const home = teamInfo(pick.homeTeam)
    const grade = gradeGame(pick)
    const title = `Week ${pick.week} pick: ${away.nick} at ${home.nick} | Raiders Rundown`
    const description = grade.final
		? `My pick was ${away.nick} ${pick.predictedAwayScore}, ${home.nick} ${pick.predictedHomeScore}. Final: ${pick.actualAwayScore}-${pick.actualHomeScore}.`
		: `My pick: ${away.nick} ${pick.predictedAwayScore}, ${home.nick} ${pick.predictedHomeScore}. Make yours before kickoff and see how readers are leaning.`
    const url = `${SITE_URL}/predictions/pick/${pick._id}`
    const stamp = pick._updatedAt ? new Date(pick._updatedAt).getTime() : 0
    const image = `${SITE_URL}/api/og?type=pick&id=${encodeURIComponent(pick._id)}&v=${stamp}`

    return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: {
			type: "website",
			title,
			description,
			url,
			siteName: "Raiders Rundown",
			images: [image, { url: image, width: 1200, height: 630, alt: title }],
		},
		twitter: { card: "summary_large_image", title, description, images: [image] },
	}
}

export default async function PickPage(props: Props) {
    const params = await props.params;

    const {
        id
    } = params;

    const pick = await getPick(id)
    if (!pick) return notFound()

    return (
		<div className="container max-w-xl py-12">
			<Link href="/predictions" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">
				<ArrowLeft aria-hidden className="h-4 w-4" /> Prediction Scoreboard
			</Link>
			<GamePickCard pick={pick} />
			<p className="mt-6 text-sm text-muted-foreground">
				Reader picks are anonymous and lock at kickoff.{" "}
				<Link href="/predictions" className="font-semibold text-foreground hover:underline">
					See every pick and the full scoreboard.
				</Link>
			</p>
		</div>
	)
}
