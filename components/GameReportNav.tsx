import { ChevronLeft, ChevronRight } from "lucide-react"

import ClientSideRoute from "./ClientSideRoute"

type NavGame = {
	slug: { current: string }
	title: string
	opponent: string
} | null

function GameReportNav({ prevGame, nextGame }: { prevGame: NavGame; nextGame: NavGame }) {
	if (!prevGame && !nextGame) return null

	return (
		<nav className="grid grid-cols-1 gap-3 border-t border-border/70 pt-8 sm:grid-cols-2">
			{prevGame ? (
				<ClientSideRoute route={`/games/${prevGame.slug.current}`}>
					<div className="group flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 p-4 transition-colors hover:bg-muted/40">
						<ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Previous Game</p>
							<p className="truncate text-sm font-semibold group-hover:underline">{prevGame.title}</p>
						</div>
					</div>
				</ClientSideRoute>
			) : (
				<div />
			)}

			{nextGame ? (
				<ClientSideRoute route={`/games/${nextGame.slug.current}`}>
					<div className="group flex cursor-pointer items-center justify-end gap-2 rounded-lg border border-border/70 p-4 text-right transition-colors hover:bg-muted/40">
						<div className="min-w-0">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Next Game</p>
							<p className="truncate text-sm font-semibold group-hover:underline">{nextGame.title}</p>
						</div>
						<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
					</div>
				</ClientSideRoute>
			) : (
				<div />
			)}
		</nav>
	)
}

export default GameReportNav
