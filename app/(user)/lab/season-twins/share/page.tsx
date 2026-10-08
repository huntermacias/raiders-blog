import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import ShareRedirect from "@/components/lab/ShareRedirect"
import { getTwinsView } from "@/lib/lab/twins"
import { TWINS_PATH, TWINS_SECTION, readTwinsView, twinsQuery } from "@/lib/lab/twinsShare"

// Where a shared "Season twins" link lands. The link preview (the card for the twin that was shared) is read from
// this page's HTML, and a reader is sent straight on to the interactive page with the same match and twin. It reads
// the query, so it is built per request; it is kept out of search results because the real page is /lab/season-twins.

const SITE_URL = "https://www.raidersrundown.com"
const DESCRIPTION = "The past NFL teams that looked the most like the Raiders so far, laid over them stat by stat, and how their seasons ended."

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const data = getTwinsView()
	if (!data?.modes.all) return null
	const rows = new Set(Object.values(data.modes).flatMap((m) => (m ? [...m.result.twins, ...(m.result.raidersTwin ? [m.result.raidersTwin] : [])].map((t) => t.row) : [])))
	const view = readTwinsView({ size: one(sp.size), mode: one(sp.mode), twin: one(sp.twin) }, rows)
	const found = (data.modes[view.mode] ?? data.modes.all).result
	const twin = [...found.twins, ...(found.raidersTwin ? [found.raidersTwin] : [])].find((t) => t.row === view.twin) ?? found.twins[0]
	return { data, view, twin }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const found = await resolve(props)
	const card = found ? `${SITE_URL}/api/og?type=twins&${twinsQuery(found.view, { size: "wide" })}&v=${found.data.stamp}` : `${SITE_URL}/og-default-v2.png`
	const title = found ? `The ${found.data.season} Raiders and the ${found.twin.label} | Season twins | Raiders Rundown` : "Season twins | Raiders Rundown"
	return {
		title,
		description: DESCRIPTION,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${TWINS_PATH}` },
		openGraph: { type: "website", title, description: DESCRIPTION, url: `${SITE_URL}${TWINS_PATH}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [card] },
	}
}

export default async function SeasonTwinsShareLanding(props: Props) {
	const found = await resolve(props)
	const q = found ? twinsQuery(found.view) : ""
	const href = `${TWINS_PATH}${q ? `?${q}` : ""}#${TWINS_SECTION}`
	const image = found ? `/api/og?type=twins&${twinsQuery(found.view, { size: "wide" })}&v=${found.data.stamp}` : null

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<ShareRedirect href={href} />
			<section className="container py-10 sm:py-14">
				<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
					<Link href="/lab" className="hover:text-lab-ink">
						The Lab
					</Link>{" "}
					&middot; Season twins
				</p>
				<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{found ? `The ${found.data.season} Raiders and the ${found.twin.label}` : "Season twins"}</h1>
				{image ? (
					<Link href={href} className="mt-6 block max-w-3xl overflow-hidden rounded-2xl border border-lab-line bg-lab-tint">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={image} alt={`The ${found!.data.season} Raiders and the ${found!.twin.label}, laid over each other stat by stat`} width={1200} height={630} className="block h-auto w-full" />
					</Link>
				) : null}
				<p className="mt-6">
					<Link href={href} className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90">
						Open the interactive page
					</Link>
				</p>
			</section>
		</div>
	)
}
