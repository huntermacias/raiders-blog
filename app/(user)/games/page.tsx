import { groq } from "next-sanity"

import { client } from "../../../lib/sanity.client"
import { cardImageUrl, hotspotPosition } from "../../../lib/urlFor"
import StoryCard from "../../../components/StoryCard"
import { Badge } from "@/components/ui/badge"
import type { Metadata } from "next"

// Always render fresh from Sanity. Time-based ISR (revalidate) only refreshes
// this page in the background on the *next* real visitor request after the
// window elapses -- on a low-traffic route that can mean it never refreshes.
// force-dynamic renders on every request instead, so newly published content
// (or the games index / homepage list of recent posts) shows immediately.
export const dynamic = "force-dynamic"

const GAMES_URL = "https://www.raidersrundown.com/games"

export const metadata: Metadata = {
	title: "Game Reports | Raiders Rundown",
	description: "Box scores, recaps, and player-by-player analysis from every Las Vegas Raiders game.",
	alternates: { canonical: GAMES_URL },
	openGraph: {
		type: "website",
		title: "Game Reports | Raiders Rundown",
		description: "Box scores, recaps, and player-by-player analysis from every Las Vegas Raiders game.",
		url: GAMES_URL,
		siteName: "Raiders Rundown",
	},
	twitter: {
		card: "summary_large_image",
		title: "Game Reports | Raiders Rundown",
		description: "Box scores, recaps, and player-by-player analysis from every Las Vegas Raiders game.",
	},
}

const query = groq`
	*[_type=='gameReport' && !(_id in path('drafts.**'))] {
		_id, title, slug, description, opponent, homeAway, gameDate,
		raidersScore, opponentScore, mainImage
	} | order(gameDate desc)
`

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

export default async function GamesPage() {
	const games: GameReport[] = await client.fetch(query)

	return (
		<div className="container py-12">
			<div className="mb-10">
				<h1 className="font-serif text-4xl font-bold tracking-tight">Game Reports</h1>
				<p className="mt-2 text-muted-foreground">
					Box scores, recaps, and analysis from every Raiders game.
				</p>
			</div>

			{games.length === 0 ? (
				<div className="rounded-lg border border-dashed py-24 text-center text-muted-foreground">
					No game reports yet — check back after the next game.
				</div>
			) : (
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{games.map((game) => {
						const won = game.raidersScore > game.opponentScore
						return (
							<StoryCard
								key={game._id}
								href={`/games/${game.slug.current}`}
								imageUrl={cardImageUrl(game.mainImage)}
								imagePosition={hotspotPosition(game.mainImage)}
								sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
								corner={
									<Badge variant={won ? "default" : "destructive"}>
										{won ? "W" : "L"} {game.raidersScore}-{game.opponentScore}
									</Badge>
								}
								badges={[`${game.homeAway === "home" ? "vs" : "at"} ${game.opponent}`]}
								title={game.title}
								description={game.description}
								meta={<p>{formatDate(game.gameDate)}</p>}
							/>
						)
					})}
				</div>
			)}
		</div>
	)
}
