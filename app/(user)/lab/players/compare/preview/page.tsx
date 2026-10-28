import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import { type CompareSearch, compareMetadata } from "@/lib/lab/compareMeta"

// What a link-preview bot is given for a comparison (see lib/og/guard.ts): the comparison's own title, description and card in the head, and a body with
// nothing to render. The middleware sends it here; a reader never sees it, and it is kept out of search results.

type Props = { searchParams: Promise<CompareSearch> }

export async function generateMetadata(props: Props): Promise<Metadata> {
	const meta = compareMetadata(await props.searchParams)
	return { ...meta, robots: { index: false, follow: false } }
}

export default function ComparePreview() {
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="container py-12">
				<h1 className="m-0 font-serif text-3xl font-bold">Settle the debate</h1>
				<p className="mt-3 max-w-xl text-sm text-lab-soft">Two players, side by side on the stats that matter.</p>
				<p className="mt-4">
					<Link href="/lab/players/compare" className="font-semibold underline">
						Open the player comparison tool
					</Link>
				</p>
			</section>
		</div>
	)
}
