import type { Metadata } from "next"

import FlagsHub from "@/components/lab/flags/FlagsHub"
import FlagsMethod from "@/components/lab/flags/FlagsMethod"
import MoreFromLab from "@/components/lab/MoreFromLab"
import Credit from "@/components/lab/Credit"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import TrackView from "@/components/lab/players/TrackView"
import { getFlagFiles, getRoster, hubSlice, rosterFor } from "@/lib/lab/flagsData"
import { FLAGS_PATH } from "@/lib/lab/flagsKit"
import { labWeeks } from "@/lib/lab/toolsData"
import { TEAMS } from "@/lib/nfl"

const SITE_URL = "https://www.raidersrundown.com"

export function generateMetadata(): Metadata {
	const title = "NFL penalty flags that cost like a turnover | Raiders Rundown"
	const description = "Every accepted penalty in the NFL with who committed it, the down and distance and what it cost: the flags that gave a team a free first down on fourth down, cancelled a takeaway or a touchdown, or cost as much as a turnover."
	const url = `${SITE_URL}${FLAGS_PATH}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default function FlagsPage() {
	const files = getFlagFiles()
	const full = getRoster().byId
	const slices = files.map((f) => hubSlice(f, full))
	const roster = rosterFor(slices.flatMap((s) => [...s.latest, ...s.worst]), full)
	const newest = files[0]
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">The Lab</p>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Flags that cost like a turnover</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						A punter is run into on fourth down and the drive goes on. A touchdown comes off the board. None of it is a turnover in the box score, and all of it can cost a team as much as one. Every accepted penalty in the league, with who committed it, the down and distance and what it cost.
					</p>
					<TrackView event="flags_hub_view" props={{}} />
					{newest ? <UpdatedStamp at={newest.generatedAt} kind="grades" what="Flags updated" className="mt-4" /> : null}
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label="The flags">
				<FlagsHub slices={slices} roster={roster} teams={TEAMS.map((t) => ({ abbr: t.abbr, name: t.name })).sort((a, b) => a.name.localeCompare(b.name))} />
				<FlagsMethod per={newest?.turnoverCost} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container py-8">
					<Credit>Rosters also from nflverse. </Credit>
				</div>
			</section>
			<MoreFromLab current={FLAGS_PATH} weeks={labWeeks()} />
		</div>
	)
}
