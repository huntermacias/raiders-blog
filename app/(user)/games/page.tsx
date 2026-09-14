import { groq } from "next-sanity"

import { client } from "../../../lib/sanity.client"
import { cardImageUrl, hotspotPosition } from "../../../lib/urlFor"
import ClientSideRoute from "../../../components/ClientSideRoute"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import type { Metadata } from "next"

export const revalidate = 60

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
				<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
					{games.map((game) => {
						const won = game.raidersScore > game.opponentScore
						return (
							<ClientSideRoute key={game._id} route={`/games/${game.slug.current}`}>
								<article className="group cursor-pointer">
									<Card className="flex h-full flex-col overflow-hidden border-border/70 transition-shadow hover:shadow-lg">
										<div className="relative h-44 w-full overflow-hidden">
											<Image
												className="object-cover transition-transform duration-300 group-hover:scale-105"
												src={cardImageUrl(game.mainImage)}
												alt={game.title}
												fill
												style={{ objectPosition: hotspotPosition(game.mainImage) }}
												sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
											/>
											<Badge
												className="absolute left-3 top-3"
												variant={won ? "default" : "destructive"}
											>
												{won ? "W" : "L"} {game.raidersScore}-{game.opponentScore}
											</Badge>
										</div>
										<div className="flex flex-1 flex-col gap-2 p-5">
											<p className="text-xs uppercase tracking-wide text-muted-foreground">
												{game.homeAway === "home" ? "vs" : "at"} {game.opponent} &middot; {formatDate(game.gameDate)}
											</p>
											<h3 className="font-serif text-lg font-bold leading-snug tracking-tight group-hover:underline">
												{game.title}
											</h3>
											<p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
												{game.description}
											</p>
										</div>
									</Card>
								</article>
							</ClientSideRoute>
						)
					})}
				</div>
			)}
		</div>
	)
}
