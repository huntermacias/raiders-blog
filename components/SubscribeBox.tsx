import SubscribeForm from "./SubscribeForm"

/**
 * The email signup card. A server component so it can look at the
 * environment: with no BUTTONDOWN_API_KEY it renders nothing, so no page ever
 * shows a form that can't work. (Pages are statically generated, so after
 * adding the key in Vercel, redeploy for the boxes to appear.)
 */
export default function SubscribeBox({ source }: { source: string }) {
	if (!process.env.BUTTONDOWN_API_KEY) return null

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
