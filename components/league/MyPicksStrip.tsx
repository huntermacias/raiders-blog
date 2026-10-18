"use client"

import * as React from "react"
import Link from "@/components/SiteLink"
import { ArrowRight, Trophy, X } from "lucide-react"

import { useAccountState } from "@/components/league/useAccount"
import { dismiss, isDismissed } from "@/lib/league2/myTeam"
import { pagePath } from "@/lib/lab/lastShare"
import { teamByAbbr } from "@/lib/nfl"

const link = "inline-flex min-h-[44px] items-center gap-1 rounded-md px-1 font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"

/**
 * One line about the reader's League picks, for pages that are otherwise public and static. It asks the browser who is looking, so the page
 * itself is not slowed down, and it shows nothing at all while accounts are off. Visitors get a short invitation they can dismiss for a week.
 */
export default function MyPicksStrip({ className = "", bare = false }: { className?: string; bare?: boolean }) {
	const state = useAccountState()
	const [gone, setGone] = React.useState(false)
	React.useEffect(() => setGone(isDismissed()), [])

	if (state.status === "loading" || state.status === "off") return null

	const box = `${bare ? "" : "container "}${className}`.trim()
	const inner = "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-sm"

	if (state.status === "visitor") {
		if (gone) return null
		return (
			<div className={box}>
				<section aria-label="Beat the Blogger League" className={inner}>
					<Trophy className="h-4 w-4 shrink-0" aria-hidden />
					<span className="min-w-0 flex-1">Call the score of every Raiders game and see if you beat the blogger. Free.</span>
					<Link href="/league/register" className={link}>
						Join
						<ArrowRight className="h-4 w-4" aria-hidden />
					</Link>
					<Link href="/league/sign-in" className={link}>
						Sign in
					</Link>
					<button
						type="button"
						className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-muted"
						aria-label="Hide this for a week"
						onClick={() => {
							dismiss()
							setGone(true)
						}}
					>
						<X className="h-4 w-4" aria-hidden />
					</button>
				</section>
			</div>
		)
	}

	const s = state.strip
	const fav = s.favoriteTeam ? teamByAbbr(s.favoriteTeam) : null
	return (
		<div className={box}>
			<section aria-label="Your picks" className={inner}>
				<Trophy className="h-4 w-4 shrink-0" aria-hidden />
				{s.handle === null ? (
					<Link href="/league" className={link}>
						Finish setting up your League account
						<ArrowRight className="h-4 w-4" aria-hidden />
					</Link>
				) : (
					<>
						<span className="font-semibold">{s.handle}</span>
						{s.rank ? (
							<span className="text-muted-foreground">
								#{s.rank.rank} of {s.rank.of} &middot; {s.rank.points} pts
							</span>
						) : null}
						{s.next && s.next.kind !== "join" ? (
							<Link href="/league" className={link}>
								{s.next.title}
								<ArrowRight className="h-4 w-4" aria-hidden />
							</Link>
						) : (
							<Link href="/league" className={link}>
								Open the League
							</Link>
						)}
					</>
				)}
				{fav ? (
					<Link href={pagePath(fav.abbr)} className={`${link} sm:ml-auto`}>
						Will the {fav.nick} last?
					</Link>
				) : null}
			</section>
		</div>
	)
}
