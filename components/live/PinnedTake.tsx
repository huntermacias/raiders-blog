import Link from "@/components/SiteLink"

export type Pinned = { title: string; slug: string; body: string; postedAt: string }

function when(iso: string) {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT"
}

/** Hunter's latest note from a live thread, when there is one. Optional: the page works without it. */
export default function PinnedTake({ take }: { take: Pinned | null }) {
	if (!take) return null
	return (
		<aside className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" aria-label="A note from Hunter">
			<div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">
				<span>From Hunter &middot; {when(take.postedAt)}</span>
				<Link href={`/live/${take.slug}`} className="text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
					Full thread &rarr;
				</Link>
			</div>
			<p className="mt-2 whitespace-pre-line font-serif text-lg leading-snug text-lab-ink sm:text-xl">{take.body}</p>
		</aside>
	)
}
