import Link from "@/components/SiteLink"
import { ArrowRight } from "lucide-react"

// Shown inside the normal site layout when a page calls notFound() (a post,
// recap or pick that doesn't exist). Unmatched URLs use pages/404.tsx.
const LINKS = [
	{ href: "/predictions", label: "Prediction scoreboard", note: "Every pick, graded in public" },
	{ href: "/rankings", label: "Power rankings", note: "All 32 teams, every week" },
	{ href: "/schedule", label: "Raiders schedule", note: "Results, picks and previews" },
	{ href: "/games", label: "Game reports", note: "Recaps from every game" },
]

export default function NotFound() {
	return (
		<div className="container max-w-3xl py-20">
			<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
			<h1 className="mt-2 font-serif text-5xl font-bold tracking-tight md:text-6xl">That one's out of bounds</h1>
			<p className="mt-4 max-w-xl text-lg text-muted-foreground">
				The page you were after doesn't exist, or it moved. Here's where the good stuff is.
			</p>

			<ul className="mt-10 grid gap-3 sm:grid-cols-2">
				{LINKS.map((l) => (
					<li key={l.href}>
						<Link
							href={l.href}
							className="group flex h-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground"
						>
							<span>
								<span className="block font-semibold">{l.label}</span>
								<span className="block text-sm text-muted-foreground">{l.note}</span>
							</span>
							<ArrowRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
						</Link>
					</li>
				))}
			</ul>

			<p className="mt-8">
				<Link href="/" className="font-semibold underline-offset-4 hover:underline">
					Back to the homepage
				</Link>
			</p>
		</div>
	)
}
