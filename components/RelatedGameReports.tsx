import { cardImageUrl, hotspotPosition } from "../lib/urlFor"
import StoryCard from "./StoryCard"
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
						<StoryCard
							key={game._id}
							size="compact"
							className="min-h-[15rem]"
							href={`/games/${game.slug.current}`}
							imageUrl={cardImageUrl(game.mainImage)}
							imagePosition={hotspotPosition(game.mainImage)}
							sizes="(min-width: 640px) 33vw, 100vw"
							corner={
								<Badge variant={won ? "default" : "destructive"} className="text-[10px]">
									{won ? "W" : "L"} {game.raidersScore}-{game.opponentScore}
								</Badge>
							}
							badges={[`${game.homeAway === "home" ? "vs" : "at"} ${game.opponent}`]}
							title={game.title}
							meta={<p>{formatDate(game.gameDate)}</p>}
							cta=""
						/>
					)
				})}
			</div>
		</section>
	)
}

export default RelatedGameReports
