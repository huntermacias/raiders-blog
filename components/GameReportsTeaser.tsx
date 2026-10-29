import { cardImageUrl, hotspotPosition } from "../lib/urlFor"
import ClientSideRoute from "./ClientSideRoute"
import StoryCard from "./StoryCard"
import { Badge } from "@/components/ui/badge"
import { TeamLogo } from "@/components/lab/players/Media"
import { teamInfo } from "@/lib/nfl"

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

// Plain (non-async) presentational component -- the homepage fetches the
// data and passes it in, the same way it already does for BlogList. An
// async function component used as a *nested* JSX element (rather than a
// route's page.tsx default export, which Next special-cases) trips a real
// TypeScript error: "Promise<Element> is not a valid JSX element."
type Props = {
	games: GameReport[]
	/** The real score of a game by report id, when the Lab has it. Studio's score fields are typed by hand and can be the wrong way round. */
	scores?: Record<string, { raiders: number; opponent: number }>
}

function GameReportsTeaser({ games, scores }: Props) {
	if (!games?.length) return null

	return (
		<section id="reports" aria-labelledby="home-reports" className="scroll-mt-32 border-b border-border/60 bg-muted/20">
			<div className="container py-10">
				<div className="mb-5 flex items-center justify-between">
					<h2 id="home-reports" className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">Latest Game Reports</h2>
					<ClientSideRoute route="/games">
						<span className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
							View all &rarr;
						</span>
					</ClientSideRoute>
				</div>

				<div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
					{games.map((game) => {
						const real = scores?.[game._id] ?? { raiders: game.raidersScore, opponent: game.opponentScore }
						const won = real.raiders > real.opponent
						const tie = real.raiders === real.opponent
						const opp = teamInfo(game.opponent)
						return (
							<StoryCard
								key={game._id}
								size="compact"
								className="min-h-[12rem]"
								href={`/games/${game.slug.current}`}
								imageUrl={cardImageUrl(game.mainImage)}
								imagePosition={hotspotPosition(game.mainImage)}
								sizes="(min-width: 640px) 33vw, 100vw"
								corner={
									<span className="flex items-center gap-2">
										<span className="flex items-center -space-x-1.5" aria-hidden>
											<TeamLogo team="LV" size={26} className="rounded-full bg-black/60 p-0.5 ring-1 ring-white/30" />
											<TeamLogo team={opp.abbr} size={26} className="rounded-full bg-black/60 p-0.5 ring-1 ring-white/30" />
										</span>
										<Badge variant={won ? "default" : tie ? "secondary" : "destructive"} className="text-[10px]">
											{tie ? "T" : won ? "W" : "L"} {real.raiders}-{real.opponent}
										</Badge>
									</span>
								}
								title={`vs ${game.opponent}`}
								description={game.title}
								meta={<p>{formatDate(game.gameDate)}</p>}
							/>
						)
					})}
				</div>
			</div>
		</section>
	)
}

export default GameReportsTeaser
