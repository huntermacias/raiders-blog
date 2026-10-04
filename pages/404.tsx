import Head from "next/head"
import Link from "@/components/SiteLink"

// Unmatched URLs. The pages router can't use the site layout (header, theme),
// so this is a self-contained black-and-silver page that matches the share
// cards, with plain system fonts. notFound() inside the app uses
// app/(user)/not-found.tsx instead.
export default function Custom404() {
	return (
		<div
			style={{ minHeight: "100vh", background: "#0a0a0b", color: "#e6e7e9" }}
			className="flex flex-col items-center justify-center px-6 text-center"
		>
			<Head>
				<title>Page not found | Raiders Rundown</title>
				<meta name="robots" content="noindex" />
			</Head>
			<p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#80868b" }}>
				404
			</p>
			<h1 className="mt-3 text-5xl font-extrabold uppercase tracking-tight sm:text-7xl" style={{ fontFamily: "Impact, 'Arial Narrow Bold', Haettenschweiler, sans-serif" }}>
				Out of bounds
			</h1>
			<p className="mt-4 max-w-md text-base" style={{ color: "#a7aeb3" }}>
				That page doesn't exist. Try the scoreboard, the rankings, or head back to the homepage.
			</p>
			<nav className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
				{[
					["/", "Home"],
					["/predictions", "Predictions"],
					["/rankings", "Rankings"],
					["/schedule", "Schedule"],
				].map(([href, label]) => (
					<Link
						key={href}
						href={href}
						className="rounded-md border px-4 py-2 transition-colors hover:bg-white/10"
						style={{ borderColor: "#a7aeb3" }}
					>
						{label}
					</Link>
				))}
			</nav>
		</div>
	)
}
