import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

function Banner() {
	const today = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	})

	return (
		<section className="border-b border-border/60 bg-gradient-to-b from-muted/60 to-background">
			<div className="container flex flex-col gap-8 py-14 lg:flex-row lg:items-end lg:justify-between lg:py-20">
				<div className="max-w-2xl space-y-5 animate-fade-in">
					<Badge variant="secondary" className="uppercase tracking-widest">
						{today}
					</Badge>

					<h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
						All About the Shield
					</h1>

					<p className="text-lg text-muted-foreground">
						Independent coverage of the Las Vegas Raiders &mdash; game recaps, roster
						moves, draft analysis, and the stories that matter to{" "}
						<span className="font-semibold text-foreground">Raider Nation</span>.
					</p>
				</div>

				<div className="flex max-w-xs flex-col gap-3 border-l border-border/60 pl-6 text-sm text-muted-foreground lg:text-right lg:border-l-0 lg:border-r lg:pl-0 lg:pr-6">
					<p>Game Recaps</p>
					<p>Player Profiles</p>
					<p>Draft Predictions</p>
					<p>Rumors &amp; Roster Moves</p>
				</div>
			</div>
			<Separator />
		</section>
	)
}

export default Banner
