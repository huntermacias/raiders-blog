import Link from "@/components/SiteLink"

import { Separator } from "@/components/ui/separator"

function Footer() {
	const year = new Date().getFullYear()

	return (
		<footer className="border-t border-border/60 bg-muted/30">
			<div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-3 sm:col-span-2 lg:col-span-1">
					<span className="font-serif text-lg font-bold tracking-tight">Raiders Rundown</span>
					<p className="max-w-xs text-sm text-muted-foreground">
						Independent Las Vegas Raiders coverage &mdash; news, rumors, and analysis for
						Raider Nation.
					</p>
				</div>

				<div className="space-y-3 text-sm">
					<p className="font-semibold">Coverage</p>
					<ul className="space-y-2 text-muted-foreground">
						<li><Link href="/#latest" className="hover:text-foreground">Latest News</Link></li>
						<li><Link href="/games" className="hover:text-foreground">Game Recaps</Link></li>
						<li><Link href="/predictions" className="hover:text-foreground">Prediction Scoreboard</Link></li>
						<li><Link href="/league" className="hover:text-foreground">Beat the Blogger League</Link></li>
						<li><Link href="/rankings" className="hover:text-foreground">Power Rankings</Link></li>
						<li><Link href="/lab" className="hover:text-foreground">The Lab</Link></li>
						<li><Link href="/schedule" className="hover:text-foreground">Raiders Schedule</Link></li>
						<li><Link href="/live" className="hover:text-foreground">Live Threads</Link></li>
						<li><Link href="/community" className="hover:text-foreground">Discussion</Link></li>
						<li><a href="/rss.xml" className="hover:text-foreground">RSS Feed</a></li>
					</ul>
				</div>

				<div className="space-y-3 text-sm">
					<p className="font-semibold">More from Hunter</p>
					<ul className="space-y-2 text-muted-foreground">
						<li>
							<a
								href="https://huntermacias.com"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground"
							>
								Tech Blog
							</a>
						</li>
					</ul>
				</div>

				<div className="space-y-3 text-sm">
					<p className="font-semibold">About this site</p>
					<p className="text-muted-foreground">
						Raiders Rundown is an independent fan site and is not affiliated with the
						NFL or the Las Vegas Raiders organization.
					</p>
				</div>
			</div>

			<Separator />

			<div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted-foreground sm:flex-row">
				<p>&copy; {year} Raiders Rundown. All rights reserved.</p>
				<p>Built by Hunter Macias</p>
			</div>
		</footer>
	)
}

export default Footer
