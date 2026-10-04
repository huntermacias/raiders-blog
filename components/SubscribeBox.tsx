import SubscribeForm from "./SubscribeForm"

/**
 * The email signup card. A server component so it can look at the
 * environment: with no BUTTONDOWN_API_KEY it renders nothing, so no page ever
 * shows a form that can't work. (Pages are statically generated, so after
 * adding the key in Vercel, redeploy for the boxes to appear.)
 *
 * `variant="band"` is the full-width dark version used on the homepage. The
 * `dark` class re-themes the form inside it, so it looks right in both site
 * themes.
 */
export default function SubscribeBox({ source, variant = "card" }: { source: string; variant?: "card" | "band" }) {
	if (!process.env.BUTTONDOWN_API_KEY) return null

	if (variant === "band") {
		return (
			<section aria-label="Email signup" className="container pt-14">
				<div className="dark relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] p-6 text-zinc-50 shadow-xl md:p-10">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0"
						style={{ background: "radial-gradient(55% 90% at 100% 0%, rgba(161,161,170,0.16) 0%, rgba(9,9,11,0) 65%)" }}
					/>
					<div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">The Sunday email</p>
							<h2 className="mt-2 font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl">Get the pick before kickoff, not after.</h2>
							<p className="mt-3 max-w-lg text-zinc-300">
								One email a week: my score prediction, the keys to the game, and the power rankings. Everything is graded in public, so you will always know how I&rsquo;m doing.
							</p>
						</div>
						<div>
							<SubscribeForm source={source} />
							<p className="mt-1 text-xs text-zinc-500">No spam. Unsubscribe any time.</p>
						</div>
					</div>
				</div>
			</section>
		)
	}

	return (
		<aside aria-label="Email signup" className="rounded-xl border border-border bg-card p-6 shadow-sm">
			<h2 className="font-serif text-2xl font-bold tracking-tight">Get the Sunday picks in your inbox</h2>
			<p className="mt-1 mb-4 max-w-xl text-sm text-muted-foreground">
				One email a week: my game pick, the keys to the game, and the power rankings. No spam, unsubscribe any time.
			</p>
			<SubscribeForm source={source} />
		</aside>
	)
}
