import { groq } from "next-sanity"
import Image from "next/image"

import { client } from "../lib/sanity.client"
import { cardImageUrl } from "../lib/urlFor"
import ClientSideRoute from "./ClientSideRoute"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const query = groq`
	*[_type=='gameReport' && !(_id in path('drafts.**'))] {
		_id, title, slug, opponent, gameDate, raidersScore, opponentScore, mainImage
	} | order(gameDate desc) [0...3]
`

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

async function GameReportsTeaser() {
	const games: GameReport[] = await client.fetch(query)
	if (!games?.length) return null

	return (
		<section className="border-b border-border/60 bg-muted/20">
			<div className="container py-10">
				<div className="mb-5 flex items-center justify-between">
					<h2 className="font-serif text-xl font-bold tracking-tight">Latest Game Reports</h2>
					<ClientSideRoute route="/games">
						<span className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
							View all &rarr;
						</span>
					</ClientSideRoute>
				</div>

				<div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
					{games.map((game) => {
						const won = game.raidersScore > game.opponentScore
						return (
							<ClientSideRoute key={game._id} route={`/games/${game.slug.current}`}>
								<article className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background p-3 transition-shadow hover:shadow-md">
									<div className="relative h-14 w-20 shrink-0 overflow-hidden rounded">
										<Image
											className="object-cover"
											src={cardImageUrl(game.mainImage)}
											alt={game.title}
											fill
											sizes="80px"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Badge variant={won ? "default" : "destructive"} className="text-[10px]">
												{won ? "W" : "L"} {game.raidersScore}-{game.opponentScore}
											</Badge>
											<span className="text-xs text-muted-foreground">{formatDate(game.gameDate)}</span>
										</div>
										<p className="truncate text-sm font-semibold group-hover:underline">
											vs {game.opponent}
										</p>
									</div>
								</article>
							</ClientSideRoute>
						)
					})}
				</div>
			</div>
		</section>
	)
}

export default GameReportsTeaser
