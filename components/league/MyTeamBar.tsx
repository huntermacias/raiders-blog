"use client"

import * as React from "react"
import Link from "@/components/SiteLink"
import { Star } from "lucide-react"

import { useMyTeam } from "@/components/league/useAccount"
import { pagePath } from "@/lib/lab/lastShare"
import { TEAMS, teamByAbbr } from "@/lib/nfl"

const btn = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line bg-lab-surface px-3 py-2 text-sm font-semibold text-lab-ink hover:bg-lab-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
const textLink = "inline-flex min-h-[44px] items-center font-semibold text-lab-ink underline underline-offset-4"

/**
 * "Make this my team", on the Will it last pages. Works without an account; signed in, the team follows the reader to other devices.
 * Renders after the browser has looked, inside a box of fixed height so the page does not jump.
 */
export default function MyTeamBar({ abbr }: { abbr: string }) {
	const { team, ready, account, setTeam } = useMyTeam()
	const here = teamByAbbr(abbr)
	const mine = team ? teamByAbbr(team) : null
	const [said, setSaid] = React.useState("")

	const choose = (a: string | null) => {
		void setTeam(a)
		setSaid(a ? `${teamByAbbr(a).nick} are now your team.` : "Your team was cleared.")
	}

	return (
		<div className="container pt-3 sm:pt-4">
			<div className="min-h-[3.25rem]">
				{ready ? (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-lab-line bg-lab-tint px-3 py-2 text-sm text-lab-soft">
						<Star className="h-4 w-4 shrink-0" aria-hidden />
						{mine && mine.abbr === abbr ? (
							<span className="font-semibold text-lab-ink">The {here.nick} are your team</span>
						) : mine ? (
							<>
								<span className="inline-flex flex-wrap items-center gap-x-3">
									<span>
										Your team: <strong className="text-lab-ink">{mine.nick}</strong>
									</span>
									<Link href={pagePath(mine.abbr)} className={textLink}>
										See the {mine.nick}
									</Link>
								</span>
								<button type="button" className={btn} onClick={() => choose(abbr)}>
									Make the {here.nick} my team
								</button>
							</>
						) : (
							<button type="button" className={btn} onClick={() => choose(abbr)}>
								Make the {here.nick} my team
							</button>
						)}
						<label className="inline-flex items-center gap-2">
							<span className="sr-only">{mine ? "Switch your team" : "Choose your team"}</span>
							<select
								value=""
								onChange={(e) => e.target.value && choose(e.target.value)}
								className="min-h-[44px] max-w-[11rem] rounded-lg border border-lab-line bg-lab-surface px-2 text-sm text-lab-ink"
								aria-label={mine ? "Switch your team" : "Choose your team"}
							>
								<option value="">{mine ? "Switch team" : "Or choose another"}</option>
								{TEAMS.filter((t) => t.abbr !== mine?.abbr).map((t) => (
									<option key={t.abbr} value={t.abbr}>
										{t.name}
									</option>
								))}
							</select>
						</label>
						{mine && account.status === "visitor" ? (
							<Link href={`/league/sign-in?next=${encodeURIComponent(pagePath(abbr))}`} className={textLink}>
								Sign in to keep it on every device
							</Link>
						) : null}
						{mine && account.status === "player" ? <span className="text-xs text-lab-muted">Saved to your account</span> : null}
						<span className="sr-only" role="status" aria-live="polite">
							{said}
						</span>
					</div>
				) : null}
			</div>
		</div>
	)
}
