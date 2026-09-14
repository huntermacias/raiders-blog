import Image from "next/image"

import { cardImageUrl, hotspotPosition } from "../lib/urlFor"
import ClientSideRoute from "./ClientSideRoute"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type RelatedGame = {
	_id: string
	title: string
	slug: { current: string }
	opponent: string
	homeAway: "home" | "away"
	gameDate: string
	raidersScore: number
	opponentScore: number
	mainImage: any
}

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

function RelatedGameReports({ games }: { games: RelatedGame[] }) {
	if (!games?.length) return null

	return (
		<section className="container max-w-4xl py-10">
			<h2 className="mb-6 font-serif text-2xl font-bold tracking-tight">More Game Reports</h2>
			<div className="grid gap-6 sm:grid-cols-3">
				{games.map((game) => {
					const won = game.raidersScore > game.opponentScore
					return (
						<ClientSideRoute key={game._id} route={`/games/${game.slug.current}`}>
							<article className="group cursor-pointer">
								<Card className="h-full overflow-hidden border-border/70 transition-shadow hover:shadow-md">
									<div className="relative h-32 w-full overflow-hidden">
										<Image
											className="object-cover transition-transform duration-300 group-hover:scale-105"
											src={cardImageUrl(game.mainImage)}
											alt={game.title}
											fill
											style={{ objectPosition: hotspotPosition(game.mainImage) }}
											sizes="(min-width: 640px) 33vw, 100vw"
										/>
										<Badge
											className="absolute left-2 top-2 text-[10px]"
											variant={won ? "default" : "destructive"}
										>
											{won ? "W" : "L"} {game.raidersScore}-{game.opponentScore}
										</Badge>
									</div>
									<div className="p-3">
										<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
											{game.homeAway === "home" ? "vs" : "at"} {game.opponent} &middot; {formatDate(game.gameDate)}
										</p>
										<p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
											{game.title}
										</p>
									</div>
								</Card>
							</article>
						</ClientSideRoute>
					)
				})}
			</div>
		</section>
	)
}

export default RelatedGameReports
