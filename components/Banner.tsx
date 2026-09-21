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
			{/* Mobile gets noticeably tighter padding/type than before -- the
			    old py-14 + text-5xl + full paragraph + the 4-item category
			    list stacked (flex-col below lg) pushed the actual content
			    below the fold on a phone. The category list is dropped
			    entirely below lg: it's decorative, not information the
			    reader needs before scrolling. */}
			<div className="container flex flex-col gap-4 py-6 sm:gap-8 sm:py-10 lg:flex-row lg:items-end lg:justify-between lg:py-20">
				<div className="max-w-2xl space-y-3 animate-fade-in sm:space-y-5">
					<Badge variant="secondary" className="uppercase tracking-widest">
						{today}
					</Badge>

					<h1 className="font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
						All About the Shield
					</h1>

					<p className="text-sm text-muted-foreground sm:text-lg">
						Independent coverage of the Las Vegas Raiders &mdash; game recaps, roster
						moves, draft analysis, and the stories that matter to{" "}
						<span className="font-semibold text-foreground">Raider Nation</span>.
					</p>
				</div>

				<div className="hidden max-w-xs flex-col gap-3 border-l border-border/60 pl-6 text-sm text-muted-foreground lg:flex lg:text-right lg:border-l-0 lg:border-r lg:pl-0 lg:pr-6">
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
